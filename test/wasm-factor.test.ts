import { describe, it, expect } from 'vitest';
import {
  packFactor,
  unpackFactor,
  wasmStyleMultiplyAuto,
  wasmStyleMarginalizeAuto,
} from '../src/lib/wasm-factor.js';
import {
  createFactor,
  multiplyFactors,
  marginalize,
  tableSize,
} from '../src/lib/factor.js';
import type { Variable } from '../src/lib/types.js';

// ─── Helpers ───────────────────────────────────────────────────────

const A: Variable = { name: 'A', outcomes: ['a0', 'a1'] };
const B: Variable = { name: 'B', outcomes: ['b0', 'b1', 'b2'] };
const C: Variable = { name: 'C', outcomes: ['c0', 'c1'] };
const D: Variable = { name: 'D', outcomes: ['d0', 'd1', 'd2'] };

function expectClose(actual: Float64Array, expected: Float64Array, tol = 1e-10) {
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < actual.length; i++) {
    expect(actual[i]).toBeCloseTo(expected[i], 10);
  }
}

describe('wasm-factor pack/unpack', () => {
  it('round-trips a simple factor', () => {
    const cards = [2, 3];
    const vals = new Float64Array([1, 2, 3, 4, 5, 6]);
    const packed = packFactor(cards, vals);
    const unpacked = unpackFactor(packed.buffer);
    expect(unpacked.cardinalities).toEqual(cards);
    expectClose(unpacked.values, vals);
  });

  it('round-trips a single-variable factor', () => {
    const cards = [4];
    const vals = new Float64Array([0.1, 0.2, 0.3, 0.4]);
    const packed = packFactor(cards, vals);
    const unpacked = unpackFactor(packed.buffer);
    expect(unpacked.cardinalities).toEqual(cards);
    expectClose(unpacked.values, vals);
  });

  it('round-trips a scalar factor', () => {
    const cards: number[] = [];
    const vals = new Float64Array([42]);
    const packed = packFactor(cards, vals);
    const unpacked = unpackFactor(packed.buffer);
    expect(unpacked.cardinalities).toEqual(cards);
    expectClose(unpacked.values, vals);
  });
});

