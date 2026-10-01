#!/usr/bin/env node
/**
 * Node entry for the Nabab MCP server: --stdio (default) or --http.
 *
 * `npm run mcp` runs this file.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'crypto';
import { createServer } from './server.js';
import { createQueue } from './commands.js';

// ─── Transport modes ────────────────────────────────────────────────

async function startStdio() {
  const server = createServer();
  await server.connect(new StdioServerTransport());
  console.error('Nabab MCP server running on stdio');
}

async function startHttp() {
  // express/cors are devDependencies on purpose: they are only used by this
  // local/dev HTTP mode (stdio and the Vercel/Workers deployments do not need
  // them), and the published npm package ships only dist/lib.
  const { default: express } = await import('express');
  const { default: cors } = await import('cors');

  const port = parseInt(process.env.PORT ?? '3001', 10);
  const queue = createQueue();
  const transports = new Map<string, StreamableHTTPServerTransport>();

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.all('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
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

    res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: sessionId ? 'Session not found' : 'Send initialize first' },
      id: null,
    });
  });

  app.get('/', (_req, res) => {
    res.type('text/plain').send(
      `Nabab MCP Server\n\nEndpoint: http://localhost:${port}/mcp\n` +
      `Redis: ${process.env.UPSTASH_REDIS_REST_URL ? 'connected' : 'not configured (in-memory queue)'}\n`,
    );
  });

  const httpServer = app.listen(port, () => {
    console.log(`Nabab MCP server listening on http://localhost:${port}/mcp`);
  });

  const shutdown = () => {
    console.log('\nShutting down...');
    httpServer.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// ─── Entry point ────────────────────────────────────────────────────

async function main() {
  if (process.argv.includes('--stdio')) {
    await startStdio();
  } else {
    await startHttp();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
