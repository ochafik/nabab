import { describe, it, expect } from 'vitest';
import {
  temporalVariable,
  temporalOutcome,
  parseTemporalOutcome,
  bucketIndex,
  hazardPrior,
  priorCPT,
  delayShifts,
} from '../src/lib/temporal.js';
import { gatedLogisticCPT } from '../src/lib/cpt-templates.js';
import { infer } from '../src/lib/inference.js';

const buckets = ['Q1-27', 'Q2-27', 'H2-27', '2028'];

describe('temporalVariable / parseTemporalOutcome', () => {
  it('builds [null, outcome@bucket...] outcome-major', () => {
    const v = temporalVariable({ name: 'E', outcomes: ['partial', 'full'], buckets });
    expect(v.outcomes).toEqual([
      'none',
      'partial@Q1-27', 'partial@Q2-27', 'partial@H2-27', 'partial@2028',
      'full@Q1-27', 'full@Q2-27', 'full@H2-27', 'full@2028',
    ]);
  });

  it('honours a custom null outcome and skips it if listed', () => {
    const v = temporalVariable({ name: 'E', outcomes: ['never', 'yes'], buckets: ['a'], nullOutcome: 'never' });
    expect(v.outcomes).toEqual(['never', 'yes@a']);
  });

  it('rejects empty inputs', () => {
    expect(() => temporalVariable({ name: 'E', outcomes: ['x'], buckets: [] })).toThrow(/bucket/);
    expect(() => temporalVariable({ name: 'E', outcomes: [], buckets: ['a'] })).toThrow(/non-null/);
  });

  it('parse round-trips every non-null outcome', () => {
    const v = temporalVariable({ name: 'E', outcomes: ['a@b', 'full'], buckets });
    for (const o of v.outcomes) {
      const parsed = parseTemporalOutcome(o);
      if (o === 'none') {
        expect(parsed).toBeNull();
        continue;
      }
      expect(parsed).not.toBeNull();
      expect(temporalOutcome(parsed!.outcome, parsed!.bucket)).toBe(o);
      expect(buckets).toContain(parsed!.bucket);
    }
    // Splits on the LAST separator so outcome names may contain '@'.
    expect(parseTemporalOutcome('a@b@Q1-27')).toEqual({ outcome: 'a@b', bucket: 'Q1-27' });
    expect(parseTemporalOutcome('none')).toBeNull();
    expect(parseTemporalOutcome('@x')).toBeNull();
    expect(parseTemporalOutcome('x@')).toBeNull();
  });

  it('bucketIndex finds buckets and throws on unknown', () => {
    expect(bucketIndex(buckets, 'H2-27')).toBe(2);
    expect(() => bucketIndex(buckets, 'Q9')).toThrow(/Unknown bucket/);
  });
});

describe('hazardPrior', () => {
  const outcomes = new Map([['partial', 0.25], ['full', 0.75]]);

  it('sums to 1 with P(null) = 1 - pOccur', () => {
    const d = hazardPrior({ outcomes, pOccur: 0.6, buckets, hazard: [1, 2, 3, 4] });
    let s = 0;
    for (const p of d.values()) s += p;
    expect(s).toBeCloseTo(1, 12);
    expect(d.get('none')).toBeCloseTo(0.4, 12);
    expect(d.size).toBe(1 + 2 * 4);
  });

  it('weights mode: bucket mass is proportional to the weights, outcome mass to the outcome prior', () => {
    const d = hazardPrior({ outcomes, pOccur: 0.6, buckets, hazard: [1, 2, 3, 4] });
    expect(d.get('full@2028')).toBeCloseTo(0.6 * 0.75 * 0.4, 12);
    expect(d.get('partial@Q1-27')).toBeCloseTo(0.6 * 0.25 * 0.1, 12);
    expect(d.get('full@2028')!).toBeGreaterThan(d.get('full@H2-27')!);
    expect(d.get('full@H2-27')!).toBeGreaterThan(d.get('full@Q1-27')!);
  });

  it('rates mode: constant hazard gives geometrically decaying bucket mass', () => {
    const d = hazardPrior({ outcomes: new Map([['x', 1]]), pOccur: 1, buckets, hazard: [0.5, 0.5, 0.5, 0.5], hazardMode: 'rates' });
    // Unnormalised: .5, .25, .125, .0625 → sum .9375
    expect(d.get('x@Q1-27')).toBeCloseTo(0.5 / 0.9375, 12);
    expect(d.get('x@2028')).toBeCloseTo(0.0625 / 0.9375, 12);
    expect(d.get('none')).toBe(0);
  });

  it('normalises an unnormalised outcome distribution and ignores the null outcome in it', () => {
    const d = hazardPrior({ outcomes: new Map([['none', 5], ['a', 2], ['b', 2]]), pOccur: 0.5, buckets: ['t'], hazard: [1] });
    expect(d.get('a@t')).toBeCloseTo(0.25, 12);
    expect(d.get('b@t')).toBeCloseTo(0.25, 12);
    expect(d.get('none')).toBeCloseTo(0.5, 12);
  });

  it('validates inputs', () => {
    expect(() => hazardPrior({ outcomes, pOccur: 0.5, buckets, hazard: [1] })).toThrow(/entries/);
    expect(() => hazardPrior({ outcomes, pOccur: 1.5, buckets, hazard: [1, 1, 1, 1] })).toThrow(/pOccur/);
    expect(() => hazardPrior({ outcomes, pOccur: 0.5, buckets, hazard: [0, 0, 0, 0] })).toThrow(/no positive/);
    expect(() => hazardPrior({ outcomes, pOccur: 0.5, buckets, hazard: [2, 1, 1, 1], hazardMode: 'rates' })).toThrow(/Invalid hazard/);
  });

  it('priorCPT lays the distribution out in variable order', () => {
    const v = temporalVariable({ name: 'E', outcomes: ['partial', 'full'], buckets });
    const d = hazardPrior({ outcomes, pOccur: 0.6, buckets, hazard: [1, 2, 3, 4] });
    const cpt = priorCPT(v, d);
    expect(cpt.parents).toEqual([]);
    for (let i = 0; i < v.outcomes.length; i++) expect(cpt.table[i]).toBeCloseTo(d.get(v.outcomes[i])!, 12);
  });
});

