/**
 * Cloudflare Workers entry for the Nabab MCP server.
 *
 * Routes: /mcp (POST/DELETE), /help and / (help page, when no static asset matches)
 *
 * Every MCP session is hosted by its own Durable Object (`idFromName(sessionId)`):
 *   - `initialize` (no Mcp-Session-Id): this Worker mints the session id, routes
 *     to that session's object and passes the id in the x-nabab-new-session
 *     header; the object's transport uses it as the session id.
 *   - later requests are routed by their Mcp-Session-Id header.
 * See session-host.ts for what is persisted and how an evicted session resumes.
 *
 * Deploy: npm run deploy   (builds the viewer + MCP App, then wrangler deploy)
 */
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { SessionHost, NEW_SESSION_HEADER, jsonRpcError, withCors, type KeyValueStorage } from './session-host.js';
import { exampleAssetPath, findExample, EXAMPLES } from './examples.js';
import type { McpAssets } from './networks.js';
// Bundled as a text module at build time (see "rules" in wrangler.jsonc).
import appHtml from '../../dist/mcp/index.html';

// ─── Minimal Cloudflare structural types ────────────────────────────
// (avoids a hard dependency on @cloudflare/workers-types, whose globals
// clash with the DOM lib used by the viewer in the same tsconfig)

interface DurableObjectNamespaceLike {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
}

interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}

interface DurableObjectStateLike {
  storage: KeyValueStorage;
}

interface Env {
  NB: DurableObjectNamespaceLike;
  /** Static assets binding: the web viewer, /examples/* and /bench/*. */
  ASSETS: AssetsBinding;
}

/**
 * Exact-inference budget on Workers: a smaller clique than the library default
 * (32M entries) keeps one request within the CPU and memory limits.
 */
const WORKER_MAX_CLIQUE_ENTRIES = 4_000_000;

// ─── Assets ─────────────────────────────────────────────────────────

/**
 * Examples are NOT inlined in the bundle: the bnlearn models alone are ~15 MB.
 * They are served by the static-assets binding (the same files the viewer
 * fetches), keeping the Worker script small.
 */
function createWorkerAssets(binding: AssetsBinding): McpAssets {
  return {
    async readExample(name) {
      const info = findExample(name);
      if (!info) return null;
      const resp = await binding.fetch(new Request(`https://assets.invalid${exampleAssetPath(info)}`));
      if (!resp.ok) return null;
      const text = await resp.text();
      return /^\s*<!doctype html/i.test(text) ? null : text;
    },
    readMcpAppHtml: async () => appHtml,
  };
}

// ─── Durable Object: one MCP session ────────────────────────────────

export class NababMcpServerDO {
  private readonly host: SessionHost;

  constructor(state: DurableObjectStateLike, env: Env) {
    this.host = new SessionHost({
      storage: state.storage,
      assets: createWorkerAssets(env.ASSETS),
      limits: { maxCliqueEntries: WORKER_MAX_CLIQUE_ENTRIES },
    });
  }

  fetch(request: Request): Promise<Response> {
    return this.host.handle(request);
  }

  /** Session idle TTL elapsed: drop the session's storage. */
  async alarm(): Promise<void> {
    await this.host.expire();
  }
}

// ─── Routing ────────────────────────────────────────────────────────