describe('wasmStyleMultiplyAuto', () => {
  it('multiplies factors with a shared variable (A,B) * (B,C)', () => {
    // f1: A(2) x B(3), f2: B(3) x C(2)
    // result: A(2) x B(3) x C(2) = 12 entries
    const f1Vals = new Float64Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]);
    const f2Vals = new Float64Array([0.7, 0.8, 0.9, 1.0, 1.1, 1.2]);

    const buf1 = packFactor([2, 3], f1Vals).buffer;
    const buf2 = packFactor([3, 2], f2Vals).buffer;

    // Result variables: A(0), B(1), C(2)  (union: A from f1, B shared, C from f2)
    // f1 var indices: A->0, B->1
    // f2 var indices: B->1, C->2
    const resultBuf = wasmStyleMultiplyAuto(buf1, buf2, [2, 3, 2], [0, 1], [1, 2]);
    const result = unpackFactor(resultBuf);

    // Compare with reference implementation
    const ref1 = createFactor([A, B], f1Vals);
    const ref2 = createFactor([B, C], f2Vals);
    const refProduct = multiplyFactors(ref1, ref2);

    expect(result.cardinalities).toEqual([2, 3, 2]);
    expectClose(result.values, refProduct.values);
  });

  it('multiplies factors with disjoint variables (A) * (B)', () => {
    const f1Vals = new Float64Array([0.3, 0.7]);
    const f2Vals = new Float64Array([0.1, 0.2, 0.7]);

    const buf1 = packFactor([2], f1Vals).buffer;
    const buf2 = packFactor([3], f2Vals).buffer;

    // Result: A(0), B(1)
    const resultBuf = wasmStyleMultiplyAuto(buf1, buf2, [2, 3], [0], [1]);
    const result = unpackFactor(resultBuf);

    const ref1 = createFactor([A], f1Vals);
    const ref2 = createFactor([B], f2Vals);
    const refProduct = multiplyFactors(ref1, ref2);

    expectClose(result.values, refProduct.values);
  });

  it('multiplies factors where one is a subset (A,B) * (A)', () => {
    const f1Vals = new Float64Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]);
    const f2Vals = new Float64Array([0.3, 0.7]);

    const buf1 = packFactor([2, 3], f1Vals).buffer;
    const buf2 = packFactor([2], f2Vals).buffer;

    // Result: A(0), B(1)
    const resultBuf = wasmStyleMultiplyAuto(buf1, buf2, [2, 3], [0, 1], [0]);
    const result = unpackFactor(resultBuf);

    const ref1 = createFactor([A, B], f1Vals);
    const ref2 = createFactor([A], f2Vals);
    const refProduct = multiplyFactors(ref1, ref2);

    expectClose(result.values, refProduct.values);
  });

  it('multiplies 3-variable overlap: (A,B,C) * (B,C,D)', () => {
    const cards1 = [2, 3, 2]; // A, B, C
    const cards2 = [3, 2, 3]; // B, C, D
    const size1 = 2 * 3 * 2;
    const size2 = 3 * 2 * 3;
    const f1Vals = new Float64Array(size1);
    const f2Vals = new Float64Array(size2);
    for (let i = 0; i < size1; i++) f1Vals[i] = (i + 1) / size1;
    for (let i = 0; i < size2; i++) f2Vals[i] = (i + 1) / size2;

    const buf1 = packFactor(cards1, f1Vals).buffer;
    const buf2 = packFactor(cards2, f2Vals).buffer;

    // Result: A(0), B(1), C(2), D(3) = [2,3,2,3]
    const resultBuf = wasmStyleMultiplyAuto(
      buf1, buf2,
      [2, 3, 2, 3],
      [0, 1, 2],    // f1: A->0, B->1, C->2
      [1, 2, 3],    // f2: B->1, C->2, D->3
    );
    const result = unpackFactor(resultBuf);

    const ref1 = createFactor([A, B, C], f1Vals);
    const ref2 = createFactor([B, C, D], f2Vals);
    const refProduct = multiplyFactors(ref1, ref2);

    expect(result.cardinalities).toEqual([2, 3, 2, 3]);
    expectClose(result.values, refProduct.values);
  });
});

