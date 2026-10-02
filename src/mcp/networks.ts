/**
 * Network references and handles.
 *
 * Every MCP tool takes a `network` argument that can be inline XMLBIF/BIF/JSON
 * text, an http(s) URL, a bundled example name, or a handle (`bn_…`, a content
 * hash) returned by an earlier call. The registry resolves references to
 * parsed networks, caches them per session, and — when given a `SessionStore`
 * (Durable Object storage on Workers) — persists enough to rebuild a handle
 * after the process was evicted.
 */
import { BayesianNetwork } from '../lib/network.js';
import { toXmlBif } from '../lib/xmlbif-writer.js';
import { toJSON, fromJSON, type NetworkJSON } from '../lib/json-export.js';
import type { Distribution, Variable } from '../lib/types.js';
import { EXAMPLES, findExample } from './examples.js';

// ─── Platform assets ────────────────────────────────────────────────

/** Platform-injectable access to bundled files (example networks, app HTML). */
export interface McpAssets {
  /** Read a bundled example by catalog name (see examples.ts); null when unavailable. */
  readExample(name: string): Promise<string | null>;
  /** Built single-file MCP App viewer HTML; null when not built. */
  readMcpAppHtml(): Promise<string | null>;
  /** Read a local file (file:// sources); absent or null when unsupported. */
  readFile?(path: string): Promise<string | null>;
}

/** What is needed to rebuild a network after a restart. */
export type SourceRecord =
  | { kind: 'example'; name: string }
  | { kind: 'url'; url: string }
  | { kind: 'text'; text: string }
  | { kind: 'json'; json: string };

/** Persistence for handle → source (Durable Object storage on Workers). */
export interface SessionStore {
  get(handle: string): Promise<SourceRecord | undefined>;
  put(handle: string, record: SourceRecord): Promise<void>;
}

/** Records larger than this are kept in memory only (DO values are limited to ~2 MB). */
export const MAX_PERSISTED_BYTES = 1_800_000;
export const MAX_FETCH_BYTES = 5 * 1024 * 1024;
export const FETCH_TIMEOUT_MS = 15_000;

export class NetworkRefError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkRefError';
  }
}

// ─── Fetching ───────────────────────────────────────────────────────

/** Fetch a text document with a size cap and a timeout. */
export async function fetchLimited(
  url: string,
  maxBytes = MAX_FETCH_BYTES,
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    let resp: Response;
    try {
      resp = await fetch(url, { signal: ctrl.signal });
    } catch (e) {
      const why = ctrl.signal.aborted ? `timed out after ${timeoutMs / 1000}s` : (e instanceof Error ? e.message : String(e));
      throw new NetworkRefError(`Failed to fetch ${url}: ${why}`);
    }
    if (!resp.ok) throw new NetworkRefError(`Failed to fetch ${url}: HTTP ${resp.status}`);
    const tooBig = () => new NetworkRefError(`${url} is larger than ${Math.round(maxBytes / 1024 / 1024)} MB; refusing to download it`);
    const declared = Number(resp.headers.get('content-length') ?? '0');
    if (declared > maxBytes) throw tooBig();
    if (!resp.body) return await resp.text();
    const reader = resp.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel().catch(() => undefined);
          throw tooBig();
        }
        chunks.push(value);
      }
    } catch (e) {
      if (e instanceof NetworkRefError) throw e;
      const why = ctrl.signal.aborted ? `timed out after ${timeoutMs / 1000}s` : (e instanceof Error ? e.message : String(e));
      throw new NetworkRefError(`Failed to read ${url}: ${why}`);
    }
    const all = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) { all.set(c, off); off += c.byteLength; }
    return new TextDecoder().decode(all);
  } finally {
    clearTimeout(timer);
  }
}

// ─── Helpers ────────────────────────────────────────────────────────

export const HANDLE_RE = /^bn_[0-9a-f]{10}$/;

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** True when `ref` is network content rather than a name, URL or handle. */
export function looksInline(ref: string): boolean {
  const t = ref.trimStart();
  return t.startsWith('<') || t.startsWith('{') || /^network\b/.test(t) || t.startsWith('//') || t.startsWith('/*');
}

/** Parse XMLBIF, BIF or NetworkJSON text. */
export function parseNetworkText(text: string): BayesianNetwork {
  const t = text.trimStart();
  try {
    const network = t.startsWith('{') ? fromJSON(JSON.parse(t) as NetworkJSON) : BayesianNetwork.parse(text);
    if (network.variables.length === 0) throw new Error('no variables found');
    return network;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new NetworkRefError(`Could not parse the network (expected XMLBIF, BIF or nabab JSON): ${msg}`);
  }
}

// ─── Registry ───────────────────────────────────────────────────────

export interface NetworkEntry {
  handle: string;
  network: BayesianNetwork;
  /** Viewer-parsable source (XMLBIF/BIF text) when known; use `xmlbif()` otherwise. */
  sourceText?: string;
  /** Prior marginals, cached by the server on first use. */
  priors?: Map<Variable, Distribution>;
  xmlbif(): string;
}

const MAX_CACHED = 16;

export class NetworkRegistry {
  private readonly cache = new Map<string, NetworkEntry>();
  /** "example:<name>" / "url:<url>" → handle, to skip re-downloading and re-hashing. */
  private readonly refIndex = new Map<string, string>();

