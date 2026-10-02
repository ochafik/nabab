import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BayesianNetwork } from '../src/lib/network.js';
import { infer } from '../src/lib/inference.js';
import {
  mulberry32,
  topologicalOrder,
  forwardSample,
  likelihoodWeighting,
  sampledMarginals,
} from '../src/lib/sampling.js';
import type { Variable, CPT, LikelihoodEvidence } from '../src/lib/types.js';
import { enumerateJoint, bruteMarginal, randomNetwork } from './brute-force.js';

const MODELS_DIR = join(import.meta.dirname, '..', 'bench', 'models');
const asia = BayesianNetwork.fromBif(readFileSync(join(MODELS_DIR, 'asia.bif'), 'utf-8'));

function maxAbsDiff(a: Map<string, number>, b: Map<string, number>): number {
  let d = 0;
  for (const [k, v] of a) d = Math.max(d, Math.abs(v - (b.get(k) ?? 0)));
  return d;
}

describe('mulberry32', () => {
  it('is deterministic and in [0, 1)', () => {
    const a = mulberry32(42), b = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe('topologicalOrder', () => {
  it('places parents before children on Asia', () => {
    const order = topologicalOrder(asia.variables, asia.cpts);
    expect(order.length).toBe(asia.variables.length);
    const pos = new Map(order.map((v, i) => [v, i]));
    for (const cpt of asia.cpts) {
      for (const p of cpt.parents) expect(pos.get(p)!).toBeLessThan(pos.get(cpt.variable)!);
    }
  });

  it('throws on a cycle', () => {
    const A: Variable = { name: 'A', outcomes: ['T', 'F'] };
    const B: Variable = { name: 'B', outcomes: ['T', 'F'] };
    const cpts: CPT[] = [
      { variable: A, parents: [B], table: new Float64Array([0.5, 0.5, 0.5, 0.5]) },
      { variable: B, parents: [A], table: new Float64Array([0.5, 0.5, 0.5, 0.5]) },
    ];
    expect(() => topologicalOrder([A, B], cpts)).toThrow(/cycle/);
  });
});

describe('forwardSample', () => {
  it('is reproducible with a seed', () => {
    const a = forwardSample(asia.variables, asia.cpts, 500, { seed: 7 });
    const b = forwardSample(asia.variables, asia.cpts, 500, { seed: 7 });
    for (let c = 0; c < a.columns.length; c++) expect([...a.columns[c]]).toEqual([...b.columns[c]]);
    expect(a.totalWeight).toBe(500);
  });

  it('marginals converge to exact priors on Asia', () => {
    const n = 40000;
    const result = forwardSample(asia.variables, asia.cpts, n, { seed: 1 });
    const exact = infer(asia.variables, asia.cpts).posteriors;
    const sampled = sampledMarginals(result);
    for (const v of asia.variables) {
      expect(maxAbsDiff(sampled.get(v)!, exact.get(v)!)).toBeLessThan(0.015);
    }
  });

  it('single-variable marginal sums to 1', () => {
    const result = forwardSample(asia.variables, asia.cpts, 1000, { seed: 3 });
    const d = sampledMarginals(result, 'dysp');
    let s = 0;
    for (const p of d.values()) s += p;
    expect(s).toBeCloseTo(1, 10);
  });

  it('uses Uint16 columns for wide variables', () => {
    const W: Variable = { name: 'W', outcomes: Array.from({ length: 300 }, (_, i) => `o${i}`) };
    const table = new Float64Array(300).fill(1 / 300);
    const r = forwardSample([W], [{ variable: W, parents: [], table }], 10, { seed: 1 });
    expect(r.columns[0]).toBeInstanceOf(Uint16Array);
  });
});

describe('likelihoodWeighting', () => {
  it('matches exact posteriors with hard evidence on Asia', () => {
    const evidence = new Map([['asia', 'yes'], ['dysp', 'yes']]);
    const n = 40000;
    const result = likelihoodWeighting(asia.variables, asia.cpts, evidence, undefined, n, { seed: 11 });
    const exact = infer(asia.variables, asia.cpts, evidence).posteriors;
    for (const v of asia.variables) {
      expect(maxAbsDiff(sampledMarginals(result, v), exact.get(v)!)).toBeLessThan(0.02);
    }
    // Evidence variables are clamped in every sample.
    const asiaCol = result.columns[result.variables.findIndex(v => v.name === 'asia')];
    for (let s = 0; s < n; s++) expect(asiaCol[s]).toBe(0);
  });

  it('matches exact posteriors with likelihood evidence on Asia', () => {
    const like: LikelihoodEvidence = new Map([
      ['xray', new Map([['yes', 0.9], ['no', 0.2]])],
      ['smoke', new Map([['yes', 0.3], ['no', 1]])],
    ]);
    const n = 40000;
    const result = likelihoodWeighting(asia.variables, asia.cpts, undefined, like, n, { seed: 5 });
    const exact = infer(asia.variables, asia.cpts, undefined, like).posteriors;
    for (const v of asia.variables) {
      expect(maxAbsDiff(sampledMarginals(result, v), exact.get(v)!)).toBeLessThan(0.02);
    }
  });

  it('matches brute-force posteriors on a random net with mixed evidence', () => {
    const { variables, cpts } = randomNetwork(6, 99);
    const evidence = new Map([[variables[5].name, variables[5].outcomes[0]]]);
    const like: LikelihoodEvidence = new Map([[variables[2].name, new Map([[variables[2].outcomes[1], 0.1]])]]);
    const joint = enumerateJoint(variables, cpts, evidence, like);
    const result = likelihoodWeighting(variables, cpts, evidence, like, 40000, { seed: 8 });
    for (const v of variables) {
      expect(maxAbsDiff(sampledMarginals(result, v), bruteMarginal(joint, v))).toBeLessThan(0.02);
    }
  });

  it('gives zero total weight for impossible evidence', () => {
    const A: Variable = { name: 'A', outcomes: ['T', 'F'] };
    const cpts: CPT[] = [{ variable: A, parents: [], table: new Float64Array([1, 0]) }];
    const r = likelihoodWeighting([A], cpts, new Map([['A', 'F']]), undefined, 50, { seed: 1 });
    expect(r.totalWeight).toBe(0);
    expect(sampledMarginals(r, A).get('F')).toBe(0);
  });

  it('rejects unknown outcomes', () => {
    expect(() => likelihoodWeighting(asia.variables, asia.cpts, new Map([['asia', 'maybe']]), undefined, 1)).toThrow(/unknown outcome/i);
  });
});
