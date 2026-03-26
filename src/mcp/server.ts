#!/usr/bin/env node
/**
 * MCP server for Nabab Bayesian Network inference.
 *
 * Provides tools for loading networks, setting evidence, and querying posteriors.
 * Also serves the interactive viewer as an MCP App resource (iframe-embeddable).
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFileSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { BayesianNetwork } from '../lib/network.js';
import type { Evidence } from '../lib/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── State ───────────────────────────────────────────────────────────

let currentNetwork: BayesianNetwork | null = null;
let currentEvidence: Evidence = new Map();


// ─── Bundled examples ────────────────────────────────────────────────

const examplesDir = resolve(__dirname, '../../../src/main/resources/com/ochafik/math/bayes');
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

// Try the local example
const localExample = resolve(__dirname, '../../src/example.xmlbif');

// ─── MCP Server ──────────────────────────────────────────────────────

const server = new McpServer({
  name: 'nabab',
  version: '1.0.0',
});

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
        // Try as example file name
        try {
          xmlbif = loadExampleFile(source);
        } catch {
          // Try local example
          xmlbif = readFileSync(localExample, 'utf-8');
        }
      }
      currentNetwork = BayesianNetwork.fromXmlBif(xmlbif;
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

server.tool(
  'query',
  'Query posterior probability distributions given current evidence',
  {
    variables: z.array(z.string()).optional().describe('Variable names to query (omit for all)'),
  },
  async ({ variables: varNames }) => {
    if (!currentNetwork) {
      return { content: [{ type: 'text', text: 'No network loaded.' }], isError: true };
    }
    try {
      const result = currentNetwork.infer(currentEvidence);
      const lines: string[] = [];

      if (currentEvidence.size > 0) {
        lines.push(`Evidence: ${[...currentEvidence].map(([k, v]) => `${k}=${v}`).join(', ')}`);
        lines.push('');
      }

      const queryVars = varNames
        ? varNames.map(n => currentNetwork!.getVariable(n)).filter(Boolean)
        : currentNetwork.variables;

      for (const v of queryVars) {
        if (!v) continue;
        const dist = result.posteriors.get(v);
        if (!dist) continue;
        const entries = [...dist].map(([outcome, prob]) => `  ${outcome}: ${(prob * 100).toFixed(2)}%`);
        lines.push(`P(${v.name}):`);
        lines.push(...entries);
      }

      return { content: [{ type: 'text', text: lines.join('\n') }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Inference error: ${e}` }], isError: true };
    }
  },
);

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

// ─── Start ───────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Nabab MCP server running on stdio');
}

main().catch(console.error);
