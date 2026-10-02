#!/usr/bin/env node
/**
 * MCP server factory for Nabab Bayesian Network inference.
 *
 * Transports live in platform-specific entries:
 *   - src/mcp/node.ts   (stdio, express HTTP — Node)
 *   - src/mcp/worker.ts (Cloudflare Workers fetch handler)
 * The `query` tool renders an interactive network viewer (MCP App).
 * The `interact` tool lets the model (and viewer) modify evidence and enqueue updates.
 * The `poll_commands` tool lets the viewer long-poll for server→viewer commands.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';
import { readFileSync, readdirSync } from 'fs';
import { resolve, join, basename } from 'path';
import { randomUUID } from 'crypto';
import { BayesianNetwork } from '../lib/network.js';
import { toXmlBif } from '../lib/xmlbif-writer.js';
import type { Evidence } from '../lib/types.js';
import { validateEvidence } from '../lib/evidence.js';
import type { CallToolResult, ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import { createQueue, type CommandQueue, type NetworkData } from './commands.js';

// ─── Assets ─────────────────────────────────────────────────────────

/**
 * Platform-injectable access to bundled files (example networks, app HTML).
 * Node entries use the filesystem; the Workers entry uses bundled text modules.
 */
export interface McpAssets {
  /** Names of bundled example network files. */
  listExamples(): string[];
  /** Read a bundled example by name; null when unknown. */
  readExample(name: string): string | null;
  /** Built single-file MCP App viewer HTML; null when not built. */
  readMcpAppHtml(): string | null;
  /** Read a local file (file:// sources); null when unsupported. */
  readFile(path: string): string | null;
}

function createNodeAssets(): McpAssets {
  const dirname = typeof import.meta.dirname === 'string' ? import.meta.dirname : '.';
  const mcpAppHtml = join(dirname, '../../dist/mcp/index.html');
  const examplesDir = resolve(dirname, '../examples');
  const localExample = resolve(dirname, '../example.xmlbif');
  const read = (p: string): string | null => {
    try {
      return readFileSync(p, 'utf-8');
    } catch {
      return null;
    }
  };
  return {
    listExamples() {
      try {
        const files = readdirSync(examplesDir).filter(f => f.endsWith('.xml') || f.endsWith('.xmlbif'));
        return ['example.xmlbif', ...files];
      } catch {
        return ['example.xmlbif'];
      }
    },
    readExample(name) {
      if (name === 'example.xmlbif') return read(localExample);
      // Only plain file names from the examples directory (no path traversal).
      if (name !== basename(name) || !/\.(xml|xmlbif)$/.test(name)) return null;
      return read(resolve(examplesDir, name));
    },
    readMcpAppHtml: () => read(mcpAppHtml),
    readFile: path => read(path),
  };
}

// ─── Server factory ─────────────────────────────────────────────────

export interface CreateServerOptions {
  queue?: CommandQueue;
  assets?: McpAssets;
}

export function createServer(opts: CreateServerOptions = {}): McpServer {
  const queue = opts.queue ?? createQueue();
  const assets = opts.assets ?? createNodeAssets();

  // Per-session state
  let currentNetwork: BayesianNetwork | null = null;
  let currentEvidence: Evidence = new Map();
  let currentXmlBif: string | null = null; // raw source for the viewer
  let viewUUID: string | null = null;

  function ensureViewUUID(): string {
    if (!viewUUID) viewUUID = randomUUID();
    return viewUUID;
  }

  function unknownExample(name: string): CallToolResult {
    const available = assets.listExamples();
    return {
      content: [{
        type: 'text',
        text: `No example found for "${name}". Available examples: ${available.length > 0 ? available.join(', ') : '(none)'}`,
      }],
      isError: true,
    };
  }

  function errorResult(e: unknown): CallToolResult {
    return { content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }], isError: true };
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
      const examples = assets.listExamples();
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
          const example = assets.readExample(source);
          if (example == null) return unknownExample(source);
          xmlbif = example;
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
      evidence: z.record(z.string(), z.string()).optional().describe('Evidence to set: { variableName: outcomeValue }'),
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
          const fileContent = assets.readFile(filePath);
          if (fileContent == null) {
            return { content: [{ type: 'text', text: `Cannot read local file on this deployment: ${filePath}` }], isError: true };
          }
          content = fileContent;
        } else {
          const resp = await fetch(source);
          if (!resp.ok) return { content: [{ type: 'text', text: `Failed to fetch ${source}: ${resp.status}` }], isError: true };
          content = await resp.text();
        }
      } else if (source.includes('<BIF') || source.includes('<NETWORK') || source.trimStart().startsWith('network')) {
        content = source;
      } else {
        // Try as example file name
        const example = assets.readExample(source);
        if (example == null) return unknownExample(source);
        content = example;
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

    // Apply evidence if provided (validated before touching session state)
    const previousEvidence = new Map(currentEvidence);
    if (ev) {
      const merged = new Map(currentEvidence);
      for (const [k, v] of Object.entries(ev)) merged.set(k, v);
      try {
        validateEvidence(currentNetwork.variables, merged);
      } catch (e) {
        return errorResult(e);
      }
      currentEvidence = merged;
    }

    let structured: NetworkData | null;
    try {
      structured = buildQueryResult(variables);
    } catch (e) {
      currentEvidence = previousEvidence; // e.g. contradictory evidence
      return errorResult(e);
    }
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
      const previousEvidence = new Map(currentEvidence);

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
            const xmlbif = assets.readExample(name);
            if (xmlbif == null) return unknownExample(name);
            currentNetwork = BayesianNetwork.fromXmlBif(xmlbif);
            currentXmlBif = xmlbif;
            currentEvidence = new Map();
          } catch (e) {
            return { content: [{ type: 'text' as const, text: `Error: ${e}` }], isError: true };
          }
          break;
        }
      }

      let structured: NetworkData | null;
      try {
        structured = buildQueryResult();
      } catch (e) {
        currentEvidence = previousEvidence; // e.g. contradictory evidence
        return errorResult(e);
      }
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
      const html = assets.readMcpAppHtml()
        ?? '<html><body><p>MCP App not built. Run: npm run build:mcp</p></body></html>';
      return { contents: [{ uri: resourceUri, mimeType: RESOURCE_MIME_TYPE, text: html }] };
    },
  );

  return server;
}