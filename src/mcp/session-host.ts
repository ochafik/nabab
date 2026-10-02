/**
 * One MCP session, hosted inside a Durable Object (or any single-session
 * container with key/value storage).
 *
 * Each session gets its own host, so a heavy inference only blocks that
 * session. The host persists
 *   - the client's `initialize` request, so a session whose process was evicted
 *     can be resumed by replaying it into a fresh transport (the transport is
 *     then initialised under the SAME session id and the client never notices);
 *   - network sources by handle (see `SessionStore`), so handles keep working.
 * Everything else (parsed networks, priors, cost estimates) is a cache that is
 * rebuilt on demand.
 */
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createServer, type CreateServerOptions } from './server.js';
import type { McpAssets, SessionStore, SourceRecord } from './networks.js';

/** The slice of Durable Object storage used here. */
export interface KeyValueStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  list(options: { prefix: string; limit?: number }): Promise<Map<string, unknown>>;
  deleteAll(): Promise<void>;
  setAlarm?(scheduledTime: number): Promise<void>;
}

export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
export const NEW_SESSION_HEADER = 'x-nabab-new-session';
const MAX_PERSISTED_HANDLES = 200;
const INIT_KEY = 'init';
const ALARM_REFRESH_MS = 10 * 60 * 1000;

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, mcp-session-id, mcp-protocol-version, Accept, Authorization',
  'Access-Control-Expose-Headers': 'mcp-session-id',
};

export function withCors(resp: Response): Response {
  const out = new Response(resp.body, resp);
  for (const [k, v] of Object.entries(CORS_HEADERS)) out.headers.set(k, v);
  return out;
}

export function jsonRpcError(status: number, code: number, message: string): Response {
  return new Response(
    JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: null }),
    { status, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
  );
}

interface Live {
  sessionId: string;
  transport: WebStandardStreamableHTTPServerTransport;
  server: McpServer;
}

export interface SessionHostOptions {
  storage: KeyValueStorage;
  assets: McpAssets;
  limits?: CreateServerOptions['limits'];
}

export class SessionHost {
  private live: Live | null = null;
  private starting: Promise<Live | null> | null = null;
  private lastAlarm = 0;

  constructor(private readonly opts: SessionHostOptions) {}

  private store(): SessionStore {
    const { storage } = this.opts;
    return {
      get: async handle => storage.get<SourceRecord>(`net:${handle}`),
      put: async (handle, record) => {
        if (await storage.get(`net:${handle}`) !== undefined) return;
        const existing = await storage.list({ prefix: 'net:', limit: MAX_PERSISTED_HANDLES });
        if (existing.size >= MAX_PERSISTED_HANDLES) return; // stay in memory only
        await storage.put(`net:${handle}`, record);
      },
    };
  }

  private async open(sessionId: string): Promise<Live> {
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => sessionId,
      // Plain JSON responses: no long-lived SSE streams are held open on the
      // object, and a resumed session needs no stream state.
      enableJsonResponse: true,
      onsessionclosed: async () => {
        this.live = null;
        await this.opts.storage.deleteAll();
      },
    });
    const server = createServer({ assets: this.opts.assets, store: this.store(), limits: this.opts.limits });
    await server.connect(transport);
    return { sessionId, transport, server };
  }

  private async touch(): Promise<void> {
    const { storage } = this.opts;
    const now = Date.now();
    if (!storage.setAlarm || now - this.lastAlarm < ALARM_REFRESH_MS) return;
    this.lastAlarm = now;
    await storage.setAlarm(now + SESSION_TTL_MS);
  }

  /** Called by the Durable Object `alarm()` after SESSION_TTL_MS without a refresh. */
  async expire(): Promise<void> {
    this.live = null;
    await this.opts.storage.deleteAll();
  }

  /** Resume a session whose in-memory state is gone, from its stored `initialize` request. */
  private async resume(sessionId: string): Promise<Live | null> {
    const init = await this.opts.storage.get<unknown>(INIT_KEY);
    if (!isInitializeRequest(init)) return null;
    const live = await this.open(sessionId);
    // Replay the stored initialize request so the fresh transport (and server)
    // are initialised under the original session id.
    const replay = new Request('https://session.invalid/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify(init),
    });
    const resp = await live.transport.handleRequest(replay, { parsedBody: init });
    await resp.text();
    return resp.ok ? live : null;
  }

  async handle(request: Request): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
    const newSessionId = request.headers.get(NEW_SESSION_HEADER);
    const sessionId = request.headers.get('mcp-session-id');

    if (newSessionId) {
      // Initialize: the Worker minted the id and routed here.
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return jsonRpcError(400, -32700, 'Invalid JSON body');
      }
      if (!isInitializeRequest(body)) return jsonRpcError(400, -32600, 'Expected an initialize request.');
      const live = await this.open(newSessionId);
      this.live = live;
      const resp = await live.transport.handleRequest(request, { parsedBody: body });
      if (resp.ok) {
        await this.opts.storage.put(INIT_KEY, body);
        await this.touch();
      } else {
        this.live = null;
      }
      return withCors(resp);
    }

    if (!sessionId) return jsonRpcError(400, -32000, 'Missing Mcp-Session-Id header; send an initialize request first.');

    if (!this.live || this.live.sessionId !== sessionId) {
      this.starting ??= this.resume(sessionId).finally(() => { this.starting = null; });
      const live = await this.starting;
      if (!live || live.sessionId !== sessionId) {
        return jsonRpcError(404, -32001, `Session ${sessionId} not found or expired. Send a new initialize request (without Mcp-Session-Id) to start a new session.`);
      }
      this.live = live;
    }
    await this.touch();
    return withCors(await this.live.transport.handleRequest(request));
  }
}
