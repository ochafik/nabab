/**
 * Cloudflare Workers entry for the Nabab MCP server.
 *
 * Routes: /mcp (POST/GET/DELETE), / (landing page)
 *
 * All MCP traffic is routed to a single Durable Object ("mcp"), which holds
 * the session transports and the command queue — isolate-independent, so
 * sessions and server→viewer commands survive Cloudflare's edge load
 * balancing (no Redis needed).
 *
 * Deploy: npm run deploy   (builds the viewer + MCP App, then wrangler deploy)
 */
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createServer, type McpAssets } from './server.js';
import { createQueue, type CommandQueue } from './commands.js';
// Bundled as text modules at build time (see "rules" in wrangler.jsonc).
import appHtml from '../../dist/mcp/index.html';
import exampleXmlbif from '../example.xmlbif';

// ─── Minimal Durable Object structural types ────────────────────────
// (avoids a hard dependency on @cloudflare/workers-types, whose globals
// clash with the DOM lib used by the viewer in the same tsconfig)

interface DurableObjectNamespaceLike {
  idFromName(name: string): { name?: string };
  get(id: { name?: string }): { fetch(input: RequestInfo, init?: RequestInit): Promise<Response> };
}

interface Env {
  NB: DurableObjectNamespaceLike;
}

// ─── Assets ─────────────────────────────────────────────────────────

const assets: McpAssets = {
  listExamples: () => ['example.xmlbif'],
  readExample: name => (/^example(\.xmlbif)?$/i.test(name) ? exampleXmlbif : null),
  readMcpAppHtml: () => appHtml,
  readFile: () => null, // no filesystem on Workers; file:// sources unsupported
};

// ─── Durable Object: MCP sessions + command queue ───────────────────

export class NababMcpServerDO {
  private readonly transports = new Map<string, WebStandardStreamableHTTPServerTransport>();
  private queue: CommandQueue | null = null;

  async fetch(request: Request): Promise<Response> {
    if (!this.queue) this.queue = createQueue();
    return handleMcp(request, this.transports, this.queue);
  }
}

// ─── MCP streamable-HTTP handling ───────────────────────────────────

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, mcp-session-id, Accept',
  'Access-Control-Expose-Headers': 'mcp-session-id',
};

function jsonRpcError(status: number, code: number, message: string): Response {
  return new Response(
    JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: null }),
    { status, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
  );
}

async function handleMcp(
  request: Request,
  transports: Map<string, WebStandardStreamableHTTPServerTransport>,
  queue: CommandQueue,
): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const sessionId = request.headers.get('mcp-session-id') ?? undefined;

  let transport = sessionId ? transports.get(sessionId) : undefined;
  if (transport) {
    return transport.handleRequest(request);
  }

  if (!sessionId && request.method === 'POST') {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonRpcError(400, -32700, 'Invalid JSON body');
    }
    if (isInitializeRequest(body)) {
      transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessioninitialized: sid => { transports.set(sid, transport!); },
      });
      transport.onclose = () => {
        const sid = transport!.sessionId;
        if (sid) transports.delete(sid);
      };
      const server = createServer({ queue, assets });
      await server.connect(transport);
      return transport.handleRequest(request, { parsedBody: body });
    }
  }

  const message = sessionId
    ? `Session ${sessionId} not found (server restarted or session expired). Re-send initialize.`
    : 'Missing Mcp-Session-Id header and body is not an initialize request.';
  return jsonRpcError(sessionId ? 404 : 400, -32001, message);
}

// ─── Help page ──────────────────────────────────────────────────────

function helpPage(request: Request, status = 200): Response {
  const baseUrl = new URL(request.url).origin;
  const html = `<!DOCTYPE html>
<html><body style="font-family:system-ui,sans-serif;max-width:640px;margin:50px auto;padding:0 20px">
<h1>Nabab</h1>
<p>Bayesian network inference engine with an interactive viewer.</p>
<h2>Web viewer</h2>
<p><a href="${baseUrl}/">${baseUrl}/</a> — load examples, set evidence, drag-drop networks.</p>
<h2>MCP server</h2>
<p>Streamable HTTP endpoint:</p>
<pre style="background:#f4f4f4;padding:12px;border-radius:6px;white-space:pre-wrap">claude mcp add --transport http nabab ${baseUrl}/mcp</pre>
<p>Or point any MCP client at <code>${baseUrl}/mcp</code>.</p>
<p>stdio transport (local):</p>
<pre style="background:#f4f4f4;padding:12px;border-radius:6px">cd /path/to/nabab && npm run build:mcp && npm run mcp -- --stdio</pre>
<p style="color:#888;font-size:0.9em">Sessions &amp; command queue: Durable Object &middot; Endpoint: <code>${baseUrl}/mcp</code></p>
</body></html>`;
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// ─── Worker router ──────────────────────────────────────────────────
// Static assets (the web viewer) are served before the Worker runs; the
// Worker only sees paths that match no asset.

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === '/mcp') {
      const stub = env.NB.get(env.NB.idFromName('mcp'));
      return stub.fetch(request);
    }
    if (pathname === '/' || pathname === '/help') return helpPage(request);
    return helpPage(request, 404);
  },
};