  constructor(
    private readonly assets: McpAssets,
    private readonly store?: SessionStore,
  ) {}

  private remember(entry: NetworkEntry): NetworkEntry {
    this.cache.delete(entry.handle);
    this.cache.set(entry.handle, entry);
    while (this.cache.size > MAX_CACHED) this.cache.delete(this.cache.keys().next().value!);
    return entry;
  }

  private makeEntry(handle: string, network: BayesianNetwork, sourceText?: string): NetworkEntry {
    let xml = sourceText;
    return {
      handle,
      network,
      sourceText,
      xmlbif() { return (xml ??= toXmlBif(network)); },
    };
  }

  private async persist(handle: string, record: SourceRecord): Promise<void> {
    if (!this.store) return;
    const size = record.kind === 'text' ? record.text.length : record.kind === 'json' ? record.json.length : 0;
    if (size > MAX_PERSISTED_BYTES) return;
    try {
      await this.store.put(handle, record);
    } catch {
      // Persistence is best effort; the in-memory entry still works.
    }
  }

  /** Register a network built in-process (build_network, learn_from_csv). */
  async register(network: BayesianNetwork): Promise<NetworkEntry> {
    const json = JSON.stringify(toJSON(network));
    const handle = 'bn_' + (await sha256Hex(json)).slice(0, 10);
    const known = this.cache.get(handle);
    if (known) return this.remember(known);
    const entry = this.remember(this.makeEntry(handle, network));
    await this.persist(handle, { kind: 'json', json });
    return entry;
  }

  /** Resolve any `network` reference to a parsed network. */
  async resolve(ref: string): Promise<NetworkEntry> {
    const trimmed = ref.trim();
    if (!trimmed) throw new NetworkRefError('`network` is empty. Pass a handle, example name, URL or inline XMLBIF/BIF.');

    if (HANDLE_RE.test(trimmed)) return this.resolveHandle(trimmed);

    if (looksInline(trimmed)) {
      return this.fromRecord({ kind: 'text', text: ref }, true);
    }
    if (/^https?:\/\//i.test(trimmed)) {
      return this.fromRecord({ kind: 'url', url: trimmed }, true);
    }
    if (/^file:\/\//i.test(trimmed)) {
      const path = decodeURIComponent(trimmed.replace(/^file:\/\//i, ''));
      const text = this.assets.readFile ? await this.assets.readFile(path) : null;
      if (text == null) throw new NetworkRefError(`Cannot read local file on this deployment: ${path}`);
      return this.fromRecord({ kind: 'text', text }, true);
    }
    if (/^bn_/.test(trimmed)) throw new NetworkRefError(`"${trimmed}" is not a valid network handle.`);

    const info = findExample(trimmed);
    if (!info || info.kind !== 'network') {
      const names = EXAMPLES.filter(e => e.kind === 'network').map(e => e.name);
      throw new NetworkRefError(
        `Unknown network "${trimmed.length > 60 ? trimmed.slice(0, 60) + '…' : trimmed}". Pass inline XMLBIF/BIF, an http(s) URL, a handle (bn_…) ` +
        `or one of the bundled examples: ${names.join(', ')}`,
      );
    }
    return this.fromRecord({ kind: 'example', name: info.name }, true);
  }

  private async resolveHandle(handle: string): Promise<NetworkEntry> {
    const hit = this.cache.get(handle);
    if (hit) return this.remember(hit);
    const record = await this.store?.get(handle).catch(() => undefined);
    if (record) return this.fromRecord(record, false, handle);
    throw new NetworkRefError(
      `Unknown network handle "${handle}". Handles only live as long as the session (and very large networks are not persisted); ` +
      'pass the network again (inline XMLBIF, URL or example name), or call build_network / learn_from_csv again.',
    );
  }

  private async fromRecord(record: SourceRecord, persist: boolean, knownHandle?: string): Promise<NetworkEntry> {
    const refKey = record.kind === 'example' ? `example:${record.name}` : record.kind === 'url' ? `url:${record.url}` : undefined;
    if (refKey && !knownHandle) {
      const h = this.refIndex.get(refKey);
      const cached = h ? this.cache.get(h) : undefined;
      if (cached) return this.remember(cached);
    }
    let text: string;
    switch (record.kind) {
      case 'example': {
        const t = await this.assets.readExample(record.name);
        if (t == null) throw new NetworkRefError(`Example "${record.name}" is not available on this deployment.`);
        text = t;
        break;
      }
      case 'url':
        text = await fetchLimited(record.url);
        break;
      case 'text':
        text = record.text;
        break;
      case 'json':
        text = record.json;
        break;
    }
    const handle = knownHandle ?? 'bn_' + (await sha256Hex(text)).slice(0, 10);
    const hit = this.cache.get(handle);
    if (hit) return this.remember(hit);
    const network = parseNetworkText(text);
    const sourceText = text.trimStart().startsWith('{') ? undefined : text;
    const entry = this.remember(this.makeEntry(handle, network, sourceText));
    if (refKey) this.refIndex.set(refKey, handle);
    if (persist) await this.persist(handle, record);
    return entry;
  }
}