const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function routeMcp(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }));
  if (request.method === 'GET') {
    // No server-initiated notifications: there is no stream to listen to.
    return withCors(new Response('This server does not offer an SSE stream; POST JSON-RPC to /mcp.', { status: 405, headers: { Allow: 'POST, DELETE, OPTIONS' } }));
  }

  const headers = new Headers(request.headers);
  headers.delete(NEW_SESSION_HEADER); // never trust a client-supplied value
  let sessionId = request.headers.get('mcp-session-id');

  if (sessionId) {
    if (!SESSION_ID_RE.test(sessionId)) {
      return jsonRpcError(404, -32001, `Session ${sessionId} not found. Send a new initialize request (without Mcp-Session-Id).`);
    }
  } else {
    if (request.method !== 'POST') return jsonRpcError(400, -32000, 'Missing Mcp-Session-Id header.');
    let body: unknown;
    try {
      body = await request.clone().json();
    } catch {
      return jsonRpcError(400, -32700, 'Invalid JSON body');
    }
    if (!isInitializeRequest(body)) {
      return jsonRpcError(400, -32000, 'Missing Mcp-Session-Id header and the body is not an initialize request.');
    }
    sessionId = crypto.randomUUID();
    headers.set(NEW_SESSION_HEADER, sessionId);
  }

  const stub = env.NB.get(env.NB.idFromName(sessionId));
  return stub.fetch(new Request(request, { headers }));
}

// ─── Help page ──────────────────────────────────────────────────────

function helpPage(request: Request, status = 200): Response {
  const baseUrl = new URL(request.url).origin;
  const nets = EXAMPLES.filter(e => e.kind === 'network').length;
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nabab</title>
<style>body{font-family:system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;line-height:1.5}
pre{background:#f4f4f4;padding:12px;border-radius:6px;white-space:pre-wrap}code{background:#f4f4f4;padding:1px 4px;border-radius:3px}
dt{font-weight:600;margin-top:.6em}dd{margin:0 0 0 1em}</style></head><body>
<h1>Nabab</h1>
<p>Bayesian network engine: model, query, explain and learn Bayesian networks, with an interactive viewer.</p>
<h2>Web viewer</h2>
<p><a href="${baseUrl}/">${baseUrl}/</a> - load examples, set evidence, drag-drop networks.</p>
<h2>MCP server</h2>
<p>Streamable HTTP endpoint:</p>
<pre>claude mcp add --transport http nabab ${baseUrl}/mcp</pre>
<p>Or point any MCP client at <code>${baseUrl}/mcp</code>. Tools take a <code>network</code> (inline XMLBIF/BIF, an http(s) URL, one of ${nets} bundled example names, or a handle returned by an earlier call) and the full <code>evidence</code> on every call; there is no hidden evidence state.</p>
<dl>
<dt>build_network</dt><dd>Build a network from a JSON spec: explicit tables, conditional rules, noisy-OR, gated-logistic and temporal variables. Returns a handle.</dd>
<dt>query</dt><dd>Posterior probabilities with change versus prior and P(evidence); renders the viewer. Exact, or sampling for big networks.</dd>
<dt>explain</dt><dd>Most probable explanation, or the k best.</dd>
<dt>what_to_observe</dt><dd>Value of information: which variable to observe next.</dd>
<dt>sensitivity</dt><dd>Which CPT parameters matter most for a query.</dd>
<dt>intervene</dt><dd>Causal do-operator and average causal effect.</dd>
<dt>learn_from_csv</dt><dd>Learn structure and parameters from categorical CSV.</dd>
<dt>describe_network</dt><dd>Structure, outcomes, CPTs and inference cost.</dd>
<dt>export_network</dt><dd>XMLBIF or JSON.</dd>
<dt>list_examples</dt><dd>Bundled networks (incl. bnlearn benchmarks) and datasets.</dd>
</dl>
<p>stdio transport (local):</p>
<pre>cd /path/to/nabab && npm run build:mcp && npm run mcp -- --stdio</pre>
<p style="color:#666;font-size:.9em">Each MCP session runs in its own Durable Object; network handles are persisted so they survive eviction, and an evicted session resumes transparently for up to 24 hours of inactivity. Endpoint: <code>${baseUrl}/mcp</code></p>
</body></html>`;
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// ─── Worker router ──────────────────────────────────────────────────
// Static assets (the web viewer) are served before the Worker runs; the
// Worker only sees paths that match no asset.

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === '/mcp') return routeMcp(request, env);
    if (pathname === '/' || pathname === '/help') return helpPage(request);
    return helpPage(request, 404);
  },
};
