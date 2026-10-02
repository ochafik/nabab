import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer, type SessionStore, type SourceRecord } from '../src/mcp/server.js';
import { createNodeAssets } from '../src/mcp/node-assets.js';
import { fetchLimited, MAX_FETCH_BYTES } from '../src/mcp/networks.js';
import { BayesianNetwork } from '../src/lib/network.js';

interface ToolResult {
  isError?: boolean;
  content: Array<{ type: string; text: string }>;
  structuredContent?: Record<string, unknown>;
}

const assets = createNodeAssets();
let client: Client;

async function connect(opts: { store?: SessionStore } = {}): Promise<Client> {
  const server = createServer({ assets, ...opts });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const c = new Client({ name: 'test', version: '1.0.0' });
  await Promise.all([server.connect(serverTransport), c.connect(clientTransport)]);
  return c;
}

async function callOn(c: Client, name: string, args: Record<string, unknown>): Promise<ToolResult> {
  return (await c.callTool({ name, arguments: args })) as unknown as ToolResult;
}
const call = (name: string, args: Record<string, unknown>) => callOn(client, name, args);
const text = (r: ToolResult) => r.content.map(c => c.text).join('\n');

beforeEach(async () => {
  client = await connect();
});

afterEach(async () => {
  await client.close();
  vi.unstubAllGlobals();
});

const SPRINKLER = {
  name: 'Sprinkler',
  variables: [
    { name: 'Rain', outcomes: ['yes', 'no'], cpt: [0.2, 0.8] },
    {
      name: 'Sprinkler', outcomes: ['on', 'off'], parents: ['Rain'],
      cpt: {
        type: 'conditional',
        rows: [
          { when: { Rain: 'yes' }, probs: { on: 0.01, off: 0.99 } },
          { when: { Rain: 'no' }, probs: { on: 0.4, off: 0.6 } },
        ],
      },
    },
    {
      name: 'WetGrass', outcomes: ['wet', 'dry'], parents: ['Rain', 'Sprinkler'],
      cpt: {
        type: 'noisyOr', leak: 0, weights: { Rain: 0.9, Sprinkler: 0.8 },
        activeOutcomes: { Rain: 'yes', Sprinkler: 'on' }, nullOutcome: 'dry',
      },
    },
  ],
};

const handleOf = (r: ToolResult): string => {
  const n = r.structuredContent!.network;
  return typeof n === 'string' ? n : (n as { handle: string }).handle;
};

async function build(spec: unknown = SPRINKLER): Promise<string> {
  const r = await call('build_network', { spec });
  expect(r.isError, text(r)).toBeFalsy();
  return handleOf(r);
}

function prob(r: ToolResult, variable: string, outcome: string): number {
  const post = r.structuredContent!.posteriors as Record<string, Record<string, number>>;
  return post[variable][outcome];
}

describe('tool list', () => {
  it('exposes the modelling toolbox and no stateful evidence tools', async () => {
    const names = (await client.listTools()).tools.map(t => t.name).sort();
    expect(names).toEqual([
      'build_network', 'describe_network', 'explain', 'export_network', 'intervene',
      'learn_from_csv', 'list_examples', 'query', 'sensitivity', 'what_to_observe',
    ]);
  });

  it('query is the UI-bearing tool', async () => {
    const q = (await client.listTools()).tools.find(t => t.name === 'query')!;
    expect(JSON.stringify(q._meta)).toContain('ui://nabab/mcp-app.html');
    const res = await client.readResource({ uri: 'ui://nabab/mcp-app.html' });
    expect(res.contents).toHaveLength(1);
  });
});

