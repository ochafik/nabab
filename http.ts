/**
 * Vercel serverless handler for Nabab MCP server (Streamable HTTP transport).
 *
 * Routes: /mcp (POST/GET/DELETE), /
 * State: MCP sessions in module-level Map (survives warm invocations).
 * Command queue: Redis (@upstash/redis) for cross-Lambda; in-memory fallback.
 */
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServer } from './src/mcp/server.js';
import { createQueue } from './src/mcp/commands.js';

type Req = IncomingMessage & { body?: unknown; url?: string };
type Res = ServerResponse;

const queue = createQueue();
const transports = new Map<string, StreamableHTTPServerTransport>();

export default async function handler(req: Req, res: Res): Promise<void> {
  const proto = (req.headers['x-forwarded-proto'] as string) ?? 'https';
  const host = (req.headers['x-forwarded-host'] as string) ?? (req.headers.host as string) ?? 'localhost';
  const baseUrl = `${proto}://${host}`;
  const url = new URL(req.url ?? '/', baseUrl);

  if (url.pathname === '/mcp') {
    await handleMcp(req, res);
    return;
  }

  if (url.pathname === '/') {
    const redisStatus = (process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL)
      ? 'connected' : 'not configured (in-memory)';
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html>
<html><body style="font-family:system-ui,sans-serif;max-width:600px;margin:50px auto;padding:0 20px">
<h1>Nabab MCP Server</h1>
<p>Bayesian network inference engine with interactive MCP App viewer.</p>
<h2>Install</h2>
<p>HTTP transport (this deployment):</p>
<pre style="background:#f4f4f4;padding:12px;border-radius:6px">claude mcp add --transport http nabab ${baseUrl}/mcp</pre>
<p>stdio transport (local):</p>
<pre style="background:#f4f4f4;padding:12px;border-radius:6px">cd /path/to/nabab && npm run build:mcp && npx tsx src/mcp/server.ts --stdio</pre>
<p style="color:#888;font-size:0.9em">Redis: <strong>${redisStatus}</strong> &middot; Endpoint: <code>${baseUrl}/mcp</code></p>
</body></html>`);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
}

async function handleMcp(req: Req, res: Res): Promise<void> {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id, Accept');
  res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  try {
    let transport = sessionId ? transports.get(sessionId) : undefined;

    if (transport) {
      await transport.handleRequest(req, res, req.body);
      return;
    }

    if (!sessionId && req.method === 'POST' && isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: sid => { transports.set(sid, transport!); },
      });
      transport.onclose = () => {
        const sid = transport!.sessionId;
        if (sid) transports.delete(sid);
      };
      const server = createServer({ queue });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    const msg = sessionId
      ? `Session ${sessionId} not found on this instance (cold start or scale-out). Re-send initialize.`
      : 'Missing Mcp-Session-Id header and body is not an initialize request.';
    console.warn('[mcp] 400:', msg);
    res.writeHead(sessionId ? 404 : 400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      jsonrpc: '2.0',
      error: { code: -32001, message: msg },
      id: null,
    }));
  } catch (error) {
    console.error('MCP handler error:', error);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32603, message: `Internal server error: ${error instanceof Error ? error.message : String(error)}` },
        id: null,
      }));
    }
  }
}
