import { describe, it, expect } from 'vitest';
import {
  createFactor,
  constantFactor,
  cptToFactor,
  multiplyFactors,
  marginalize,
  invertFactor,
  normalizeFactor,
  applyEvidence,
  extractDistribution,
  evaluateFactor,
  tableSize,
} from '../src/lib/factor.js';
import type { Variable } from '../src/lib/types.js';

const A: Variable = { name: 'A', outcomes: ['a0', 'a1'] };
const B: Variable = { name: 'B', outcomes: ['b0', 'b1', 'b2'] };
const C: Variable = { name: 'C', outcomes: ['c0', 'c1'] };

describe('Factor', () => {
  it('computes table size', () => {
    expect(tableSize([A, B])).toBe(6);
    expect(tableSize([A, B, C])).toBe(12);
    expect(tableSize([])).toBe(1);
  });

  it('evaluates a simple factor', () => {
    const f = createFactor([A, B], new Float64Array([1, 2, 3, 4, 5, 6]));
    // Index = a * 3 + b
    const assignment = new Map<Variable, number>();
    assignment.set(A, 0); assignment.set(B, 0);
    expect(evaluateFactor(f, assignment)).toBe(1);

    assignment.set(A, 0); assignment.set(B, 2);
    expect(evaluateFactor(f, assignment)).toBe(3);

    assignment.set(A, 1); assignment.set(B, 1);
    expect(evaluateFactor(f, assignment)).toBe(5);
  });

  it('multiplies two factors with shared variables', () => {
    const f1 = createFactor([A], new Float64Array([0.3, 0.7]));
    const f2 = createFactor([A, B], new Float64Array([
      0.1, 0.2, 0.3,  // A=0
      0.4, 0.5, 0.6,  // A=1
    ]));
    const product = multiplyFactors(f1, f2);
    expect(product.variables).toEqual([A, B]);
    // A=0,B=0: 0.3*0.1=0.03, A=0,B=1: 0.3*0.2=0.06, etc.
    expect(product.values[0]).toBeCloseTo(0.03);
    expect(product.values[1]).toBeCloseTo(0.06);
    expect(product.values[3]).toBeCloseTo(0.28);
  });

  it('multiplies factors with disjoint variables', () => {
    const f1 = createFactor([A], new Float64Array([0.3, 0.7]));
    const f2 = createFactor([B], new Float64Array([0.1, 0.2, 0.7]));
    const product = multiplyFactors(f1, f2);
    expect(product.variables).toEqual([A, B]);
    expect(product.values.length).toBe(6);
    // A=0,B=0: 0.3*0.1=0.03
    expect(product.values[0]).toBeCloseTo(0.03);
    // A=1,B=2: 0.7*0.7=0.49
    expect(product.values[5]).toBeCloseTo(0.49);
  });

  it('marginalizes out a variable', () => {
    const f = createFactor([A, B], new Float64Array([
      0.1, 0.2, 0.3,  // A=0
      0.4, 0.5, 0.6,  // A=1
    ]));
    // Marginalize out B: sum over B for each A
    const result = marginalize(f, [B]);
    expect(result.variables).toEqual([A]);
    expect(result.values[0]).toBeCloseTo(0.6); // 0.1+0.2+0.3
    expect(result.values[1]).toBeCloseTo(1.5); // 0.4+0.5+0.6
  });

  it('marginalizes out first variable', () => {
    const f = createFactor([A, B], new Float64Array([
      0.1, 0.2, 0.3,  // A=0
      0.4, 0.5, 0.6,  // A=1
    ]));
    const result = marginalize(f, [A]);
    expect(result.variables).toEqual([B]);
    expect(result.values[0]).toBeCloseTo(0.5); // 0.1+0.4
    expect(result.values[1]).toBeCloseTo(0.7); // 0.2+0.5
    expect(result.values[2]).toBeCloseTo(0.9); // 0.3+0.6
  });

  it('normalizes a factor', () => {
    const f = createFactor([A], new Float64Array([2, 8]));
    const n = normalizeFactor(f);
    expect(n.values[0]).toBeCloseTo(0.2);
    expect(n.values[1]).toBeCloseTo(0.8);
  });

  it('inverts a factor', () => {
    const f = createFactor([A], new Float64Array([0.5, 0.25]));
    const inv = invertFactor(f);
    expect(inv.values[0]).toBeCloseTo(2);
    expect(inv.values[1]).toBeCloseTo(4);
  });

  it('handles zero in invert', () => {
    const f = createFactor([A], new Float64Array([0, 0.5]));
    const inv = invertFactor(f);
    expect(inv.values[0]).toBe(0);
    expect(inv.values[1]).toBeCloseTo(2);
  });

  it('applies evidence', () => {
    const f = createFactor([A], new Float64Array([0.3, 0.7]));
    const e = applyEvidence(f, A, 0); // observe A=a0
    expect(e.values[0]).toBeCloseTo(0.3);
    expect(e.values[1]).toBe(0);
  });

  it('extracts distribution', () => {
    const f = createFactor([A, B], new Float64Array([
      0.1, 0.2, 0.3,
      0.4, 0.5, 0.6,
    ]));
    const dist = extractDistribution(f, A);
    // Marginalize out B, then normalize
    // A=0: 0.6, A=1: 1.5 → normalized: ~0.286, ~0.714
    expect(dist.get('a0')).toBeCloseTo(0.6 / 2.1);
    expect(dist.get('a1')).toBeCloseTo(1.5 / 2.1);
  });

  it('creates CPT factor', () => {
    // P(C | A) where A has 2 outcomes, C has 2 outcomes
    // Table: P(c0|a0)=0.8, P(c1|a0)=0.2, P(c0|a1)=0.3, P(c1|a1)=0.7
    const f = cptToFactor(C, [A], new Float64Array([0.8, 0.2, 0.3, 0.7]));
    expect(f.variables).toEqual([A, C]);
    const assignment = new Map<Variable, number>();
    assignment.set(A, 0); assignment.set(C, 0);
    expect(evaluateFactor(f, assignment)).toBeCloseTo(0.8);
    assignment.set(A, 1); assignment.set(C, 1);
    expect(evaluateFactor(f, assignment)).toBeCloseTo(0.7);
  });
});
