/**
 * Incremental (cached) and query-pruned inference must agree with a fresh full
 * run, whatever the history of evidence changes: additions, switches, retractions,
 * soft evidence, impossible evidence, repeated queries.
 *
 * References: a fresh one-shot `infer()` (same code, no history) and, for single
 * variables, `variableElimination` (an independent algorithm).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseBif } from '../src/lib/bif-parser.js';
import { BayesianNetwork } from '../src/lib/network.js';
import { CachedInferenceEngine } from '../src/lib/cached-inference.js';
import { infer } from '../src/lib/inference.js';
import { variableElimination } from '../src/lib/variable-elimination.js';
import { relevantNetwork } from '../src/lib/pruning.js';
import { ImpossibleEvidenceError } from '../src/lib/evidence.js';
import { mulberry32 } from '../src/lib/sampling.js';
import type { Variable, Evidence, LikelihoodEvidence, Distribution } from '../src/lib/types.js';

const TOL = 1e-9;
/** Set NABAB_TEST_SEED to explore other random evidence walks. */
const SEED = Number(process.env.NABAB_TEST_SEED ?? 0);

function loadModel(name: string, normalizeRows = false): BayesianNetwork {
  const text = readFileSync(resolve(__dirname, `../bench/models/${name}.bif`), 'utf-8');
  const parsed = parseBif(text);
  if (!normalizeRows) return new BayesianNetwork(parsed);
  // Some bnlearn files round CPT rows (they sum to 1 +- 1e-7). Dropping a barren
  // node removes its row-sum factor, so pruned and full runs agree only up to
  // that rounding unless the rows are exactly normalised.
  const cpts = parsed.cpts.map(cpt => {
    const table = new Float64Array(cpt.table);
    const k = cpt.variable.outcomes.length;
    for (let i = 0; i < table.length; i += k) {
      let sum = 0;
      for (let j = 0; j < k; j++) sum += table[i + j];
      for (let j = 0; j < k; j++) table[i + j] /= sum;
    }
    return { ...cpt, table };
  });
  return new BayesianNetwork({ ...parsed, cpts });
}

function expectClose(actual: Distribution | undefined, expected: Distribution | undefined, label: string) {
  expect(actual, label).toBeDefined();
  expect(expected, label).toBeDefined();
  for (const [outcome, p] of expected!) {
    expect(Math.abs(actual!.get(outcome)! - p), `${label}=${outcome}`).toBeLessThan(TOL);
  }
}

/** Run `fn`, returning its result or 'impossible' if it raised ImpossibleEvidenceError. */
function tryInfer<T>(fn: () => T): T | 'impossible' {
  try {
    return fn();
  } catch (e) {
    if (e instanceof ImpossibleEvidenceError) return 'impossible';
    throw e;
  }
}

/** A random walk over evidence states. */
class EvidenceWalk {
  hard: Evidence = new Map();
  soft: LikelihoodEvidence = new Map();
  readonly kinds: string[] = [];
  constructor(private readonly vars: readonly Variable[], private readonly rng: () => number) {}

