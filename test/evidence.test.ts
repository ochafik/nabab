import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BayesianNetwork } from '../src/lib/network.js';
import { CachedInferenceEngine } from '../src/lib/cached-inference.js';
import { infer } from '../src/lib/inference.js';
import { variableElimination } from '../src/lib/variable-elimination.js';
import { loopyBeliefPropagation } from '../src/lib/loopy-bp.js';
import { mostProbableExplanation, kBestExplanations } from '../src/lib/mpe.js';
import { likelihoodWeighting } from '../src/lib/sampling.js';
import { WorkerInferenceEngine } from '../src/lib/worker-inference.js';
import { toXmlBif } from '../src/lib/xmlbif-writer.js';
import { valueOfInformation } from '../src/lib/voi.js';
import { validateEvidence, ImpossibleEvidenceError } from '../src/lib/evidence.js';
import type { Variable, CPT, Evidence, LikelihoodEvidence } from '../src/lib/types.js';
import { enumerateJoint } from './brute-force.js';

const asia = BayesianNetwork.fromBif(readFileSync(join(import.meta.dirname, '..', 'bench', 'models', 'asia.bif'), 'utf-8'));

// A -> B (B is a noisy copy of A) plus an independent variable C.
const A: Variable = { name: 'A', outcomes: ['T', 'F'] };
const B: Variable = { name: 'B', outcomes: ['T', 'F'] };
const C: Variable = { name: 'C', outcomes: ['x', 'y'] };
const vars = [A, B, C];
const cpts: CPT[] = [
  { variable: A, parents: [], table: new Float64Array([0.3, 0.7]) },
  { variable: B, parents: [A], table: new Float64Array([0.9, 0.1, 0.2, 0.8]) },
  { variable: C, parents: [], table: new Float64Array([0.5, 0.5]) },
];
// D deterministically copies A: A=T together with D=F is impossible.
const D: Variable = { name: 'D', outcomes: ['T', 'F'] };
const detVars = [A, D];
const detCpts: CPT[] = [
  { variable: A, parents: [], table: new Float64Array([0.5, 0.5]) },
  { variable: D, parents: [A], table: new Float64Array([1, 0, 0, 1]) },
];
const contradiction: Evidence = new Map([['A', 'T'], ['D', 'F']]);

const hard = (k: string, v: string): Evidence => new Map([[k, v]]);
const lik = (k: string, w: Record<string, number>): LikelihoodEvidence => new Map([[k, new Map(Object.entries(w))]]);

describe('validateEvidence', () => {
  it('accepts valid and empty evidence', () => {
    expect(() => validateEvidence(vars)).not.toThrow();
    expect(() => validateEvidence(vars, new Map(), new Map())).not.toThrow();
    expect(() => validateEvidence(vars, hard('A', 'T'), lik('B', { T: 0.2, F: 0.8 }))).not.toThrow();
    expect(() => validateEvidence(vars, undefined, lik('B', { T: 0 }))).not.toThrow(); // F defaults to 1
  });

  it('rejects an unknown variable in hard evidence, listing known ones', () => {
    expect(() => validateEvidence(vars, hard('Z', 'T'))).toThrow(/unknown variable "Z".*A, B, C/);
  });

  it('rejects an unknown outcome in hard evidence, listing valid ones', () => {
    expect(() => validateEvidence(vars, hard('A', 'maybe'))).toThrow(/unknown outcome "maybe".*Valid outcomes: T, F/);
  });

  it('rejects unknown variables / outcomes in likelihood evidence', () => {
    expect(() => validateEvidence(vars, undefined, lik('Z', { T: 1 }))).toThrow(/unknown variable "Z"/);
    expect(() => validateEvidence(vars, undefined, lik('A', { maybe: 1 }))).toThrow(/unknown outcome "maybe"/);
  });

  it('rejects negative, NaN and infinite weights', () => {
    expect(() => validateEvidence(vars, undefined, lik('A', { T: -0.1, F: 1 }))).toThrow(/weight/);
    expect(() => validateEvidence(vars, undefined, lik('A', { T: NaN, F: 1 }))).toThrow(/weight/);
    expect(() => validateEvidence(vars, undefined, lik('A', { T: Infinity, F: 1 }))).toThrow(/weight/);
  });

  it('rejects an all-zero likelihood vector', () => {
    expect(() => validateEvidence(vars, undefined, lik('A', { T: 0, F: 0 }))).toThrow(/all-zero/);
  });
});

