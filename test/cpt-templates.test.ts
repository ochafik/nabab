import { describe, it, expect } from 'vitest';
import { gatedLogisticCPT, noisyOrCPT } from '../src/lib/cpt-templates.js';
import { infer } from '../src/lib/inference.js';
import type { Variable, CPT } from '../src/lib/types.js';

const A: Variable = { name: 'A', outcomes: ['no', 'yes'] };
const B: Variable = { name: 'B', outcomes: ['low', 'mid', 'high'] };
const C: Variable = { name: 'C', outcomes: ['none', 'partial', 'full'] };

function rows(cpt: CPT): number[][] {
  const card = cpt.variable.outcomes.length;
  const out: number[][] = [];
  for (let i = 0; i < cpt.table.length; i += card) out.push([...cpt.table.slice(i, i + card)]);
  return out;
}

function uniformPrior(v: Variable): CPT {
  return { variable: v, parents: [], table: new Float64Array(v.outcomes.length).fill(1 / v.outcomes.length) };
}

describe('gatedLogisticCPT', () => {
  it('every row sums to 1 and has the right shape', () => {
    const cpt = gatedLogisticCPT({
      variable: C, parents: [A, B],
      gate: [[{ parent: 'A', outcomes: ['yes'] }]],
      base: [0.5, 0.3, 0.2],
      shifts: [{ parent: 'B', outcome: 'high', logOdds: [0, 0, 1] }],
    });
    expect(cpt.table.length).toBe(2 * 3 * 3);
    for (const r of rows(cpt)) expect(r.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 12);
  });

  it('with no gate and no shifts reproduces the (normalised) base in every row', () => {
    const cpt = gatedLogisticCPT({ variable: C, parents: [A], base: [5, 3, 2] });
    for (const r of rows(cpt)) {
      expect(r[0]).toBeCloseTo(0.5, 12);
      expect(r[1]).toBeCloseTo(0.3, 12);
      expect(r[2]).toBeCloseTo(0.2, 12);
    }
  });

  it('accepts a Distribution as base', () => {
    const cpt = gatedLogisticCPT({ variable: C, parents: [], base: new Map([['none', 0.2], ['partial', 0.3], ['full', 0.5]]) });
    expect([...cpt.table]).toEqual([0.2, 0.3, 0.5].map(x => expect.closeTo(x, 12)));
  });

  it('unsatisfied gate forces the null outcome', () => {
    const cpt = gatedLogisticCPT({
      variable: C, parents: [A, B],
      gate: [[{ parent: 'A', outcomes: ['yes'] }], [{ parent: 'B', outcomes: ['mid', 'high'] }]],
      base: [0.2, 0.3, 0.5],
    });
    const r = rows(cpt);
    // Row order: A outermost (no, yes), B inner (low, mid, high).
    // A=no → null regardless of B.
    for (let b = 0; b < 3; b++) expect(r[b]).toEqual([1, 0, 0]);
    // A=yes, B=low → second group fails → null.
    expect(r[3]).toEqual([1, 0, 0]);
    // A=yes, B=mid/high → base.
    expect(r[4][2]).toBeCloseTo(0.5, 12);
    expect(r[5][2]).toBeCloseTo(0.5, 12);
  });

  it('supports a custom null outcome', () => {
    const cpt = gatedLogisticCPT({
      variable: C, parents: [A], nullOutcome: 'full',
      gate: [[{ parent: 'A', outcomes: ['yes'] }]],
      base: [0.2, 0.3, 0.5],
    });
    expect(rows(cpt)[0]).toEqual([0, 0, 1]);
  });

  it('OR within a group: any listed parent outcome satisfies it', () => {
    const cpt = gatedLogisticCPT({
      variable: C, parents: [A, B],
      gate: [[{ parent: 'A', outcomes: ['yes'] }, { parent: 'B', outcomes: ['high'] }]],
      base: [0.2, 0.3, 0.5],
    });
    const r = rows(cpt);
    expect(r[0]).toEqual([1, 0, 0]); // A=no, B=low
    expect(r[2][0]).toBeCloseTo(0.2, 12); // A=no, B=high → satisfied
    expect(r[3][0]).toBeCloseTo(0.2, 12); // A=yes, B=low → satisfied
  });

  it('shifts move mass in the right direction and only in matching rows', () => {
    const cpt = gatedLogisticCPT({
      variable: C, parents: [B],
      base: [0.4, 0.4, 0.2],
      shifts: [{ parent: 'B', outcome: 'high', logOdds: [0, 0, 2] }],
    });
    const r = rows(cpt);
    expect(r[0][2]).toBeCloseTo(0.2, 12); // B=low: unchanged
    expect(r[1][2]).toBeCloseTo(0.2, 12); // B=mid: unchanged
    expect(r[2][2]).toBeGreaterThan(0.5); // B=high: 'full' boosted
    // Exact: softmax(log[.4,.4,.2] + [0,0,2]) → full = .2e² / (.4+.4+.2e²)
    expect(r[2][2]).toBeCloseTo(0.2 * Math.exp(2) / (0.8 + 0.2 * Math.exp(2)), 12);
  });

  it('multiple shifts add up; sparse Map form works; -Infinity forbids', () => {
    const cpt = gatedLogisticCPT({
      variable: C, parents: [A, B],
      base: [0.4, 0.4, 0.2],
      shifts: [
        { parent: 'A', outcome: 'yes', logOdds: [0, 0, 1] },
        { parent: 'B', outcome: 'high', logOdds: new Map([['full', 1], ['partial', -Infinity]]) },
      ],
    });
    const r = rows(cpt);
    // A=yes, B=high: full gets +2, partial forbidden.
    const row = r[1 * 3 + 2];
    expect(row[1]).toBe(0);
    expect(row[2]).toBeCloseTo(0.2 * Math.exp(2) / (0.4 + 0.2 * Math.exp(2)), 12);
    // A=yes, B=low: only +1.
    expect(r[3][2]).toBeCloseTo(0.2 * Math.exp(1) / (0.8 + 0.2 * Math.exp(1)), 12);
  });

  it('falls back to the null outcome when every outcome is forbidden', () => {
    const cpt = gatedLogisticCPT({
      variable: C, parents: [A],
      base: [0.4, 0.4, 0.2],
      shifts: [{ parent: 'A', outcome: 'yes', logOdds: [-Infinity, -Infinity, -Infinity] }],
    });
    expect(rows(cpt)[1]).toEqual([1, 0, 0]);
  });

  it('layout matches nabab conventions (checked via infer)', () => {
    const cpt = gatedLogisticCPT({
      variable: C, parents: [A, B],
      gate: [[{ parent: 'A', outcomes: ['yes'] }]],
      base: [0.5, 0.3, 0.2],
      shifts: [{ parent: 'B', outcome: 'high', logOdds: [0, 1, 0] }],
    });
    const variables = [A, B, C];
    const cpts = [uniformPrior(A), uniformPrior(B), cpt];
    // A=no → null.
    let post = infer(variables, cpts, new Map([['A', 'no'], ['B', 'high']])).posteriors.get(C)!;
    expect(post.get('none')).toBeCloseTo(1, 12);
    // A=yes, B=high → shifted row.
    post = infer(variables, cpts, new Map([['A', 'yes'], ['B', 'high']])).posteriors.get(C)!;
    const z = 0.5 + 0.3 * Math.E + 0.2;
    expect(post.get('none')).toBeCloseTo(0.5 / z, 12);
    expect(post.get('partial')).toBeCloseTo(0.3 * Math.E / z, 12);
    // A=yes, B=low → base.
    post = infer(variables, cpts, new Map([['A', 'yes'], ['B', 'low']])).posteriors.get(C)!;
    expect(post.get('full')).toBeCloseTo(0.2, 12);
  });

  it('validates parents, outcomes and sizes', () => {
    expect(() => gatedLogisticCPT({ variable: C, parents: [A], base: [1, 1] })).toThrow(/entries/);
    expect(() => gatedLogisticCPT({ variable: C, parents: [A], base: [1, 1, 1], gate: [[{ parent: 'B', outcomes: ['low'] }]] })).toThrow(/not a parent/);
    expect(() => gatedLogisticCPT({ variable: C, parents: [A], base: [1, 1, 1], gate: [[{ parent: 'A', outcomes: ['maybe'] }]] })).toThrow(/not an outcome/);
    expect(() => gatedLogisticCPT({ variable: C, parents: [A], base: [1, 1, 1], shifts: [{ parent: 'A', outcome: 'yes', logOdds: [1] }] })).toThrow(/expected 3/);
    expect(() => gatedLogisticCPT({ variable: C, parents: [A], base: [0, 0, 0] })).toThrow(/no positive/);
    expect(() => gatedLogisticCPT({ variable: C, parents: [A], base: [1, 1, 1], nullOutcome: 'nah' })).toThrow(/nullOutcome/);
  });
});

