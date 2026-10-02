import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BayesianNetwork } from '../src/lib/network.js';
import { ImpossibleEvidenceError } from '../src/lib/evidence.js';
import { mostProbableExplanation, kBestExplanations } from '../src/lib/mpe.js';
import type { Variable, CPT, Evidence, LikelihoodEvidence } from '../src/lib/types.js';
import { enumerateJoint, randomNetwork, type JointEntry } from './brute-force.js';

const MODELS_DIR = join(import.meta.dirname, '..', 'bench', 'models');
const asia = BayesianNetwork.fromBif(readFileSync(join(MODELS_DIR, 'asia.bif'), 'utf-8'));

function assignmentKey(a: Map<string, string>, variables: readonly Variable[]): string {
  return variables.map(v => a.get(v.name)).join('|');
}

/** Brute-force k-best: sort the joint by weight, descending. */
function bruteKBest(entries: JointEntry[], k: number): JointEntry[] {
  return [...entries].filter(e => e.weight > 0).sort((a, b) => b.weight - a.weight).slice(0, k);
}

/**
 * Assert that `got` matches the brute-force top-k: probabilities agree
 * position by position, and each returned assignment's own brute-force
 * probability equals the probability at its rank (so ties may be permuted).
 */
function expectKBestMatches(
  variables: readonly Variable[],
  cpts: readonly CPT[],
  k: number,
  evidence?: Evidence,
  like?: LikelihoodEvidence,
): void {
  const joint = enumerateJoint(variables, cpts, evidence, like);
  const byKey = new Map(joint.map(e => [assignmentKey(e.assignment, variables), e.weight]));
  const expected = bruteKBest(joint, k);
  const got = kBestExplanations(variables, cpts, k, evidence, like);

  expect(got.length).toBe(expected.length);
  const seen = new Set<string>();
  for (let i = 0; i < got.length; i++) {
    const key = assignmentKey(got[i].assignment, variables);
    expect(seen.has(key)).toBe(false);
    seen.add(key);
    // Probability at this rank matches brute force.
    expect(Math.exp(got[i].logProbability)).toBeCloseTo(expected[i].weight, 12);
    // The returned assignment really has that probability.
    expect(byKey.get(key)!).toBeCloseTo(expected[i].weight, 12);
    // Descending order.
    if (i > 0) expect(got[i].logProbability).toBeLessThanOrEqual(got[i - 1].logProbability + 1e-12);
  }
}

describe('mostProbableExplanation', () => {
  it('matches brute force on Asia without evidence', () => {
    const joint = enumerateJoint(asia.variables, asia.cpts);
    const best = bruteKBest(joint, 1)[0];
    const mpe = mostProbableExplanation(asia.variables, asia.cpts);
    expect(Math.exp(mpe.logProbability)).toBeCloseTo(best.weight, 12);
    expect(assignmentKey(mpe.assignment, asia.variables)).toBe(assignmentKey(best.assignment, asia.variables));
  });

  it('respects hard evidence and reports the joint log-probability', () => {
    const evidence = new Map([['asia', 'yes'], ['xray', 'yes']]);
    const joint = enumerateJoint(asia.variables, asia.cpts, evidence);
    const best = bruteKBest(joint, 1)[0];
    const mpe = mostProbableExplanation(asia.variables, asia.cpts, evidence);
    expect(mpe.assignment.get('asia')).toBe('yes');
    expect(mpe.assignment.get('xray')).toBe('yes');
    expect(Math.exp(mpe.logProbability)).toBeCloseTo(best.weight, 12);
  });

  it('throws ImpossibleEvidenceError for impossible evidence', () => {
    const A: Variable = { name: 'A', outcomes: ['T', 'F'] };
    const B: Variable = { name: 'B', outcomes: ['T', 'F'] };
    const cpts: CPT[] = [
      { variable: A, parents: [], table: new Float64Array([0.5, 0.5]) },
      { variable: B, parents: [A], table: new Float64Array([1, 0, 0, 1]) },
    ];
    expect(() => mostProbableExplanation([A, B], cpts, new Map([['A', 'T'], ['B', 'F']])))
      .toThrow(ImpossibleEvidenceError);
  });

  it('handles a variable without a CPT (assigned arbitrarily, probability unaffected)', () => {
    const A: Variable = { name: 'A', outcomes: ['T', 'F'] };
    const Z: Variable = { name: 'Z', outcomes: ['x', 'y'] };
    const cpts: CPT[] = [{ variable: A, parents: [], table: new Float64Array([0.3, 0.7]) }];
    const mpe = mostProbableExplanation([A, Z], cpts);
    expect(mpe.assignment.get('A')).toBe('F');
    expect(mpe.assignment.has('Z')).toBe(true);
    expect(Math.exp(mpe.logProbability)).toBeCloseTo(0.7, 12);
  });
});