describe('list_examples and network references', () => {
  it('lists the viewer examples, bnlearn models and datasets', async () => {
    const r = await call('list_examples', {});
    const t = text(r);
    for (const n of ['dogproblem.xmlbif', 'alarm.xml', 'bench/asia.bif', 'bench/link.bif', 'bench/weather.csv']) {
      expect(t).toContain(n);
    }
  });

  it('accepts example names with or without extension / bench prefix', async () => {
    for (const name of ['dogproblem.xmlbif', 'bench/asia.bif', 'asia', 'Bench/ASIA.bif']) {
      const r = await call('describe_network', { network: name });
      expect(r.isError, `${name}: ${text(r)}`).toBeFalsy();
    }
  });

  it('errors on an unknown example, listing the choices', async () => {
    const r = await call('query', { network: 'nope.xml' });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/Unknown network "nope\.xml".*dogproblem\.xmlbif/);
  });

  it('errors on an unknown handle with advice', async () => {
    const r = await call('query', { network: 'bn_0123456789' });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/Unknown network handle/);
  });

  it('errors on unparsable inline content', async () => {
    const r = await call('query', { network: '<BIF><garbage' });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/Could not parse the network/);
  });

  it('accepts inline XMLBIF and returns a reusable handle', async () => {
    const xml = (await assets.readExample('dogproblem.xmlbif'))!;
    const d = await call('describe_network', { network: xml });
    const handle = handleOf(d);
    expect(handle).toMatch(/^bn_[0-9a-f]{10}$/);
    const q = await call('query', { network: handle, evidence: { 'dog-out': 'true' } });
    expect(q.isError).toBeFalsy();
    // Same content, same handle.
    expect(handleOf(await call('describe_network', { network: 'dogproblem.xmlbif' }))).toBe(handle);
  });

  it('fetches URLs, with a size cap and a timeout', async () => {
    const xml = (await assets.readExample('dogproblem.xmlbif'))!;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(xml)));
    const r = await call('describe_network', { network: 'https://example.com/dog.xmlbif' });
    expect(r.isError, text(r)).toBeFalsy();

    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { headers: { 'content-length': String(MAX_FETCH_BYTES + 1) } })));
    await expect(fetchLimited('https://example.com/big')).rejects.toThrow(/larger than 5 MB/);

    // Streamed body without content-length is capped too.
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({
      pull(c) { c.enqueue(new Uint8Array(1024 * 1024)); },
    }))));
    await expect(fetchLimited('https://example.com/stream')).rejects.toThrow(/larger than 5 MB/);

    vi.stubGlobal('fetch', vi.fn((_u: string, init: RequestInit) => new Promise((_res, rej) => {
      init.signal!.addEventListener('abort', () => rej(new Error('aborted')));
    })));
    await expect(fetchLimited('https://example.com/slow', 1024, 20)).rejects.toThrow(/timed out/);

    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })));
    const bad = await call('describe_network', { network: 'https://example.com/missing' });
    expect(bad.isError).toBe(true);
    expect(text(bad)).toContain('HTTP 404');
  });
});