describe('noisyOrCPT', () => {
  const X: Variable = { name: 'X', outcomes: ['F', 'T'] };
  const Y: Variable = { name: 'Y', outcomes: ['F', 'T'] };
  const Z: Variable = { name: 'Z', outcomes: ['F', 'T'] };

  it('computes the classic noisy-OR table', () => {
    const cpt = noisyOrCPT({ variable: Z, parents: [X, Y], leak: 0.1, weights: [0.6, 0.8] });
    const r = rows(cpt);
    // Row order: X outermost (F, T), Y inner (F, T); columns (F, T).
    expect(r[0][1]).toBeCloseTo(0.1, 12); // neither
    expect(r[1][1]).toBeCloseTo(1 - 0.9 * 0.2, 12); // Y only
    expect(r[2][1]).toBeCloseTo(1 - 0.9 * 0.4, 12); // X only
    expect(r[3][1]).toBeCloseTo(1 - 0.9 * 0.4 * 0.2, 12); // both
    for (const row of r) expect(row[0] + row[1]).toBeCloseTo(1, 12);
  });

  it('zero leak and a single certain parent gives a deterministic OR', () => {
    const cpt = noisyOrCPT({ variable: Z, parents: [X], leak: 0, weights: [1] });
    expect(rows(cpt)).toEqual([[1, 0], [0, 1]]);
  });

  it('supports custom active outcomes', () => {
    const P: Variable = { name: 'P', outcomes: ['absent', 'weak', 'strong'] };
    const cpt = noisyOrCPT({ variable: Z, parents: [P], leak: 0, weights: [0.5], parentActiveOutcomes: ['strong'] });
    const r = rows(cpt);
    expect(r[0][1]).toBe(0);
    expect(r[1][1]).toBe(0);
    expect(r[2][1]).toBeCloseTo(0.5, 12);
  });

  it('validates inputs', () => {
    expect(() => noisyOrCPT({ variable: C, parents: [X], leak: 0, weights: [0.5] })).toThrow(/binary/);
    expect(() => noisyOrCPT({ variable: Z, parents: [X], leak: 0, weights: [] })).toThrow(/weights/);
    expect(() => noisyOrCPT({ variable: Z, parents: [X], leak: 1.5, weights: [0.5] })).toThrow(/leak/);
    expect(() => noisyOrCPT({ variable: Z, parents: [B], leak: 0, weights: [0.5] })).toThrow(/not binary/);
  });
});
