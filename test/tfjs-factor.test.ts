/**
 * Tests for GPU-accelerated (tfjs) factor operations.
 *
 * Compares tfjs implementations against the native (CPU, Float64Array)
 * factor operations for correctness, then measures timing on larger factors.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import {
  createFactor,
  constantFactor,
  multiplyFactors,
  marginalize,
  tableSize,
} from '../src/lib/factor.js';
import {
  ensureBackend,
  factorToTensor,
  tensorToFactor,
  tfjsMultiplyFactors,
  tfjsMarginalize,
} from '../src/lib/tfjs-factor.js';
import type { Variable } from '../src/lib/types.js';

// ---------------------------------------------------------------------------
// Test variables
// ---------------------------------------------------------------------------
const A: Variable = { name: 'A', outcomes: ['a0', 'a1'] };
const B: Variable = { name: 'B', outcomes: ['b0', 'b1', 'b2'] };
const C: Variable = { name: 'C', outcomes: ['c0', 'c1'] };
const D: Variable = { name: 'D', outcomes: ['d0', 'd1', 'd2', 'd3'] };

beforeAll(async () => {
  await ensureBackend();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a random Float64Array of length n with values in [0,1). */
function randomValues(n: number): Float64Array {
  const arr = new Float64Array(n);
  for (let i = 0; i < n; i++) arr[i] = Math.random();
  return arr;
}

/** Assert two Float64Arrays are element-wise close. */
function expectClose(actual: Float64Array, expected: Float64Array, tol = 1e-5) {
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < actual.length; i++) {
    expect(actual[i]).toBeCloseTo(expected[i], 4);
  }
}

// ---------------------------------------------------------------------------
// Conversion round-trip
// ---------------------------------------------------------------------------
describe('factorToTensor / tensorToFactor round-trip', () => {
  it('round-trips a simple factor', () => {
    const f = createFactor([A, B], new Float64Array([1, 2, 3, 4, 5, 6]));
    const { tensor, variables } = factorToTensor(f);
    expect(tensor.shape).toEqual([2, 3]);
    expect(variables).toEqual([A, B]);
    const back = tensorToFactor(tensor, variables);
    expectClose(back.values, f.values);
    tensor.dispose();
  });

  it('round-trips a scalar factor', () => {
    const f = constantFactor(42);
    const { tensor, variables } = factorToTensor(f);
    expect(tensor.shape).toEqual([]);
    expect(variables).toEqual([]);
    const back = tensorToFactor(tensor, variables);
    expect(back.values[0]).toBeCloseTo(42);
    tensor.dispose();
  });
});

// ---------------------------------------------------------------------------
// multiplyFactors correctness
// ---------------------------------------------------------------------------
describe('tfjsMultiplyFactors', () => {
  it('matches native for factors with shared variables', () => {
    const f1 = createFactor([A], new Float64Array([0.3, 0.7]));
    const f2 = createFactor([A, B], new Float64Array([
      0.1, 0.2, 0.3,
      0.4, 0.5, 0.6,
    ]));
    const native = multiplyFactors(f1, f2);
    const tfjs = tfjsMultiplyFactors(f1, f2);
    expect(tfjs.variables).toEqual(native.variables);
    expectClose(tfjs.values, native.values);
  });

  it('matches native for factors with disjoint variables', () => {
    const f1 = createFactor([A], new Float64Array([0.3, 0.7]));
    const f2 = createFactor([B], new Float64Array([0.1, 0.2, 0.7]));
    const native = multiplyFactors(f1, f2);
    const tfjs = tfjsMultiplyFactors(f1, f2);
    expect(tfjs.variables).toEqual(native.variables);
    expectClose(tfjs.values, native.values);
  });

  it('matches native for factors with partially overlapping variables', () => {
    const f1 = createFactor([A, B], new Float64Array([
      0.1, 0.2, 0.3,
      0.4, 0.5, 0.6,
    ]));
    const f2 = createFactor([B, C], new Float64Array([
      0.1, 0.9,
      0.2, 0.8,
      0.3, 0.7,
    ]));
    const native = multiplyFactors(f1, f2);
    const tfjs = tfjsMultiplyFactors(f1, f2);
    expect(tfjs.variables).toEqual(native.variables);
    expectClose(tfjs.values, native.values);
  });

  it('matches native when f2 variable order differs from union', () => {
    // f1 has [B, A], f2 has [A, C] -- union should be [B, A, C]
    const f1 = createFactor([B, A], new Float64Array([
      0.1, 0.2,
      0.3, 0.4,
      0.5, 0.6,
    ]));
    const f2 = createFactor([A, C], new Float64Array([
      0.9, 0.1,
      0.4, 0.6,
    ]));
    const native = multiplyFactors(f1, f2);
    const tfjs = tfjsMultiplyFactors(f1, f2);
    expect(tfjs.variables).toEqual(native.variables);
    expectClose(tfjs.values, native.values);
  });

  it('handles constant factor on the left', () => {
    const f1 = constantFactor(2.5);
    const f2 = createFactor([A, B], new Float64Array([1, 2, 3, 4, 5, 6]));
    const native = multiplyFactors(f1, f2);
    const tfjs = tfjsMultiplyFactors(f1, f2);
    expect(tfjs.variables).toEqual(native.variables);
    expectClose(tfjs.values, native.values);
  });

  it('handles constant factor on the right', () => {
    const f1 = createFactor([A], new Float64Array([3, 7]));
    const f2 = constantFactor(0.5);
    const native = multiplyFactors(f1, f2);
    const tfjs = tfjsMultiplyFactors(f1, f2);
    expect(tfjs.variables).toEqual(native.variables);
    expectClose(tfjs.values, native.values);
  });

  it('matches native for random 3-variable factors with overlap', () => {
    const f1 = createFactor([A, B], randomValues(tableSize([A, B])));
    const f2 = createFactor([B, C], randomValues(tableSize([B, C])));
    const native = multiplyFactors(f1, f2);
    const tfjs = tfjsMultiplyFactors(f1, f2);
    expect(tfjs.variables).toEqual(native.variables);
    expectClose(tfjs.values, native.values);
  });
});

