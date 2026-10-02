import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer, type McpAssets } from '../src/mcp/server.js';
import { createMemoryQueue } from '../src/mcp/commands.js';

const EXAMPLE = readFileSync(join(import.meta.dirname, '..', 'src', 'example.xmlbif'), 'utf-8');

const assets: McpAssets = {
  listExamples: () => ['example.xmlbif'],
  readExample: name => (name === 'example.xmlbif' ? EXAMPLE : null),
  readMcpAppHtml: () => '<html></html>',
  readFile: () => null,
};

interface ToolResult {
  isError?: boolean;
  content: Array<{ type: string; text: string }>;
  structuredContent?: Record<string, unknown>;
}

let client: Client;

async function call(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  return (await client.callTool({ name, arguments: args })) as unknown as ToolResult;
}
const text = (r: ToolResult) => r.content.map(c => c.text).join('\n');

beforeEach(async () => {
  const server = createServer({ assets, queue: createMemoryQueue() });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'test', version: '1.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
});

afterEach(async () => {
  await client.close();
});

describe('MCP server: example loading', () => {
  it('load_network loads a known example', async () => {
    const r = await call('load_network', { source: 'example.xmlbif' });
    expect(r.isError).toBeFalsy();
    expect(text(r)).toContain('Dog-Problem');
  });

  it('load_network errors on an unknown example instead of loading another network', async () => {
    const r = await call('load_network', { source: 'nope.xml' });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/No example found for "nope\.xml".*Available examples: example\.xmlbif/);
  });

  it('query errors on an unknown example source and keeps no network', async () => {
    const r = await call('query', { source: 'nope.xml' });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('Available examples: example.xmlbif');
    const again = await call('query', {});
    expect(again.isError).toBe(true);
    expect(text(again)).toMatch(/No network loaded/);
  });

  it('interact load_example errors on an unknown name and keeps the current network', async () => {
    const q = await call('query', { source: 'example.xmlbif' });
    const uuid = q.structuredContent!.viewUUID as string;
    const r = await call('interact', { viewUUID: uuid, action: 'load_example', name: 'nope.xml' });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('Available examples: example.xmlbif');
    const ok = await call('interact', { viewUUID: uuid, action: 'clear_evidence' });
    expect(ok.isError).toBeFalsy();
    expect(text(ok)).toContain('P(');
  });

  it('interact load_example loads a known example', async () => {
    const r = await call('interact', { viewUUID: 'u1', action: 'load_example', name: 'example.xmlbif' });
    expect(r.isError).toBeFalsy();
    expect(text(r)).toContain('P(');
  });
});

describe('MCP server: evidence validation', () => {
  it('query accepts valid evidence', async () => {
    const r = await call('query', { source: 'example.xmlbif', evidence: { 'dog-out': 'true' } });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent!.evidence).toEqual({ 'dog-out': 'true' });
  });

  it('query rejects an unknown variable and lists the known ones', async () => {
    const r = await call('query', { source: 'example.xmlbif', evidence: { ghost: 'true' } });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/unknown variable "ghost".*dog-out/);
  });

  it('query rejects an unknown outcome and lists the valid ones', async () => {
    const r = await call('query', { source: 'example.xmlbif', evidence: { 'dog-out': 'maybe' } });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/unknown outcome "maybe".*Valid outcomes: true, false/);
  });

  it('a rejected query does not pollute session evidence', async () => {
    await call('query', { source: 'example.xmlbif', evidence: { 'dog-out': 'maybe' } });
    const r = await call('query', {});
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent!.evidence).toEqual({});
  });

  it('contradictory evidence is reported as an error and rolled back', async () => {
    // Make a deterministic network where A=T and B=F is impossible.
    const xml = `<BIF VERSION="0.3"><NETWORK><NAME>det</NAME>
      <VARIABLE TYPE="nature"><NAME>A</NAME><OUTCOME>T</OUTCOME><OUTCOME>F</OUTCOME></VARIABLE>
      <VARIABLE TYPE="nature"><NAME>B</NAME><OUTCOME>T</OUTCOME><OUTCOME>F</OUTCOME></VARIABLE>
      <DEFINITION><FOR>A</FOR><TABLE>0.5 0.5</TABLE></DEFINITION>
      <DEFINITION><FOR>B</FOR><GIVEN>A</GIVEN><TABLE>1 0 0 1</TABLE></DEFINITION>
      </NETWORK></BIF>`;
    const ok = await call('query', { source: xml, evidence: { A: 'T' } });
    expect(ok.isError).toBeFalsy();
    const r = await call('query', { evidence: { B: 'F' } });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/probability zero/);
    const after = await call('query', {});
    expect(after.structuredContent!.evidence).toEqual({ A: 'T' });
  });
});