describe('wasmStyleMarginalizeAuto', () => {
  it('marginalizes trailing variable: (A,B) remove B', () => {
    const vals = new Float64Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]);
    const buf = packFactor([2, 3], vals).buffer;

    const resultBuf = wasmStyleMarginalizeAuto(buf, [1]); // remove index 1 (B)
    const result = unpackFactor(resultBuf);

    const ref = createFactor([A, B], vals);
    const refMarg = marginalize(ref, [B]);

    expect(result.cardinalities).toEqual([2]);
    expectClose(result.values, refMarg.values);
  });

  it('marginalizes leading variable: (A,B) remove A', () => {
    const vals = new Float64Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]);
    const buf = packFactor([2, 3], vals).buffer;

    const resultBuf = wasmStyleMarginalizeAuto(buf, [0]); // remove index 0 (A)
    const result = unpackFactor(resultBuf);

    const ref = createFactor([A, B], vals);
    const refMarg = marginalize(ref, [A]);

    expect(result.cardinalities).toEqual([3]);
    expectClose(result.values, refMarg.values);
  });

  it('marginalizes middle variable: (A,B,C) remove B', () => {
    const size = 2 * 3 * 2;
    const vals = new Float64Array(size);
    for (let i = 0; i < size; i++) vals[i] = (i + 1) / size;

    const buf = packFactor([2, 3, 2], vals).buffer;
    const resultBuf = wasmStyleMarginalizeAuto(buf, [1]); // remove B (index 1)
    const result = unpackFactor(resultBuf);

    const ref = createFactor([A, B, C], vals);
    const refMarg = marginalize(ref, [B]);

    expect(result.cardinalities).toEqual([2, 2]);
    expectClose(result.values, refMarg.values);
  });

  it('marginalizes multiple variables: (A,B,C,D) remove B,D', () => {
    const size = 2 * 3 * 2 * 3;
    const vals = new Float64Array(size);
    for (let i = 0; i < size; i++) vals[i] = (i + 1) / size;

    const buf = packFactor([2, 3, 2, 3], vals).buffer;
    const resultBuf = wasmStyleMarginalizeAuto(buf, [1, 3]); // remove B, D
    const result = unpackFactor(resultBuf);

    const ref = createFactor([A, B, C, D], vals);
    const refMarg = marginalize(ref, [B, D]);

    expect(result.cardinalities).toEqual([2, 2]);
    expectClose(result.values, refMarg.values);
  });

  it('marginalizes all but one: (A,B,C) remove A,B', () => {
    const size = 2 * 3 * 2;
    const vals = new Float64Array(size);
    for (let i = 0; i < size; i++) vals[i] = (i + 1) / size;

    const buf = packFactor([2, 3, 2], vals).buffer;
    const resultBuf = wasmStyleMarginalizeAuto(buf, [0, 1]); // remove A, B
    const result = unpackFactor(resultBuf);

    const ref = createFactor([A, B, C], vals);
    const refMarg = marginalize(ref, [A, B]);

    expect(result.cardinalities).toEqual([2]);
    expectClose(result.values, refMarg.values);
  });

  it('marginalizes everything to a scalar', () => {
    const vals = new Float64Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]);
    const buf = packFactor([2, 3], vals).buffer;

    const resultBuf = wasmStyleMarginalizeAuto(buf, [0, 1]);
    const result = unpackFactor(resultBuf);

    expect(result.cardinalities).toEqual([]);
    expect(result.values[0]).toBeCloseTo(2.1);
  });
});

describe('wasmStyleMultiplyAuto large random factors match reference', () => {
  function makeVariable(name: string, card: number): Variable {
    const outcomes: string[] = [];
    for (let i = 0; i < card; i++) outcomes.push(`${name}_${i}`);
    return { name, outcomes };
  }

  it('10-var overlap (2^10 * 2^10 -> 2^12)', () => {
    // V0..V9 * V2..V11 = V0..V11 (12 binary variables)
    const vars = Array.from({ length: 12 }, (_, i) => makeVariable(`V${i}`, 2));
    const cards1 = vars.slice(0, 10).map(v => v.outcomes.length);
    const cards2 = vars.slice(2, 12).map(v => v.outcomes.length);
    const resultCards = vars.map(v => v.outcomes.length);
    const size1 = 1024, size2 = 1024;

    const f1Vals = new Float64Array(size1);
    const f2Vals = new Float64Array(size2);
    for (let i = 0; i < size1; i++) f1Vals[i] = Math.random();
    for (let i = 0; i < size2; i++) f2Vals[i] = Math.random();

    const buf1 = packFactor(cards1, f1Vals).buffer;
    const buf2 = packFactor(cards2, f2Vals).buffer;

    // f1 vars: V0..V9  -> result indices [0,1,2,3,4,5,6,7,8,9]
    // f2 vars: V2..V11 -> result indices [2,3,4,5,6,7,8,9,10,11]
    const resultBuf = wasmStyleMultiplyAuto(
      buf1, buf2,
      resultCards,
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      [2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    );
    const result = unpackFactor(resultBuf);

    // Compare with reference
    const ref1 = createFactor(vars.slice(0, 10), f1Vals);
    const ref2 = createFactor(vars.slice(2, 12), f2Vals);
    const refProduct = multiplyFactors(ref1, ref2);

    expect(result.values.length).toBe(refProduct.values.length);
    for (let i = 0; i < result.values.length; i++) {
      expect(result.values[i]).toBeCloseTo(refProduct.values[i], 8);
    }
  });
});