describe('every inference entry point validates evidence', () => {
  const badHard = hard('A', 'nope');
  const badVar = hard('ghost', 'T');
  const badLik = lik('A', { T: -1, F: 1 });
  const net = new BayesianNetwork({ name: 'n', variables: vars, cpts });

  const entries: Array<[string, (e?: Evidence, l?: LikelihoodEvidence) => unknown]> = [
    ['infer', (e, l) => infer(vars, cpts, e, l)],
    ['BayesianNetwork.infer', (e, l) => net.infer(e, l)],
    ['CachedInferenceEngine', (e, l) => new CachedInferenceEngine(net).infer(e, l)],
    ['variableElimination', (e, l) => variableElimination(vars, cpts, A, e, l)],
    ['loopyBeliefPropagation', (e, l) => loopyBeliefPropagation(vars, cpts, e, l)],
    ['mostProbableExplanation', (e, l) => mostProbableExplanation(vars, cpts, e, l)],
    ['kBestExplanations', (e, l) => kBestExplanations(vars, cpts, 2, e, l)],
    ['likelihoodWeighting', (e, l) => likelihoodWeighting(vars, cpts, e, l, 10)],
  ];

  for (const [name, run] of entries) {
    it(`${name} throws on bad outcome, unknown variable and bad weights`, () => {
      expect(() => run(badHard)).toThrow(/unknown outcome/);
      expect(() => run(badVar)).toThrow(/unknown variable/);
      expect(() => run(undefined, badLik)).toThrow(/weight/);
    });
  }

  it('WorkerInferenceEngine rejects invalid evidence', async () => {
    const engine = new WorkerInferenceEngine(toXmlBif(net));
    try {
      await expect(engine.infer(badHard)).rejects.toThrow(/unknown outcome/);
      await expect(engine.infer(badVar)).rejects.toThrow(/unknown variable/);
    } finally {
      engine.terminate();
    }
  });

  it('valueOfInformation rejects invalid evidence', () => {
    expect(() => valueOfInformation(net, 'A', badHard)).toThrow(/unknown outcome/);
  });
});

describe('probabilityOfEvidence', () => {
  it('is 1 without evidence', () => {
    expect(infer(vars, cpts).probabilityOfEvidence).toBeCloseTo(1, 12);
  });

  it('equals the brute-force P(e) for hard evidence, including across components', () => {
    const e = new Map([['B', 'T'], ['C', 'x']]);
    const expected = enumerateJoint(vars, cpts, e).reduce((s, j) => s + j.weight, 0);
    expect(expected).toBeCloseTo((0.3 * 0.9 + 0.7 * 0.2) * 0.5, 12);
    expect(infer(vars, cpts, e).probabilityOfEvidence).toBeCloseTo(expected, 12);
    const net = new BayesianNetwork({ name: 'n', variables: vars, cpts });
    expect(new CachedInferenceEngine(net).infer(e).probabilityOfEvidence).toBeCloseTo(expected, 12);
  });

  it('equals the expected likelihood weight for soft evidence', () => {
    const l = lik('B', { T: 0.5, F: 0.25 });
    const pb = 0.3 * 0.9 + 0.7 * 0.2;
    expect(infer(vars, cpts, undefined, l).probabilityOfEvidence).toBeCloseTo(0.5 * pb + 0.25 * (1 - pb), 12);
  });
});