// ---------------------------------------------------------------------------
// marginalize correctness
// ---------------------------------------------------------------------------
describe('tfjsMarginalize', () => {
  it('matches native: marginalize out last variable', () => {
    const f = createFactor([A, B], new Float64Array([
      0.1, 0.2, 0.3,
      0.4, 0.5, 0.6,
    ]));
    const native = marginalize(f, [B]);
    const tfjs = tfjsMarginalize(f, [B]);
    expect(tfjs.variables).toEqual(native.variables);
    expectClose(tfjs.values, native.values);
  });

  it('matches native: marginalize out first variable', () => {
    const f = createFactor([A, B], new Float64Array([
      0.1, 0.2, 0.3,
      0.4, 0.5, 0.6,
    ]));
    const native = marginalize(f, [A]);
    const tfjs = tfjsMarginalize(f, [A]);
    expect(tfjs.variables).toEqual(native.variables);
    expectClose(tfjs.values, native.values);
  });

  it('matches native: marginalize out all variables', () => {
    const f = createFactor([A, B], new Float64Array([
      0.1, 0.2, 0.3,
      0.4, 0.5, 0.6,
    ]));
    const native = marginalize(f, [A, B]);
    const tfjs = tfjsMarginalize(f, [A, B]);
    expect(tfjs.variables).toEqual(native.variables);
    expectClose(tfjs.values, native.values);
  });

  it('returns same factor when removing nothing', () => {
    const f = createFactor([A], new Float64Array([0.3, 0.7]));
    const result = tfjsMarginalize(f, []);
    expect(result).toBe(f); // same reference
  });

  it('matches native: marginalize middle variable from 3-var factor', () => {
    const f = createFactor([A, B, C], randomValues(tableSize([A, B, C])));
    const native = marginalize(f, [B]);
    const tfjs = tfjsMarginalize(f, [B]);
    expect(tfjs.variables).toEqual(native.variables);
    expectClose(tfjs.values, native.values);
  });

  it('matches native: marginalize two variables from 3-var factor', () => {
    const f = createFactor([A, B, C], randomValues(tableSize([A, B, C])));
    const native = marginalize(f, [A, C]);
    const tfjs = tfjsMarginalize(f, [A, C]);
    expect(tfjs.variables).toEqual(native.variables);
    expectClose(tfjs.values, native.values);
  });
});