  private pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.rng() * items.length)];
  }

  step(): void {
    const r = this.rng();
    const hardNames = [...this.hard.keys()];
    const softNames = [...this.soft.keys()];
    let kind: string;
    if (r < 0.25) {
      kind = 'add-hard';
      const v = this.pick(this.vars);
      this.hard.set(v.name, this.pick(v.outcomes));
    } else if (r < 0.4) {
      kind = 'add-soft';
      const v = this.pick(this.vars);
      const weights = new Map(v.outcomes.map(o => [o, this.rng() < 0.2 ? 0 : this.rng() + 0.05]));
      if (![...weights.values()].some(w => w > 0)) weights.set(v.outcomes[0], 1);
      this.soft.set(v.name, weights);
    } else if (r < 0.55 && hardNames.length > 0) {
      kind = 'switch';
      const name = this.pick(hardNames);
      this.hard.set(name, this.pick(this.vars.find(x => x.name === name)!.outcomes));
    } else if (r < 0.7 && hardNames.length > 0) {
      kind = 'retract-hard';
      this.hard.delete(this.pick(hardNames));
    } else if (r < 0.78 && softNames.length > 0) {
      kind = 'retract-soft';
      this.soft.delete(this.pick(softNames));
    } else if (r < 0.84) {
      kind = 'clear';
      this.hard = new Map();
      this.soft = new Map();
    } else if (r < 0.92) {
      kind = 'add-many'; // several observations at once; often contradictory
      for (let i = 0; i < 4; i++) {
        const v = this.pick(this.vars);
        this.hard.set(v.name, this.pick(v.outcomes));
      }
    } else {
      kind = 'same';
    }
    this.kinds.push(kind);
  }

  snapshot(): [Evidence, LikelihoodEvidence] {
    return [new Map(this.hard), new Map([...this.soft].map(([k, m]) => [k, new Map(m)]))];
  }
}

const MODELS: Array<[string, number]> = [
  ['asia', 60],
  ['child', 50],
  ['alarm', 50],
  ['insurance', 40],
  ['hepar2', 30],
];

describe.each(MODELS)('incremental cached inference on %s', (name, steps) => {
  const net = loadModel(name);
  const vars = net.variables;

  it('matches fresh inference and variable elimination along a random evidence walk', () => {
    const rng = mulberry32(1234 + SEED);
    const walk = new EvidenceWalk(vars, rng);
    const engine = new CachedInferenceEngine(net);
    let possibleSeen = 0;

    for (let s = 0; s < steps; s++) {
      walk.step();
      const [hard, soft] = walk.snapshot();
      const fresh = tryInfer(() => infer(vars, net.cpts, hard, soft));
      const cached = tryInfer(() => engine.infer(hard, soft));

      if (fresh === 'impossible') {
        expect(cached, `step ${s} (${walk.kinds[s]})`).toBe('impossible');
        continue;
      }
      possibleSeen++;
      expect(cached, `step ${s} (${walk.kinds[s]})`).not.toBe('impossible');
      if (cached === 'impossible') continue;

      expect(cached.probabilityOfEvidence / fresh.probabilityOfEvidence).toBeCloseTo(1, 9);
      for (const v of vars) expectClose(cached.posteriors.get(v), fresh.posteriors.get(v), `step ${s} ${v.name}`);

      // Independent algorithm on a few variables (it does not reduce evidence variables,
      // so it blows up when many are observed).
      for (let k = 0; k < (hard.size <= 3 ? 2 : 0); k++) {
        const v = vars[Math.floor(rng() * vars.length)];
        expectClose(cached.posteriors.get(v), variableElimination(vars, net.cpts, v, hard, soft), `VE step ${s} ${v.name}`);
      }
    }
    expect(possibleSeen).toBeGreaterThan(steps / 4);
    // (Impossible evidence is exercised deterministically in 'incremental behaviour' below.)
  });

  it('matches fresh inference with queryVariables, one-shot and cached', () => {
    const net = loadModel(name, true);
    const vars = net.variables;
    const rng = mulberry32(99 + SEED);
    const walk = new EvidenceWalk(vars, rng);
    const engine = new CachedInferenceEngine(net);
    for (let s = 0; s < steps; s++) {
      walk.step();
      const [hard, soft] = walk.snapshot();
      const queryVars = [0, 1, 2].slice(0, 1 + Math.floor(rng() * 3)).map(() => vars[Math.floor(rng() * vars.length)]);
      const fresh = tryInfer(() => infer(vars, net.cpts, hard, soft));
      const pruned = tryInfer(() => infer(vars, net.cpts, hard, soft, { queryVariables: queryVars }));
      const cachedPruned = tryInfer(() => engine.infer(hard, soft, { queryVariables: queryVars.map(v => v.name) }));

      const ctx = JSON.stringify({ hard: [...hard], soft: [...soft].map(([k, m]) => [k, [...m]]), q: queryVars.map(v => v.name) });
      if (fresh === 'impossible') continue; // irrelevant contradictions may go unreported, see InferOptions
      expect(pruned, `step ${s}`).not.toBe('impossible');
      expect(cachedPruned, `step ${s}`).not.toBe('impossible');
      if (pruned === 'impossible' || cachedPruned === 'impossible') continue;
      expect(new Set(pruned.posteriors.keys())).toEqual(new Set(queryVars));
      for (const v of queryVars) {
        expectClose(pruned.posteriors.get(v), fresh.posteriors.get(v), `pruned step ${s} ${v.name} ${ctx}`);
        expectClose(cachedPruned.posteriors.get(v), fresh.posteriors.get(v), `cached pruned step ${s} ${v.name}`);
      }
    }
  });

  it('keeps clique potentials of earlier results intact when later queries change the tree', () => {
    const engine = new CachedInferenceEngine(net);
    const v = vars[vars.length - 1];
    const first = engine.infer(new Map([[v.name, v.outcomes[0]]]));
    const second = engine.infer(); // retracts the evidence
    const potentials = first.cliquePotentials; // read only now
    const home = [...potentials].find(([, f]) => f.variables.includes(v))![1];
    let total = 0;
    for (const x of home.values) total += x;
    expect(total).toBeCloseTo(1, 9);
    // The potential still reflects the first query: v was observed to be outcome 0.
    const idx = home.variables.indexOf(v);
    let mass0 = 0;
    for (let i = 0; i < home.values.length; i++) {
      if (Math.floor(i / home.strides[idx]) % v.outcomes.length === 0) mass0 += home.values[i];
    }
    expect(mass0).toBeCloseTo(1, 9);
    expect(second.cliquePotentials).not.toBe(first.cliquePotentials);
  });
});