describe('impossible evidence', () => {
  const net = new BayesianNetwork({ name: 'det', variables: detVars, cpts: detCpts });

  it('infer throws ImpossibleEvidenceError instead of returning NaN', () => {
    expect(() => infer(detVars, detCpts, contradiction)).toThrow(ImpossibleEvidenceError);
    expect(() => net.infer(contradiction)).toThrow(/probability zero/);
  });

  it('CachedInferenceEngine throws, and still works afterwards', () => {
    const engine = new CachedInferenceEngine(net);
    expect(() => engine.infer(contradiction)).toThrow(ImpossibleEvidenceError);
    const ok = engine.infer(hard('A', 'T'));
    expect(ok.probabilityOfEvidence).toBeCloseTo(0.5, 12);
    expect(ok.posteriors.get(D)!.get('T')).toBeCloseTo(1, 12);
  });

  it('variableElimination and mostProbableExplanation throw', () => {
    expect(() => variableElimination(detVars, detCpts, A, contradiction)).toThrow(ImpossibleEvidenceError);
    expect(() => mostProbableExplanation(detVars, detCpts, contradiction)).toThrow(ImpossibleEvidenceError);
  });

  it('a zeroing likelihood on an impossible outcome is impossible too', () => {
    expect(() => infer(detVars, detCpts, hard('A', 'T'), lik('D', { T: 0, F: 1 }))).toThrow(ImpossibleEvidenceError);
  });

  it('is exported from the library entry point', async () => {
    const lib = await import('../src/lib/index.js');
    expect(lib.ImpossibleEvidenceError).toBe(ImpossibleEvidenceError);
    expect(lib.validateEvidence).toBe(validateEvidence);
  });
});

describe('likelihood evidence is applied once per variable', () => {
  // Regression: VE and MPE used to multiply a likelihood into every factor
  // mentioning the variable (its own CPT and each child's), double-counting.
  const l = lik('A', { T: 0.2, F: 0.9 });
  const joint = enumerateJoint(vars, cpts, undefined, l);
  const pB = (o: string) => {
    let z = 0, n = 0;
    for (const j of joint) { z += j.weight; if (j.assignment.get('B') === o) n += j.weight; }
    return n / z;
  };

  it('variableElimination matches brute force', () => {
    const d = variableElimination(vars, cpts, B, undefined, l);
    expect(d.get('T')).toBeCloseTo(pB('T'), 10);
  });

  it('matches junction tree', () => {
    const d = infer(vars, cpts, undefined, l).posteriors.get(B)!;
    expect(d.get('T')).toBeCloseTo(pB('T'), 10);
  });

  it('mostProbableExplanation log-probability matches brute force', () => {
    const best = Math.max(...joint.map(j => j.weight));
    const z = joint.reduce((s, j) => s + j.weight, 0);
    expect(mostProbableExplanation(vars, cpts, undefined, l).logProbability).toBeCloseTo(Math.log(best), 10);
    expect(z).toBeGreaterThan(0);
  });
});

describe('disconnected networks', () => {
  // Chain A -> B -> E plus independent C: the junction tree is a forest, and
  // every component must be propagated, whichever clique is picked as root.
  const E: Variable = { name: 'E', outcomes: ['T', 'F'] };
  const chain = [A, B, E, C];
  const chainCpts: CPT[] = [
    ...cpts.slice(0, 2),
    { variable: E, parents: [B], table: new Float64Array([0.6, 0.4, 0.1, 0.9]) },
    cpts[2],
  ];

  for (const order of [chain, [C, E, B, A], [E, C, A, B]]) {
    it(`matches brute force (variable order ${order.map(v => v.name).join('')})`, () => {
      const e = hard('E', 'T');
      const joint = enumerateJoint(order, chainCpts, e);
      const z = joint.reduce((s, j) => s + j.weight, 0);
      const r = infer(order, chainCpts, e);
      expect(r.probabilityOfEvidence).toBeCloseTo(z, 12);
      for (const v of order) {
        for (const o of v.outcomes) {
          const exp = joint.filter(j => j.assignment.get(v.name) === o).reduce((s, j) => s + j.weight, 0) / z;
          expect(r.posteriors.get(v)!.get(o)).toBeCloseTo(exp, 10);
        }
      }
    });
  }
});

describe('asia sanity', () => {
  it('still answers valid evidence', () => {
    const r = asia.infer(hard('smoke', 'yes'));
    expect(r.probabilityOfEvidence).toBeGreaterThan(0);
    expect(r.probabilityOfEvidence).toBeLessThan(1);
  });
});