describe('kBestExplanations', () => {
  const random = randomNetwork(6, 2024);

  for (const k of [1, 3, 10]) {
    it(`Asia, k=${k}, no evidence`, () => expectKBestMatches(asia.variables, asia.cpts, k));
    it(`Asia, k=${k}, hard evidence`, () =>
      expectKBestMatches(asia.variables, asia.cpts, k, new Map([['dysp', 'yes'], ['smoke', 'no']])));
    it(`Asia, k=${k}, likelihood evidence`, () =>
      expectKBestMatches(asia.variables, asia.cpts, k, undefined,
        new Map([['xray', new Map([['yes', 0.7], ['no', 0.1]])]])));
    it(`random 6-node, k=${k}, no evidence`, () => expectKBestMatches(random.variables, random.cpts, k));
    it(`random 6-node, k=${k}, mixed evidence`, () =>
      expectKBestMatches(
        random.variables, random.cpts, k,
        new Map([[random.variables[3].name, random.variables[3].outcomes[1]]]),
        new Map([[random.variables[0].name, new Map([[random.variables[0].outcomes[0], 0.05]])]]),
      ));
  }

  it('returns fewer than k when the evidence leaves fewer assignments', () => {
    const A: Variable = { name: 'A', outcomes: ['T', 'F'] };
    const B: Variable = { name: 'B', outcomes: ['T', 'F'] };
    const cpts: CPT[] = [
      { variable: A, parents: [], table: new Float64Array([0.5, 0.5]) },
      { variable: B, parents: [A], table: new Float64Array([1, 0, 0, 1]) },
    ];
    const got = kBestExplanations([A, B], cpts, 10);
    expect(got.length).toBe(2); // only (T,T) and (F,F) have positive probability
    expect(got.every(e => e.logProbability > -Infinity)).toBe(true);
  });

  it('handles ties on a uniform network', () => {
    const { variables, cpts } = randomNetwork(4, 1);
    const uniform = cpts.map(c => ({ ...c, table: new Float64Array(c.table.length).fill(1 / c.variable.outcomes.length) }));
    const total = variables.reduce((n, v) => n * v.outcomes.length, 1);
    const got = kBestExplanations(variables, uniform, 10);
    expect(got.length).toBe(Math.min(10, total));
    const keys = new Set(got.map(e => assignmentKey(e.assignment, variables)));
    expect(keys.size).toBe(got.length);
    for (const e of got) expect(Math.exp(e.logProbability)).toBeCloseTo(1 / total, 12);
  });

  it('k=0 returns nothing', () => {
    expect(kBestExplanations(asia.variables, asia.cpts, 0)).toEqual([]);
  });

  it('runs k=10 on Alarm (37 nodes) in reasonable time', () => {
    const alarm = BayesianNetwork.fromBif(readFileSync(join(MODELS_DIR, 'alarm.bif'), 'utf-8'));
    const t0 = performance.now();
    const got = kBestExplanations(alarm.variables, alarm.cpts, 10);
    const ms = performance.now() - t0;
    console.log(`kBestExplanations(k=10) on Alarm: ${ms.toFixed(0)} ms`);
    expect(got.length).toBe(10);
    for (let i = 1; i < got.length; i++) {
      expect(got[i].logProbability).toBeLessThanOrEqual(got[i - 1].logProbability + 1e-12);
    }
    const keys = new Set(got.map(e => assignmentKey(e.assignment, alarm.variables)));
    expect(keys.size).toBe(10);
    // The first explanation agrees with single MPE.
    const mpe = mostProbableExplanation(alarm.variables, alarm.cpts);
    expect(got[0].logProbability).toBeCloseTo(mpe.logProbability, 10);
    expect(ms).toBeLessThan(20000);
  });
});