describe('build_network', () => {
  it('builds a network, returns a handle, structure and prior marginals', async () => {
    const r = await call('build_network', { spec: SPRINKLER });
    expect(r.isError, text(r)).toBeFalsy();
    expect(text(r)).toMatch(/bn_[0-9a-f]{10}/);
    expect(text(r)).toContain('WetGrass [wet, dry] <- Rain, Sprinkler (noisyOr)');
    expect(text(r)).toContain('Prior marginals');
    const q = await call('query', { network: handleOf(r), variables: ['WetGrass'] });
    // The exported XMLBIF re-parses to the same model.
    const net = BayesianNetwork.fromXmlBif((await call('export_network', { network: handleOf(r) })).content[0].text);
    expect(prob(q, 'WetGrass', 'wet')).toBeCloseTo(net.query('WetGrass').get('wet')!, 10);
  });

  it('is deterministic: the same spec gives the same handle', async () => {
    expect(await build()).toBe(await build());
  });

  it('accepts explicit tables (flat and per-row) and priors as maps', async () => {
    const spec = {
      variables: [
        { name: 'A', outcomes: ['a1', 'a2'], cpt: { a1: 0.5, a2: 0.5 } },
        { name: 'B', outcomes: ['b1', 'b2'], parents: ['A'], cpt: [[0.9, 0.1], [0.2, 0.8]] },
        { name: 'C', outcomes: ['c1', 'c2'], parents: ['A', 'B'], cpt: [1, 0, 0.5, 0.5, 0.3, 0.7, 0, 1] },
      ],
    };
    const h = await build(spec);
    const q = await call('query', { network: h, evidence: { A: 'a2' }, variables: ['B'] });
    expect(prob(q, 'B', 'b2')).toBeCloseTo(0.8, 10);
  });

  it('supports uniform and conditional-with-default CPTs', async () => {
    const spec = {
      variables: [
        { name: 'A', outcomes: ['x', 'y', 'z'], cpt: { type: 'uniform' } },
        {
          name: 'B', outcomes: ['t', 'f'], parents: ['A'],
          cpt: { type: 'conditional', rows: [{ when: { A: 'x' }, probs: [1, 0] }], default: { t: 0.5, f: 0.5 } },
        },
      ],
    };
    const q = await call('query', { network: await build(spec), evidence: { A: 'x' } });
    expect(prob(q, 'B', 't')).toBeCloseTo(1, 10);
  });

  it('builds gated-logistic CPTs with gates and shifts', async () => {
    const spec = {
      variables: [
        { name: 'Funded', outcomes: ['no', 'yes'], cpt: [0.5, 0.5] },
        { name: 'Skill', outcomes: ['low', 'high'], cpt: [0.5, 0.5] },
        {
          name: 'Ships', outcomes: ['never', 'late', 'ontime'], parents: ['Funded', 'Skill'],
          cpt: {
            type: 'gatedLogistic', nullOutcome: 'never', base: { never: 1, late: 1, ontime: 1 },
            gate: [[{ parent: 'Funded', outcomes: ['yes'] }]],
            shifts: [{ parent: 'Skill', outcome: 'high', logOdds: { ontime: 2, late: -1 } }],
          },
        },
      ],
    };
    const h = await build(spec);
    const unfunded = await call('query', { network: h, evidence: { Funded: 'no', Skill: 'high' }, variables: ['Ships'] });
    expect(prob(unfunded, 'Ships', 'never')).toBeCloseTo(1, 10);
    const funded = await call('query', { network: h, evidence: { Funded: 'yes', Skill: 'high' }, variables: ['Ships'] });
    expect(prob(funded, 'Ships', 'ontime')).toBeGreaterThan(prob(funded, 'Ships', 'late'));
    expect(prob(funded, 'Ships', 'never')).toBeGreaterThan(0.05);
  });

  it('builds temporal variables with hazard priors and delays', async () => {
    const buckets = ['Q1', 'Q2', 'Q3'];
    const spec = {
      variables: [
        {
          name: 'Design', temporal: { outcomes: ['done'], buckets },
          cpt: { type: 'hazardPrior', pOccur: 0.9, hazard: [1, 1, 1] },
        },
        {
          name: 'Launch', temporal: { outcomes: ['done'], buckets }, parents: ['Design'],
          cpt: {
            type: 'gatedLogistic',
            gate: [[{ parent: 'Design', outcomes: ['done@Q1', 'done@Q2', 'done@Q3'] }]],
            base: { pOccur: 0.8, hazard: [1, 1, 1] },
            delays: [{ parent: 'Design', delay: 1 }],
          },
        },
      ],
    };
    const h = await build(spec);
    const d = await call('describe_network', { network: h });
    expect(text(d)).toContain('none, done@Q1, done@Q2, done@Q3');
    // Launch cannot happen in the same bucket as (or before) Design resolves.
    const q = await call('query', { network: h, evidence: { Design: 'done@Q2' }, variables: ['Launch'] });
    expect(prob(q, 'Launch', 'done@Q1')).toBe(0);
    expect(prob(q, 'Launch', 'done@Q2')).toBe(0);
    expect(prob(q, 'Launch', 'done@Q3')).toBeGreaterThan(0.5);
    // No design at all: launch gated off.
    const none = await call('query', { network: h, evidence: { Design: 'none' }, variables: ['Launch'] });
    expect(prob(none, 'Launch', 'none')).toBeCloseTo(1, 10);
  });

  it('reports every problem with actionable messages', async () => {
    const r = await call('build_network', {
      spec: {
        variables: [
          { name: 'A', outcomes: ['x'], cpt: [1] },
          { name: 'B', outcomes: ['t', 'f'], parents: ['Ghost'], cpt: [0.5, 0.5] },
          { name: 'C', outcomes: ['t', 'f'], cpt: [0.7, 0.7] },
          { name: 'D', outcomes: ['t', 'f'] },
          { name: 'C', outcomes: ['t', 'f'], cpt: [0.5, 0.5] },
          { name: 'E', outcomes: ['t', 'f'], parents: ['C'], cpt: [[0.5, 0.5]] },
          { name: 'F', outcomes: ['t', 'f', 'u'], parents: ['C'], cpt: { type: 'noisyOr', weights: [0.5] } },
          { name: 'G', outcomes: ['t', 'f'], parents: ['C'], cpt: { type: 'conditional', rows: [{ when: { C: 'zzz' }, probs: [1, 0] }] } },
          { name: 'H', outcomes: ['t', 'f'], parents: ['C'], cpt: { type: 'nonsense' } },
        ],
      },
    });
    expect(r.isError).toBe(true);
    const t = text(r);
    expect(t).toMatch(/needs at least 2 outcomes/);
    expect(t).toMatch(/parent "Ghost" is not a variable.*Variables:/);
    expect(t).toMatch(/must sum to 1 but sums to 1\.4/);
    expect(t).toMatch(/missing "cpt"/);
    expect(t).toMatch(/duplicate variable name/);
    expect(t).toMatch(/table has 1 row\(s\) but 2 are needed.*C=t, C=f/);
    expect(t).toMatch(/noisyOr needs a binary child/);
    expect(t).toMatch(/"zzz" is not an outcome of "C". Valid outcomes: t, f/);
    expect(t).toMatch(/unknown CPT type "nonsense"/);
  });

  it('detects cycles and bad references', async () => {
    const cyc = await call('build_network', {
      spec: {
        variables: [
          { name: 'A', outcomes: ['t', 'f'], parents: ['B'], cpt: [[0.5, 0.5], [0.5, 0.5]] },
          { name: 'B', outcomes: ['t', 'f'], parents: ['A'], cpt: [[0.5, 0.5], [0.5, 0.5]] },
        ],
      },
    });
    expect(cyc.isError).toBe(true);
    expect(text(cyc)).toMatch(/cycle: .*A.*B/);

    const self = await call('build_network', { spec: { variables: [{ name: 'A', outcomes: ['t', 'f'], parents: ['A'], cpt: [0.5, 0.5] }] } });
    expect(text(self)).toMatch(/own parent/);

    const empty = await call('build_network', { spec: { variables: [] } });
    expect(empty.isError).toBe(true);
  });

  it('rejects temporal misuse and bad gate references', async () => {
    const r = await call('build_network', {
      spec: {
        variables: [
          { name: 'P', outcomes: ['a', 'b'], cpt: [0.5, 0.5] },
          { name: 'T', temporal: { outcomes: ['x'], buckets: ['1', '2'] }, parents: ['P'], cpt: { type: 'gatedLogistic', gate: [[{ parent: 'P', outcomes: ['c'] }]], delays: [{ parent: 'P', delay: 1 }] } },
        ],
      },
    });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/"c" is not an outcome of "P"/);
  });
});

