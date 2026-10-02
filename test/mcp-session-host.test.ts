import { describe, it, expect } from 'vitest';
import { SessionHost, NEW_SESSION_HEADER, type KeyValueStorage } from '../src/mcp/session-host.js';
import { createNodeAssets } from '../src/mcp/node-assets.js';

/** In-memory stand-in for Durable Object storage (survives "evictions" of the host). */
function memoryStorage(): KeyValueStorage & { data: Map<string, unknown>; alarm?: number } {
  const data = new Map<string, unknown>();
  const s = {
    data,
    alarm: undefined as number | undefined,
    async get<T>(key: string) { return data.get(key) as T | undefined; },
    async put(key: string, value: unknown) { data.set(key, structuredClone(value)); },
    async list({ prefix, limit }: { prefix: string; limit?: number }) {
      const out = new Map<string, unknown>();
      for (const [k, v] of data) {
        if (k.startsWith(prefix) && out.size < (limit ?? Infinity)) out.set(k, v);
      }
      return out;
    },
    async deleteAll() { data.clear(); },
    async setAlarm(t: number) { s.alarm = t; },
  };
  return s;
}

const HEADERS = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };

function rpc(body: unknown, extra: Record<string, string> = {}, method = 'POST'): Request {
  return new Request('https://example.com/mcp', {
    method,
    headers: { ...HEADERS, ...extra },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  });
}

const INIT = {
  jsonrpc: '2.0', id: 1, method: 'initialize',
  params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '1' } },
};

function newHost(storage: KeyValueStorage) {
  return new SessionHost({ storage, assets: createNodeAssets() });
}

describe('SessionHost (one Durable Object per MCP session)', () => {
  it('initializes with the id minted by the router and serves tool calls', async () => {
    const host = newHost(memoryStorage());
    const init = await host.handle(rpc(INIT, { [NEW_SESSION_HEADER]: 'sess-1' }));
    expect(init.status).toBe(200);
    expect(init.headers.get('mcp-session-id')).toBe('sess-1');
    expect(init.headers.get('access-control-allow-origin')).toBe('*');

    const list = await host.handle(rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, { 'mcp-session-id': 'sess-1' }));
    expect(list.status).toBe(200);
    const names = ((await list.json()) as { result: { tools: Array<{ name: string }> } }).result.tools.map(t => t.name);
    expect(names).toContain('build_network');
  });

  it('resumes after eviction: new host + same storage, no re-initialize', async () => {
    const storage = memoryStorage();
    const a = newHost(storage);
    await a.handle(rpc(INIT, { [NEW_SESSION_HEADER]: 'sess-2' }));
    const call = (host: SessionHost, id: number, name: string, args: Record<string, unknown>) =>
      host.handle(rpc({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }, { 'mcp-session-id': 'sess-2' }));
    const built = (await (await call(a, 3, 'learn_from_csv', { csv: 'bench/weather.csv' })).json()) as {
      result: { structuredContent: { network: string } };
    };
    const handle = built.result.structuredContent.network;
    expect(handle).toMatch(/^bn_/);

    const b = newHost(storage); // evicted: all in-memory state is gone
    const resp = await call(b, 4, 'query', { network: handle, evidence: { Rain: 'Yes' }, variables: ['WetGrass'] });
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { result: { isError?: boolean; content: Array<{ text: string }> } };
    expect(body.result.isError).toBeFalsy();
    expect(body.result.content[0].text).toContain('WetGrass');
  });

  it('answers 404 for unknown sessions so clients re-initialize', async () => {
    const host = newHost(memoryStorage());
    const r = await host.handle(rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { 'mcp-session-id': 'ghost' }));
    expect(r.status).toBe(404);
    expect(((await r.json()) as { error: { message: string } }).error.message).toMatch(/Send a new initialize/);
  });

  it('rejects requests without a session id and non-initialize bodies on the init path', async () => {
    const host = newHost(memoryStorage());
    expect((await host.handle(rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }))).status).toBe(400);
    expect((await host.handle(rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { [NEW_SESSION_HEADER]: 'x' }))).status).toBe(400);
  });

  it('DELETE ends the session and clears its storage', async () => {
    const storage = memoryStorage();
    const host = newHost(storage);
    await host.handle(rpc(INIT, { [NEW_SESSION_HEADER]: 'sess-3' }));
    expect(storage.data.has('init')).toBe(true);
    const del = await host.handle(rpc(undefined, { 'mcp-session-id': 'sess-3' }, 'DELETE'));
    expect(del.status).toBe(200);
    expect(storage.data.size).toBe(0);
    const after = await newHost(storage).handle(rpc({ jsonrpc: '2.0', id: 9, method: 'tools/list' }, { 'mcp-session-id': 'sess-3' }));
    expect(after.status).toBe(404);
  });

  it('schedules an idle-expiry alarm and drops storage when it fires', async () => {
    const storage = memoryStorage();
    const host = newHost(storage);
    await host.handle(rpc(INIT, { [NEW_SESSION_HEADER]: 'sess-4' }));
    expect(storage.alarm).toBeGreaterThan(Date.now());
    await host.expire();
    expect(storage.data.size).toBe(0);
  });

  it('answers CORS preflights', async () => {
    const r = await newHost(memoryStorage()).handle(new Request('https://example.com/mcp', { method: 'OPTIONS' }));
    expect(r.status).toBe(204);
    expect(r.headers.get('access-control-expose-headers')).toContain('mcp-session-id');
  });
});