describe('incremental behaviour', () => {
  it('recovers after impossible evidence and handles retraction and switching on asia', () => {
    const net = loadModel('asia');
    const engine = new CachedInferenceEngine(net);
    const reference = (e: Evidence) => infer(net.variables, net.cpts, e);
    const check = (e: Evidence) => {
      const got = engine.infer(e);
      const want = reference(e);
      for (const v of net.variables) expectClose(got.posteriors.get(v), want.posteriors.get(v), v.name);
      expect(got.probabilityOfEvidence / want.probabilityOfEvidence).toBeCloseTo(1, 9);
    };
    check(new Map([['smoke', 'yes']]));
    check(new Map([['smoke', 'yes'], ['dysp', 'yes']]));
    // either = OR(tub, lung): tub=yes with either=no is impossible
    expect(() => engine.infer(new Map([['smoke', 'yes'], ['tub', 'yes'], ['either', 'no']]))).toThrow(ImpossibleEvidenceError);
    check(new Map([['smoke', 'yes'], ['dysp', 'yes']]));
    check(new Map([['smoke', 'no'], ['dysp', 'yes']])); // switch
    check(new Map([['dysp', 'yes']])); // retract
    check(new Map([['dysp', 'yes']])); // unchanged
    check(new Map());
  });

  it('handles a disconnected network (forest of junction trees) incrementally', () => {
    const bin = (name: string): Variable => ({ name, outcomes: ['0', '1'] });
    const [a, b, c, d, e] = ['a', 'b', 'c', 'd', 'e'].map(bin);
    const cpts = [
      { variable: a, parents: [], table: Float64Array.from([0.3, 0.7]) },
      { variable: b, parents: [a], table: Float64Array.from([0.9, 0.1, 0.2, 0.8]) },
      { variable: c, parents: [], table: Float64Array.from([0.5, 0.5]) },
      { variable: d, parents: [c], table: Float64Array.from([0.6, 0.4, 0.1, 0.9]) },
      { variable: e, parents: [], table: Float64Array.from([0.25, 0.75]) },
    ];
    const vars = [a, b, c, d, e];
    const net = new BayesianNetwork({ name: 'forest', variables: vars, cpts });
    const engine = new CachedInferenceEngine(net);
    const seqs: Array<[Evidence, LikelihoodEvidence?]> = [
      [new Map()],
      [new Map([['b', '1']])],
      [new Map([['b', '1'], ['d', '0']])],
      [new Map([['b', '0'], ['d', '0']])],
      [new Map([['d', '0'], ['e', '1']])],
      [new Map([['d', '0']]), new Map([['a', new Map([['0', 2], ['1', 1]])]])],
      [new Map()],
    ];
    for (const [ev, soft] of seqs) {
      const got = engine.infer(ev, soft);
      const want = infer(vars, cpts, ev, soft);
      expect(got.probabilityOfEvidence / want.probabilityOfEvidence).toBeCloseTo(1, 12);
      for (const v of vars) expectClose(got.posteriors.get(v), want.posteriors.get(v), v.name);
    }
    // P(b=1, d=0) factorises over the components: 0.65 * 0.4 ... computed directly:
    const p = engine.infer(new Map([['b', '1'], ['d', '0']])).probabilityOfEvidence;
    expect(p).toBeCloseTo((0.3 * 0.1 + 0.7 * 0.8) * (0.5 * 0.6 + 0.5 * 0.1), 12);
  });

  it('returns the same answer for an unchanged query', () => {
    const net = loadModel('alarm');
    const engine = new CachedInferenceEngine(net);
    const e = new Map([[net.variables[5].name, net.variables[5].outcomes[0]]]);
    const a = engine.infer(e);
    const b = engine.infer(e);
    expect(b.probabilityOfEvidence).toBe(a.probabilityOfEvidence);
    for (const v of net.variables) expectClose(b.posteriors.get(v), a.posteriors.get(v), v.name);
  });

  it('rejects unknown query variables', () => {
    const net = loadModel('asia');
    expect(() => infer(net.variables, net.cpts, undefined, undefined, { queryVariables: ['nope'] })).toThrow(/unknown query variable/);
    expect(() => new CachedInferenceEngine(net).infer(undefined, undefined, { queryVariables: ['nope'] })).toThrow(/unknown query variable/);
  });

  it('without queryVariables returns every variable', () => {
    const net = loadModel('child');
    const result = infer(net.variables, net.cpts);
    expect(result.posteriors.size).toBe(net.variables.length);
  });
});