describe('query', () => {
  it('reports posteriors with change vs prior and P(evidence)', async () => {
    const r = await call('query', { network: 'dogproblem.xmlbif', evidence: { 'dog-out': 'true' } });
    expect(r.isError, text(r)).toBeFalsy();
    const t = text(r);
    expect(t).toMatch(/P\(evidence\) = 0\.\d+/);
    expect(t).toMatch(/dog-out \[observed\]: true 100%/);
    expect(t).toMatch(/family-out: true \d+\.\d%/);
    expect(t).toMatch(/\([+-]\d/); // deltas vs prior
    const net = BayesianNetwork.parse((await assets.readExample('dogproblem.xmlbif'))!);
    const expected = net.query('family-out', new Map([['dog-out', 'true']])).get('true')!;
    expect(prob(r, 'family-out', 'true')).toBeCloseTo(expected, 10);
  });

  it('keeps the structuredContent shape the MCP App viewer reads', async () => {
    const xml = (await assets.readExample('dogproblem.xmlbif'))!;
    const r = await call('query', { network: xml, evidence: { 'dog-out': 'true' } });
    const sc = r.structuredContent!;
    expect(sc.source).toBe(xml);
    expect(sc.evidence).toEqual({ 'dog-out': 'true' });
    expect(Object.keys(sc.posteriors as object)).toHaveLength(5);
    const net = sc.network as { name: string; variables: Array<{ name: string; outcomes: string[]; parents: string[] }> };
    expect(net.variables.find(v => v.name === 'dog-out')!.parents).toEqual(expect.arrayContaining(['family-out', 'bowel-problem']));
    // Handle-only calls still return a loadable source.
    const again = await call('query', { network: (net as unknown as { handle: string }).handle });
    expect(String(again.structuredContent!.source)).toContain('<BIF');
  });

  it('is stateless: evidence from a previous call does not leak', async () => {
    await call('query', { network: 'dogproblem.xmlbif', evidence: { 'dog-out': 'true' } });
    const r = await call('query', { network: 'dogproblem.xmlbif' });
    expect(r.structuredContent!.evidence).toEqual({});
    expect(text(r)).toContain('Prior marginals');
  });

  it('restricts output with `variables` and coerces boolean evidence', async () => {
    const r = await call('query', { network: 'dogproblem.xmlbif', evidence: { 'dog-out': true }, variables: ['family-out'] });
    expect(r.isError, text(r)).toBeFalsy();
    expect(Object.keys(r.structuredContent!.posteriors as object)).toEqual(['family-out']);
  });

  it('applies soft evidence', async () => {
    const hard = await call('query', { network: 'dogproblem.xmlbif', evidence: { 'dog-out': 'true' }, variables: ['family-out'] });
    const soft = await call('query', { network: 'dogproblem.xmlbif', softEvidence: { 'dog-out': { true: 0.7, false: 0.3 } }, variables: ['family-out'] });
    expect(soft.isError, text(soft)).toBeFalsy();
    const prior = await call('query', { network: 'dogproblem.xmlbif', variables: ['family-out'] });
    const p = prob(soft, 'family-out', 'true');
    expect(p).toBeGreaterThan(prob(prior, 'family-out', 'true'));
    expect(p).toBeLessThan(prob(hard, 'family-out', 'true'));
    expect(text(soft)).toContain('dog-out~{');
  });

  it('rejects unknown variables and outcomes with the valid choices', async () => {
    const a = await call('query', { network: 'dogproblem.xmlbif', evidence: { ghost: 'true' } });
    expect(a.isError).toBe(true);
    expect(text(a)).toMatch(/unknown variable "ghost".*dog-out/);
    const b = await call('query', { network: 'dogproblem.xmlbif', evidence: { 'dog-out': 'maybe' } });
    expect(text(b)).toMatch(/unknown outcome "maybe".*Valid outcomes: true, false/);
    const c = await call('query', { network: 'dogproblem.xmlbif', variables: ['nope'] });
    expect(c.isError).toBe(true);
    expect(text(c)).toMatch(/Unknown variable "nope"/);
    const d = await call('query', { network: 'dogproblem.xmlbif', evidence: { 'dog-out': 'true' }, softEvidence: { 'dog-out': { true: 1 } } });
    expect(text(d)).toMatch(/both evidence and softEvidence/);
  });

  it('reports impossible evidence as an error', async () => {
    const h = await build({
      variables: [
        { name: 'A', outcomes: ['T', 'F'], cpt: [0.5, 0.5] },
        { name: 'B', outcomes: ['T', 'F'], parents: ['A'], cpt: [[1, 0], [0, 1]] },
      ],
    });
    const ok = await call('query', { network: h, evidence: { A: 'T' } });
    expect(ok.isError).toBeFalsy();
    const bad = await call('query', { network: h, evidence: { A: 'T', B: 'F' } });
    expect(bad.isError).toBe(true);
    expect(text(bad)).toMatch(/probability zero/);
  });

  it('guards exact inference on huge networks and suggests sampling', async () => {
    const r = await call('query', { network: 'b500-31.xml', variables: ['node0'] });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/too expensive.*treewidth.*method:"sampling"/s);
  });

  it('samples on request and as an automatic fallback', async () => {
    const small = await call('query', { network: 'dogproblem.xmlbif', evidence: { 'dog-out': 'true' }, method: 'sampling', samples: 50_000, seed: 7, variables: ['family-out'] });
    expect(small.isError, text(small)).toBeFalsy();
    expect(text(small)).toMatch(/Method: sampling.*effective sample size/);
    const exact = await call('query', { network: 'dogproblem.xmlbif', evidence: { 'dog-out': 'true' }, variables: ['family-out'] });
    expect(prob(small, 'family-out', 'true')).toBeCloseTo(prob(exact, 'family-out', 'true'), 1);

    const big = await call('query', { network: 'b500-31.xml', method: 'auto', samples: 1000, seed: 1, variables: ['node0'] });
    expect(big.isError, text(big)).toBeFalsy();
    expect(text(big)).toContain('Exact inference was too expensive');
  });

  it('serves the bnlearn models via the assets layer', async () => {
    const r = await call('query', { network: 'bench/asia.bif', evidence: { smoke: 'yes' }, variables: ['lung'] });
    expect(r.isError, text(r)).toBeFalsy();
    expect(prob(r, 'lung', 'yes')).toBeGreaterThan(0.05);
  });
});

