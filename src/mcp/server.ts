#!/usr/bin/env node
/**
 * MCP server for Nabab Bayesian Network inference.
 *
 * Supports --stdio (default) and HTTP modes.
 * The `query` tool renders an interactive network viewer (MCP App).
 * The `interact` tool lets the model (and viewer) modify evidence and enqueue updates.
 * The `poll_commands` tool lets the viewer long-poll for server→viewer commands.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { randomUUID } from 'crypto';
import { BayesianNetwork } from '../lib/network.js';
import { toXmlBif } from '../lib/xmlbif-writer.js';
import type { Evidence } from '../lib/types.js';
import type { CallToolResult, ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import { createQueue, type CommandQueue, type NetworkData } from './commands.js';

// ─── Paths ──────────────────────────────────────────────────────────

const MCP_APP_HTML = join(import.meta.dirname, '../../dist/mcp/index.html');
const examplesDir = resolve(import.meta.dirname, '../../../src/main/resources/com/ochafik/math/bayes');
const localExample = resolve(import.meta.dirname, '../../src/example.xmlbif');

// ─── Helpers ────────────────────────────────────────────────────────

function listExamples(): string[] {
  try {
    return readdirSync(examplesDir).filter(f => f.endsWith('.xml') || f.endsWith('.xmlbif'));
  } catch {
    return [];
  }
}

function loadExampleFile(name: string): string {
  return readFileSync(resolve(examplesDir, name), 'utf-8');
}

// ─── Server factory ─────────────────────────────────────────────────

export interface CreateServerOptions {
  queue?: CommandQueue;
}

export function createServer(opts: CreateServerOptions = {}): McpServer {
  const queue = opts.queue ?? createQueue();

  // Per-session state
  let currentNetwork: BayesianNetwork | null = null;
  let currentEvidence: Evidence = new Map();
  let currentXmlBif: string | null = null; // raw source for the viewer
  let viewUUID: string | null = null;

  function ensureViewUUID(): string {
    if (!viewUUID) viewUUID = randomUUID();
    return viewUUID;
  }

  function buildQueryResult(varNames?: string[]): NetworkData | null {
    if (!currentNetwork) return null;
    const result = currentNetwork.infer(currentEvidence);
    const variables = currentNetwork.variables.map(v => ({
      name: v.name,
      outcomes: [...v.outcomes],
      parents: currentNetwork!.getParents(v).map(p => p.name),
    }));
    const posteriors: Record<string, Record<string, number>> = {};
    const queryVars = varNames
      ? varNames.map(n => currentNetwork!.getVariable(n)).filter(Boolean)
      : currentNetwork.variables;
    for (const v of queryVars) {
      if (!v) continue;
      const dist = result.posteriors.get(v);
      if (dist) posteriors[v.name] = Object.fromEntries(dist);
    }
    return {
      viewUUID: ensureViewUUID(),
      network: { name: currentNetwork.name, variables },
      posteriors,
      evidence: Object.fromEntries(currentEvidence),
    };
  }

  function formatQueryText(data: NetworkData | null): string {
    if (!data) return 'No network loaded.';
    const lines: string[] = [];
    const evEntries = Object.entries(data.evidence);
    if (evEntries.length > 0) {
      lines.push(`Evidence: ${evEntries.map(([k, v]) => `${k}=${v}`).join(', ')}`, '');
    }
    for (const [name, dist] of Object.entries(data.posteriors)) {
      lines.push(`P(${name}):`);
      for (const [outcome, prob] of Object.entries(dist)) {
        lines.push(`  ${outcome}: ${(prob * 100).toFixed(2)}%`);
      }
    }
    return lines.join('\n');
  }

  const server = new McpServer({ name: 'nabab', version: '1.0.0' });
  const resourceUri = 'ui://nabab/mcp-app.html';

  // ── list_examples ─────────────────────────────────────────────────

  server.tool(
    'list_examples',
    'List available example Bayesian network files',
    {},
    async () => {
      const examples = listExamples();
      return {
        content: [{
          type: 'text',
          text: examples.length > 0
            ? `Available examples:\n${examples.map(e => `  - ${e}`).join('\n')}`
            : 'No example files found. Use load_network to load XMLBIF content directly.',
        }],
      };
    },
  );

  // ── load_network ──────────────────────────────────────────────────

  server.tool(
    'load_network',
    'Load a Bayesian network from XMLBIF content or an example file name',
    {
      source: z.string().describe('XMLBIF content string, or name of a bundled example file (e.g. "dogproblem.xml")'),
    },
    async ({ source }) => {
      try {
        let xmlbif: string;
        if (source.includes('<BIF') || source.includes('<NETWORK')) {
          xmlbif = source;
        } else {
          try {
            xmlbif = loadExampleFile(source);
          } catch {
            xmlbif = readFileSync(localExample, 'utf-8');
          }
        }
        currentNetwork = BayesianNetwork.fromXmlBif(xmlbif);
        currentXmlBif = xmlbif;
        currentEvidence = new Map();
        return {
          content: [{
            type: 'text',
            text: `Loaded network "${currentNetwork.name}" with ${currentNetwork.variables.length} variables:\n${currentNetwork.toString()}`,
          }],
        };
      } catch (e) {
        return { content: [{ type: 'text', text: `Error: ${e}` }], isError: true };
      }
    },
  );

  // ── set_evidence ──────────────────────────────────────────────────

  server.tool(
    'set_evidence',
    'Set observed evidence for a variable',
    {
      variable: z.string().describe('Variable name'),
      value: z.string().describe('Observed outcome value'),
    },
    async ({ variable, value }) => {
      if (!currentNetwork) {
        return { content: [{ type: 'text', text: 'No network loaded. Use load_network first.' }], isError: true };
      }
      const v = currentNetwork.getVariable(variable);
      if (!v) {
        return { content: [{ type: 'text', text: `Unknown variable: ${variable}. Available: ${currentNetwork.variables.map(v => v.name).join(', ')}` }], isError: true };
      }
      if (!v.outcomes.includes(value)) {
        return { content: [{ type: 'text', text: `Invalid value "${value}" for ${variable}. Valid: ${v.outcomes.join(', ')}` }], isError: true };
      }
      currentEvidence.set(variable, value);
      return { content: [{ type: 'text', text: `Evidence set: ${variable} = ${value}` }] };
    },
  );

  // ── clear_evidence ────────────────────────────────────────────────

  server.tool(
    'clear_evidence',
    'Clear all evidence or evidence for a specific variable',
    {
      variable: z.string().optional().describe('Variable name to clear (omit to clear all)'),
    },
    async ({ variable }) => {
      if (variable) {
        currentEvidence.delete(variable);
        return { content: [{ type: 'text', text: `Cleared evidence for ${variable}` }] };
      }
      currentEvidence = new Map();
      return { content: [{ type: 'text', text: 'All evidence cleared' }] };
    },
  );

  // ── get_network_info ──────────────────────────────────────────────

  server.tool(
    'get_network_info',
    'Get information about the currently loaded network',
    {},
    async () => {
      if (!currentNetwork) {
        return { content: [{ type: 'text', text: 'No network loaded.' }], isError: true };
      }
      const lines = [
        `Network: ${currentNetwork.name}`,
        `Variables (${currentNetwork.variables.length}):`,
        ...currentNetwork.variables.map(v => {
          const parents = currentNetwork!.getParents(v).map(p => p.name);
          return `  ${v.name} [${v.outcomes.join(', ')}]${parents.length ? ` <- ${parents.join(', ')}` : ''}`;
        }),
      ];
      if (currentEvidence.size > 0) {
        lines.push('', `Current evidence: ${[...currentEvidence].map(([k, v]) => `${k}=${v}`).join(', ')}`);
      }
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    },
  );

  // ── query (MCP App tool with UI) ──────────────────────────────────

  registerAppTool(server, 'query', {
    title: 'Query Bayesian Network',
    description: 'Query posterior probability distributions. Input: a network source (URL or inline XMLBIF/BIF content) and optional evidence. The viewer loads the network from the input args directly (supports streaming via partial input).',
    inputSchema: z.object({
      source: z.string().optional().describe('Network source: a file:// or http(s):// URL to a .bif/.xmlbif file, or inline XMLBIF/BIF content. Omit to query the already-loaded network.'),
      evidence: z.record(z.string()).optional().describe('Evidence to set: { variableName: outcomeValue }'),
      variables: z.array(z.string()).optional().describe('Variable names to query (omit for all)'),
    }),
    _meta: { ui: { resourceUri } },
  }, async ({ source, evidence: ev, variables }): Promise<CallToolResult> => {
    // Load network from source if provided
    if (source) {
      let content: string;
      if (/^https?:\/\/|^file:\/\//.test(source)) {
        // URL — fetch it server-side
        if (source.startsWith('file://')) {
          const filePath = decodeURIComponent(source.replace('file://', ''));
          content = readFileSync(filePath, 'utf-8');
        } else {
          const resp = await fetch(source);
          if (!resp.ok) return { content: [{ type: 'text', text: `Failed to fetch ${source}: ${resp.status}` }], isError: true };
          content = await resp.text();
        }
      } else if (source.includes('<BIF') || source.includes('<NETWORK') || source.trimStart().startsWith('network')) {
        content = source;
      } else {
        // Try as example file name
        try {
          content = loadExampleFile(source);
        } catch {
          return { content: [{ type: 'text', text: `Unknown source: ${source}` }], isError: true };
        }
      }
      try {
        currentNetwork = BayesianNetwork.parse(content);
        currentXmlBif = content;
        currentEvidence = new Map();
      } catch (e) {
        return { content: [{ type: 'text', text: `Parse error: ${e}` }], isError: true };
      }
    }

    if (!currentNetwork) {
      return { content: [{ type: 'text', text: 'No network loaded. Provide a source (URL or inline content).' }], isError: true };
    }

    // Apply evidence if provided
    if (ev) {
      for (const [k, v] of Object.entries(ev)) {
        currentEvidence.set(k, v);
      }
    }

    const structured = buildQueryResult(variables);
    const xmlbif = currentXmlBif ?? toXmlBif(currentNetwork);
    return {
      content: [{ type: 'text', text: formatQueryText(structured) }],
      structuredContent: {
        source: xmlbif,
        evidence: Object.fromEntries(currentEvidence),
        ...structured,
      } as Record<string, unknown>,
    };
  });

  // ── interact (model + viewer can call) ────────────────────────────

  server.tool(
    'interact',
    'Interact with the Bayesian network viewer: set/clear evidence, load examples. Returns updated posteriors and enqueues a viewer update.',
    {
      viewUUID: z.string().describe('View UUID from the query result'),
      action: z.enum(['set_evidence', 'clear_evidence', 'load_example']).describe('Action to perform'),
      variable: z.string().optional().describe('Variable name (for set/clear_evidence)'),
      value: z.string().optional().describe('Outcome value (for set_evidence)'),
      name: z.string().optional().describe('Example file name (for load_example)'),
    },
    async ({ viewUUID: vUUID, action, variable, value, name }): Promise<CallToolResult> => {
      viewUUID = vUUID; // sync viewUUID

      switch (action) {
        case 'set_evidence': {
          if (!currentNetwork || !variable || !value) {
            return { content: [{ type: 'text' as const, text: 'Missing network, variable, or value.' }], isError: true };
          }
          const v = currentNetwork.getVariable(variable);
          if (!v) return { content: [{ type: 'text' as const, text: `Unknown variable: ${variable}` }], isError: true };
          if (!v.outcomes.includes(value)) return { content: [{ type: 'text' as const, text: `Invalid value: ${value}` }], isError: true };
          currentEvidence.set(variable, value);
          break;
        }
        case 'clear_evidence':
          if (variable) currentEvidence.delete(variable);
          else currentEvidence = new Map();
          break;
        case 'load_example': {
          if (!name) return { content: [{ type: 'text' as const, text: 'Missing example name.' }], isError: true };
          try {
            let xmlbif: string;
            try {
              xmlbif = loadExampleFile(name);
            } catch {
              xmlbif = readFileSync(localExample, 'utf-8');
            }
            currentNetwork = BayesianNetwork.fromXmlBif(xmlbif);
            currentEvidence = new Map();
          } catch (e) {
            return { content: [{ type: 'text' as const, text: `Error: ${e}` }], isError: true };
          }
          break;
        }
      }

      const structured = buildQueryResult();
      if (structured) {
        await queue.enqueue(vUUID, { type: 'update', data: structured });
      }

      return {
        content: [{ type: 'text' as const, text: formatQueryText(structured) }],
        structuredContent: structured as unknown as Record<string, unknown>,
      };
    },
  );

  // ── poll_commands (app-only: viewer long-polls for updates) ────────

  registerAppTool(server, 'poll_commands', {
    title: 'Poll Commands',
    description: 'Long-poll for server-to-viewer commands.',
    inputSchema: z.object({
      viewUUID: z.string().describe('View UUID'),
    }),
    _meta: { ui: { resourceUri, visibility: ['app'] } },
  }, async ({ viewUUID: vUUID }): Promise<CallToolResult> => {
    const commands = await queue.poll(vUUID, 30_000);
    return {
      content: [{ type: 'text', text: `${commands.length} command(s)` }],
      structuredContent: { commands },
    };
  });

  // ── UI resource ───────────────────────────────────────────────────

  registerAppResource(
    server,
    resourceUri,
    resourceUri,
    { mimeType: RESOURCE_MIME_TYPE },
    async (): Promise<ReadResourceResult> => {
      if (!existsSync(MCP_APP_HTML)) {
        return {
          contents: [{
            uri: resourceUri,
            mimeType: RESOURCE_MIME_TYPE,
            text: '<html><body><p>MCP App not built. Run: npm run build:mcp</p></body></html>',
          }],
        };
      }
      const html = readFileSync(MCP_APP_HTML, 'utf-8');
      return { contents: [{ uri: resourceUri, mimeType: RESOURCE_MIME_TYPE, text: html }] };
    },
  );

  return server;
}

// ─── Transport modes ────────────────────────────────────────────────

async function startStdio() {
  const server = createServer();
  await server.connect(new StdioServerTransport());
  console.error('Nabab MCP server running on stdio');
}

async function startHttp() {
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