describe('delay constraint via gatedLogisticCPT', () => {
  const P = temporalVariable({ name: 'P', outcomes: ['yes'], buckets });
  const C = temporalVariable({ name: 'C', outcomes: ['yes'], buckets });
  const childPrior = hazardPrior({ outcomes: new Map([['yes', 1]]), pOccur: 0.8, buckets, hazard: [1, 1, 1, 1] });

  it('delayShifts forbids child buckets earlier than parent + delay', () => {
    const shifts = delayShifts({ parent: P, child: C, buckets, delay: 1 });
    // One shift per parent non-null outcome that forbids something (all 4 do with delay 1).
    expect(shifts.map(s => s.outcome)).toEqual(['yes@Q1-27', 'yes@Q2-27', 'yes@H2-27', 'yes@2028']);
    const forQ2 = shifts[1].logOdds as Map<string, number>;
    expect([...forQ2.keys()].sort()).toEqual(['yes@Q1-27', 'yes@Q2-27']);
    expect(forQ2.get('yes@Q1-27')).toBe(-Infinity);
    // delay 0 → the first parent bucket forbids nothing.
    expect(delayShifts({ parent: P, child: C, buckets }).map(s => s.outcome)).toEqual(['yes@Q2-27', 'yes@H2-27', 'yes@2028']);
  });

  it('child never resolves before the parent, and never resolves if the parent does not', () => {
    const cpt = gatedLogisticCPT({
      variable: C, parents: [P],
      gate: [[{ parent: 'P', outcomes: P.outcomes.filter(o => o !== 'none') }]],
      base: childPrior,
      shifts: delayShifts({ parent: P, child: C, buckets, delay: 1 }),
    });
    const pPrior = priorCPT(P, hazardPrior({ outcomes: new Map([['yes', 1]]), pOccur: 0.7, buckets, hazard: [1, 1, 1, 1] }));
    const variables = [P, C];
    const cpts = [pPrior, cpt];

    let post = infer(variables, cpts, new Map([['P', 'none']])).posteriors.get(C)!;
    expect(post.get('none')).toBeCloseTo(1, 12);

    post = infer(variables, cpts, new Map([['P', 'yes@Q2-27']])).posteriors.get(C)!;
    expect(post.get('yes@Q1-27')).toBe(0);
    expect(post.get('yes@Q2-27')).toBe(0);
    expect(post.get('yes@H2-27')!).toBeGreaterThan(0);
    expect(post.get('yes@2028')!).toBeGreaterThan(0);
    // Forbidden mass is renormalised over the remaining outcomes (null keeps its logit).
    const z = 0.2 + 0.2 + 0.2; // none + two allowed buckets, each 0.8/4
    expect(post.get('none')).toBeCloseTo(0.2 / z, 12);

    // Parent in the last bucket + delay 1 → every child bucket forbidden → null.
    post = infer(variables, cpts, new Map([['P', 'yes@2028']])).posteriors.get(C)!;
    expect(post.get('none')).toBeCloseTo(1, 12);
  });
});