describe('explain', () => {
  it('returns the MPE and k-best explanations', async () => {
    const h = await build();
    const one = await call('explain', { network: h, evidence: { WetGrass: 'wet' } });
    expect(one.isError, text(one)).toBeFalsy();
    expect(text(one)).toMatch(/Most probable explanation.*\d+\.\d%/);
    expect(text(one)).toContain('Rain=');
    const exps = one.structuredContent!.explanations as Array<{ probability: number; assignment: Record<string, string> }>;
    expect(exps).toHaveLength(1);
    expect(exps[0].assignment.WetGrass).toBe('wet');

    const k = await call('explain', { network: h, evidence: { WetGrass: 'wet' }, k: 3 });
    const list = k.structuredContent!.explanations as Array<{ probability: number }>;
    expect(list).toHaveLength(3);
    expect(list[0].probability).toBeGreaterThanOrEqual(list[1].probability);
    expect(text(k)).toContain('differs from #1');
  });

  it('errors: unknown evidence, impossible evidence, cost guard', async () => {
    const h = await build();
    expect(text(await call('explain', { network: h, evidence: { Nope: 'x' } }))).toMatch(/unknown variable/);
    const imp = await build({
      variables: [
        { name: 'A', outcomes: ['T', 'F'], cpt: [0.5, 0.5] },
        { name: 'B', outcomes: ['T', 'F'], parents: ['A'], cpt: [[1, 0], [0, 1]] },
      ],
    });
    const r = await call('explain', { network: imp, evidence: { A: 'T', B: 'F' } });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/probability zero/);
    const big = await call('explain', { network: 'b500-31.xml' });
    expect(big.isError).toBe(true);
    expect(text(big)).toMatch(/too expensive/);
  });
});

