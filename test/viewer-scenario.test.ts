import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BayesianNetwork } from '../src/lib/network.js';
import { kBestExplanations } from '../src/lib/mpe.js';
import {
  scenarioProbabilities, coveredMass, diffAssignments, diffFromMarginal, argmaxOutcome,
  scenarioVariables, formatChip, formatPercent, pillText, oneHotPosteriors,
} from '../src/viewer/scenario-logic.js';
import { enumerateJoint } from './brute-force.js';

const asia = BayesianNetwork.fromBif(readFileSync(join(import.meta.dirname, '..', 'bench', 'models', 'asia.bif'), 'utf-8'));
const m = (o: Record<string, string>) => new Map(Object.entries(o));

describe('scenario probabilities', () => {
  it('matches brute-force P(x | e) for hard evidence', () => {
    const ev = new Map([['dysp', 'yes']]);
    const k = kBestExplanations(asia.variables, asia.cpts, 5, ev);
    const pe = asia.infer(ev).probabilityOfEvidence;
    const probs = scenarioProbabilities(k, pe);
    const joint = enumerateJoint(asia.variables, asia.cpts, ev);
    const total = joint.reduce((s, e) => s + e.weight, 0);
    const sorted = joint.map(e => e.weight / total).sort((a, b) => b - a);
    probs.forEach((pr, i) => expect(pr.p).toBeCloseTo(sorted[i], 10));
    expect(coveredMass(probs)).toBeLessThanOrEqual(1);
    expect(probs.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1, 10);
  });

  it('is consistent with soft (likelihood) evidence', () => {
    const soft = new Map([['smoke', new Map([['yes', 0.8], ['no', 0.2]])]]);
    const k = kBestExplanations(asia.variables, asia.cpts, 4, undefined, soft);
    const pe = asia.infer(undefined, soft).probabilityOfEvidence;
    const probs = scenarioProbabilities(k, pe);
    const joint = enumerateJoint(asia.variables, asia.cpts, undefined, soft);
    const total = joint.reduce((s, e) => s + e.weight, 0);
    const sorted = joint.map(e => e.weight / total).sort((a, b) => b - a);
    probs.forEach((pr, i) => expect(pr.p).toBeCloseTo(sorted[i], 10));
  });

  it('covers all mass when every scenario is listed, and handles P(e)=0', () => {
    const all = kBestExplanations(asia.variables, asia.cpts, 1000);
    const probs = scenarioProbabilities(all, 1);
    expect(coveredMass(probs)).toBeCloseTo(1, 8);
    expect(scenarioProbabilities([{ assignment: m({}), logProbability: 0 }], 0)[0]).toEqual({ p: 0, share: 0 });
  });
});

describe('diffs', () => {
  const a = m({ x: 'yes', y: 'no', z: 'yes' });
  it('diffs vs #1 in the given order, ignoring missing', () => {
    expect(diffAssignments(m({ x: 'yes', y: 'yes', z: 'no' }), a, ['z', 'y', 'x', 'w']))
      .toEqual([{ name: 'z', outcome: 'no' }, { name: 'y', outcome: 'yes' }]);
    expect(diffAssignments(a, a, ['x', 'y', 'z'])).toEqual([]);
  });
  it('diffs vs marginal argmax', () => {
    const post = new Map([
      ['x', new Map([['yes', 0.9], ['no', 0.1]])],
      ['y', new Map([['yes', 0.7], ['no', 0.3]])],
      ['z', new Map([['yes', 0.5], ['no', 0.5]])],
    ]);
    expect(argmaxOutcome(post.get('z'))).toBe('yes'); // first on ties
    expect(diffFromMarginal(a, post, ['x', 'y', 'z'])).toEqual([{ name: 'y', outcome: 'no', marginal: 'yes' }]);
  });
  it('restricts to unobserved, non-intervened variables', () => {
    expect(scenarioVariables(['a', 'b', 'c', 'd'], new Set(['a']), new Set(['c']))).toEqual(['b', 'd']);
  });
});

describe('formatting', () => {
  it('formats chips, percentages and pills', () => {
    expect(formatChip({ name: 'lung', outcome: 'yes' })).toBe('lung = yes');
    expect(formatPercent(0.412)).toBe('41%');
    expect(formatPercent(0.041)).toBe('4.1%');
    expect(formatPercent(0.0012)).toBe('0.12%');
    expect(formatPercent(1e-6)).toBe('<0.01%');
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(0.9999)).toBe('100%');
    expect(pillText('yes')).toBe('scenario: yes');
    expect(pillText('a-very-long-outcome-name')).toBe('scenario: a-very-long…');
  });
  it('builds one-hot posteriors', () => {
    const oh = oneHotPosteriors(m({ x: 'no' }), () => ['yes', 'no'], ['x', 'q']);
    expect([...oh.get('x')!]).toEqual([['yes', 0], ['no', 1]]);
    expect(oh.has('q')).toBe(false);
  });
});