// ---------------------------------------------------------------------------
// Large-factor correctness and timing
// ---------------------------------------------------------------------------
describe('large factor operations', () => {
  // 5 variables, 4 outcomes each = 4^5 = 1024 entries
  const vars4: Variable[] = [];
  for (let i = 0; i < 5; i++) {
    vars4.push({ name: `V${i}`, outcomes: ['o0', 'o1', 'o2', 'o3'] });
  }

  it('multiply: correctness on large factors (1024 entries each, 3-var overlap)', () => {
    // f1 over [V0, V1, V2], f2 over [V1, V2, V3] -- overlap on V1, V2
    const f1Vars = [vars4[0], vars4[1], vars4[2]];
    const f2Vars = [vars4[1], vars4[2], vars4[3]];
    const f1 = createFactor(f1Vars, randomValues(tableSize(f1Vars)));
    const f2 = createFactor(f2Vars, randomValues(tableSize(f2Vars)));

    const native = multiplyFactors(f1, f2);
    const tfjs = tfjsMultiplyFactors(f1, f2);
    expect(tfjs.variables).toEqual(native.variables);
    expectClose(tfjs.values, native.values);
  });

  it('marginalize: correctness on large factor (1024 entries, remove 2 vars)', () => {
    const f = createFactor(vars4, randomValues(tableSize(vars4)));
    const toRemove = [vars4[1], vars4[3]];
    const native = marginalize(f, toRemove);
    const tfjs = tfjsMarginalize(f, toRemove);
    expect(tfjs.variables).toEqual(native.variables);
    expectClose(tfjs.values, native.values);
  });

  it('timing comparison: multiply (informational)', () => {
    const f1Vars = [vars4[0], vars4[1], vars4[2]];
    const f2Vars = [vars4[1], vars4[2], vars4[3]];
    const f1 = createFactor(f1Vars, randomValues(tableSize(f1Vars)));
    const f2 = createFactor(f2Vars, randomValues(tableSize(f2Vars)));

    const iterations = 100;

    const nativeStart = performance.now();
    for (let i = 0; i < iterations; i++) multiplyFactors(f1, f2);
    const nativeMs = performance.now() - nativeStart;

    const tfjsStart = performance.now();
    for (let i = 0; i < iterations; i++) tfjsMultiplyFactors(f1, f2);
    const tfjsMs = performance.now() - tfjsStart;

    console.log(`  multiply ${iterations}x (64-entry factors -> 256-entry result):`);
    console.log(`    native: ${nativeMs.toFixed(1)} ms`);
    console.log(`    tfjs:   ${tfjsMs.toFixed(1)} ms`);
    console.log(`    ratio:  ${(tfjsMs / nativeMs).toFixed(2)}x`);

    // We just want this to not crash; no assertion on speed.
    expect(true).toBe(true);
  });

  it('timing comparison: marginalize (informational)', () => {
    const f = createFactor(vars4, randomValues(tableSize(vars4)));
    const toRemove = [vars4[1], vars4[3]];

    const iterations = 100;

    const nativeStart = performance.now();
    for (let i = 0; i < iterations; i++) marginalize(f, toRemove);
    const nativeMs = performance.now() - nativeStart;

    const tfjsStart = performance.now();
    for (let i = 0; i < iterations; i++) tfjsMarginalize(f, toRemove);
    const tfjsMs = performance.now() - tfjsStart;

    console.log(`  marginalize ${iterations}x (1024-entry factor, remove 2 vars):`);
    console.log(`    native: ${nativeMs.toFixed(1)} ms`);
    console.log(`    tfjs:   ${tfjsMs.toFixed(1)} ms`);
    console.log(`    ratio:  ${(tfjsMs / nativeMs).toFixed(2)}x`);

    expect(true).toBe(true);
  });

  it('timing comparison: large multiply (informational)', () => {
    // Bigger test: 6 variables with 5 outcomes each = 15625 entries
    const bigVars: Variable[] = [];
    for (let i = 0; i < 6; i++) {
      bigVars.push({ name: `W${i}`, outcomes: ['o0', 'o1', 'o2', 'o3', 'o4'] });
    }
    // f1 over [W0..W3] (625 entries), f2 over [W2..W5] (625 entries)
    // union is [W0..W5] (15625 entries)
    const f1Vars = bigVars.slice(0, 4);
    const f2Vars = bigVars.slice(2, 6);
    const f1 = createFactor(f1Vars, randomValues(tableSize(f1Vars)));
    const f2 = createFactor(f2Vars, randomValues(tableSize(f2Vars)));

    const iterations = 20;

    const nativeStart = performance.now();
    for (let i = 0; i < iterations; i++) multiplyFactors(f1, f2);
    const nativeMs = performance.now() - nativeStart;

    const tfjsStart = performance.now();
    for (let i = 0; i < iterations; i++) tfjsMultiplyFactors(f1, f2);
    const tfjsMs = performance.now() - tfjsStart;

    console.log(`  large multiply ${iterations}x (625-entry factors -> 15625-entry result):`);
    console.log(`    native: ${nativeMs.toFixed(1)} ms`);
    console.log(`    tfjs:   ${tfjsMs.toFixed(1)} ms`);
    console.log(`    ratio:  ${(tfjsMs / nativeMs).toFixed(2)}x`);

    // Verify correctness on the last iteration
    const native = multiplyFactors(f1, f2);
    const tfjs = tfjsMultiplyFactors(f1, f2);
    expectClose(tfjs.values, native.values);
  });
});