describe('what_to_observe', () => {
  it('ranks variables by expected entropy reduction', async () => {
    const r = await call('what_to_observe', { network: 'dogproblem.xmlbif', target: 'family-out', evidence: { 'dog-out': 'true' } });
    expect(r.isError, text(r)).toBeFalsy();
    expect(text(r)).toMatch(/1\. .*bits/);
    const ranking = r.structuredContent!.ranking as Array<{ variable: string; voi: number }>;
    expect(ranking.length).toBeGreaterThan(0);
    expect(ranking.map(x => x.variable)).not.toContain('dog-out');
    for (let i = 1; i < ranking.length; i++) expect(ranking[i - 1].voi).toBeGreaterThanOrEqual(ranking[i].voi);
  });

  it('supports several targets, candidates and errors', async () => {
    const multi = await call('what_to_observe', { network: 'bench/asia.bif', target: ['lung', 'tub'], candidates: ['xray', 'smoke'], top: 5 });
    expect(multi.isError, text(multi)).toBeFalsy();
    const ranking = multi.structuredContent!.ranking as Array<{ variable: string }>;
    expect(ranking.map(x => x.variable).sort()).toEqual(['smoke', 'xray']);
    const bad = await call('what_to_observe', { network: 'bench/asia.bif', target: 'ghost' });
    expect(bad.isError).toBe(true);
    expect(text(bad)).toMatch(/Unknown variable "ghost"/);
    const huge = await call('what_to_observe', { network: 'b500-31.xml', target: 'node0' });
    expect(huge.isError).toBe(true);
  });
});