describe('relevantNetwork (Bayes-ball pruning)', () => {
  const net = loadModel('asia');
  const v = (name: string) => net.getVariable(name)!;
  const names = (vs: readonly Variable[]) => vs.map(x => x.name).sort();

  it('drops barren descendants: P(lung) needs only smoke and lung', () => {
    const r = relevantNetwork(net.variables, net.cpts, new Set([v('lung')]), new Set());
    expect(names(r.variables)).toEqual(['lung', 'smoke']);
    expect(names(r.cpts.map(c => c.variable))).toEqual(['lung', 'smoke']);
  });

  it('keeps an observed descendant (explaining away) and its other parent', () => {
    const r = relevantNetwork(net.variables, net.cpts, new Set([v('lung')]), new Set([v('either')]));
    expect(names(r.variables)).toEqual(expect.arrayContaining(['lung', 'smoke', 'either', 'tub', 'asia']));
    expect(names(r.variables)).not.toContain('xray');
    expect(names(r.variables)).not.toContain('dysp');
  });

  it('drops evidence that is d-separated from the query', () => {
    // smoke observed blocks smoke -> lung -> either; bronc and lung are independent given smoke
    const r = relevantNetwork(net.variables, net.cpts, new Set([v('lung')]), new Set([v('smoke'), v('bronc')]));
    expect(names(r.variables)).not.toContain('bronc');
    expect(names(r.cpts.map(c => c.variable))).toEqual(['lung']);
  });
});