describe('sensitivity', () => {
  it('ranks parameters in derivative and tornado modes', async () => {
    const d = await call('sensitivity', { network: 'dogproblem.xmlbif', target: 'family-out', outcome: 'true', evidence: { 'dog-out': 'true' }, top: 3 });
    expect(d.isError, text(d)).toBeFalsy();
    expect(text(d)).toMatch(/1\. P\(.*\| .*\) = .*slope/);
    expect((d.structuredContent!.parameters as unknown[]).length).toBe(3);
    const t = await call('sensitivity', { network: 'dogproblem.xmlbif', target: 'family-out', mode: 'tornado', top: 2 });
    expect(t.isError, text(t)).toBeFalsy();
    expect(text(t)).toMatch(/tornado/);
  });

  it('validates target and outcome', async () => {
    expect(text(await call('sensitivity', { network: 'dogproblem.xmlbif', target: 'x' }))).toMatch(/Unknown target variable/);
    expect(text(await call('sensitivity', { network: 'dogproblem.xmlbif', target: 'family-out', outcome: 'maybe' }))).toMatch(/not an outcome/);
    const big = await call('sensitivity', { network: 'bench/hepar2.bif', target: 'alcoholism' });
    expect(big.isError).toBe(true);
    expect(text(big)).toMatch(/parameters|too expensive/);
  });
});

describe('intervene', () => {
  // Z confounds X and Y; X has no effect on Y.
  const CONFOUNDED = {
    variables: [
      { name: 'Z', outcomes: ['hi', 'lo'], cpt: [0.5, 0.5] },
      { name: 'X', outcomes: ['on', 'off'], parents: ['Z'], cpt: [[0.9, 0.1], [0.1, 0.9]] },
      { name: 'Y', outcomes: ['yes', 'no'], parents: ['Z'], cpt: [[0.8, 0.2], [0.2, 0.8]] },
    ],
  };

  it('distinguishes doing from seeing', async () => {
    const h = await build(CONFOUNDED);
    const r = await call('intervene', { network: h, interventions: { X: 'on' }, variables: ['Y'], effect: 'Y' });
    expect(r.isError, text(r)).toBeFalsy();
    const post = r.structuredContent!.posteriors as Record<string, { do: Record<string, number>; observe: Record<string, number> }>;
    expect(post.Y.do.yes).toBeCloseTo(0.5, 10);
    expect(post.Y.observe.yes).toBeCloseTo(0.8 * 0.9 + 0.2 * 0.1, 10);
    expect(text(r)).toContain('differs by up to');
    expect(r.structuredContent!.averageCausalEffect as number).toBeCloseTo(0, 10);
    expect(text(r)).toMatch(/Average causal effect/);
  });

  it('validates interventions', async () => {
    const h = await build(CONFOUNDED);
    expect(text(await call('intervene', { network: h, interventions: {} }))).toMatch(/at least one/);
    expect(text(await call('intervene', { network: h, interventions: { Q: 'on' } }))).toMatch(/Unknown intervention variable "Q"/);
    expect(text(await call('intervene', { network: h, interventions: { X: 'maybe' } }))).toMatch(/Valid outcomes: on, off/);
    expect(text(await call('intervene', { network: h, interventions: { X: 'on' }, evidence: { X: 'off' } }))).toMatch(/both intervened on and observed/);
    expect(text(await call('intervene', { network: h, interventions: { X: 'on' }, effect: 'Nope' }))).toMatch(/Unknown effect variable/);
  });
});

describe('learn_from_csv', () => {
  it('learns from a bundled dataset, inline CSV, and returns a usable handle', async () => {
    const r = await call('learn_from_csv', { csv: 'bench/weather.csv' });
    expect(r.isError, text(r)).toBeFalsy();
    expect(text(r)).toMatch(/Learned network "weather" from 200 rows x 5 columns/);
    expect(text(r)).toMatch(/Edges \(\d+/);
    const q = await call('query', { network: handleOf(r), evidence: { Rain: 'Yes' }, variables: ['WetGrass'] });
    expect(q.isError, text(q)).toBeFalsy();

    const rows = ['A,B'];
    for (let i = 0; i < 100; i++) rows.push(i % 2 ? 'x,u' : 'y,v');
    const inline = await call('learn_from_csv', { csv: rows.join('\n'), name: 'pairs' });
    expect(inline.isError, text(inline)).toBeFalsy();
    expect(text(inline)).toMatch(/A -> B|B -> A/);
  });

  it('rejects bad CSV with advice', async () => {
    expect(text(await call('learn_from_csv', { csv: 'nope' }))).toMatch(/not CSV text/);
    expect((await call('learn_from_csv', { csv: 'A\n1\n2' })).isError).toBe(true);
    const cont = ['A,B', ...Array.from({ length: 60 }, (_, i) => `${i},${i % 2}`)].join('\n');
    expect(text(await call('learn_from_csv', { csv: cont }))).toMatch(/distinct values.*Discretize/);
    const constant = ['A,B', ...Array.from({ length: 10 }, (_, i) => `k,${i % 2}`)].join('\n');
    expect(text(await call('learn_from_csv', { csv: constant }))).toMatch(/single value/);
  });
});

describe('export_network and round trip', () => {
  it('build -> query -> explain -> export -> re-import', async () => {
    const built = await call('build_network', { spec: SPRINKLER });
    const h = handleOf(built);
    const q = await call('query', { network: h, evidence: { WetGrass: 'wet' } });
    expect(q.isError).toBeFalsy();
    const e = await call('explain', { network: h, evidence: { WetGrass: 'wet' } });
    expect(e.isError).toBeFalsy();

    const xml = text(await call('export_network', { network: h }));
    expect(xml).toContain('<BIF VERSION="0.3">');
    const reimport = await call('query', { network: xml, evidence: { WetGrass: 'wet' } });
    expect(reimport.isError, text(reimport)).toBeFalsy();
    expect(prob(reimport, 'Rain', 'yes')).toBeCloseTo(prob(q, 'Rain', 'yes'), 12);
    expect(handleOf(reimport)).toMatch(/^bn_/);

    const json = await call('export_network', { network: h, format: 'json' });
    const parsed = JSON.parse(text(json));
    expect(parsed.variables.map((v: { name: string }) => v.name)).toEqual(['Rain', 'Sprinkler', 'WetGrass']);
    expect(parsed.edges).toContainEqual({ from: 'Rain', to: 'Sprinkler' });
    const fromJson = await call('query', { network: text(json), evidence: { WetGrass: 'wet' } });
    expect(prob(fromJson, 'Rain', 'yes')).toBeCloseTo(prob(q, 'Rain', 'yes'), 12);
  });

  it('exports bundled examples as XMLBIF', async () => {
    const r = await call('export_network', { network: 'bench/asia.bif' });
    expect(text(r)).toContain('<NAME>asia</NAME>');
  });
});

describe('describe_network', () => {
  it('shows structure, cost and requested CPTs', async () => {
    const r = await call('describe_network', { network: 'dogproblem.xmlbif', cpts: ['dog-out'] });
    expect(text(r)).toMatch(/5 variables.*exact inference feasible/);
    expect(text(r)).toContain('CPT of dog-out');
    expect(text(r)).toContain('[bowel-problem=true, family-out=true]');
    const big = await call('describe_network', { network: 'b500-31.xml' });
    expect(text(big)).toContain('too expensive');
    expect((await call('describe_network', { network: 'dogproblem.xmlbif', cpts: ['zzz'] })).isError).toBe(true);
  });
});

describe('handle persistence', () => {
  it('rebuilds handles from a SessionStore after the server was recreated', async () => {
    const mem = new Map<string, SourceRecord>();
    const store: SessionStore = { get: async h => mem.get(h), put: async (h, r) => { mem.set(h, r); } };
    const c1 = await connect({ store });
    const built = await callOn(c1, 'build_network', { spec: SPRINKLER });
    const learned = await callOn(c1, 'learn_from_csv', { csv: 'bench/weather.csv' });
    const ex = await callOn(c1, 'describe_network', { network: 'bench/asia.bif' });
    await c1.close();
    expect(mem.size).toBe(3);

    const c2 = await connect({ store }); // fresh process, same storage
    for (const r of [built, learned, ex]) {
      const q = await callOn(c2, 'describe_network', { network: handleOf(r) });
      expect(q.isError, text(q)).toBeFalsy();
    }
    const q = await callOn(c2, 'query', { network: handleOf(built), evidence: { WetGrass: 'wet' }, variables: ['Rain'] });
    expect(q.isError).toBeFalsy();
    await c2.close();

    const c3 = await connect(); // no store: handle is unknown
    const lost = await callOn(c3, 'query', { network: handleOf(built) });
    expect(lost.isError).toBe(true);
    await c3.close();
  });
});
