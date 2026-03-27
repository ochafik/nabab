#!/usr/bin/env npx tsx
/**
 * Benchmark: WASM-style raw-ArrayBuffer factor ops vs regular Factor ops.
 *
 * Usage: npx tsx bench/wasm-style-bench.ts
 *
 * Measures whether eliminating JS object overhead (Map, Array, etc.) in
 * favor of raw typed-array math gives meaningful speedup.
 *
 * If the WASM-style ops are faster, a real WASM (AssemblyScript / C) module
 * would likely be even faster due to SIMD and no GC pauses.
 */
import {
  createFactor,
  multiplyFactors,
  marginalize,
  tableSize,
} from '../src/lib/factor.js';
import {
  packFactor,
  unpackFactor,
  wasmStyleMultiplyAuto,
  wasmStyleMarginalizeAuto,
} from '../src/lib/wasm-factor.js';
import type { Variable } from '../src/lib/types.js';

// ─── Helpers ───────────────────────────────────────────────────────

function makeVariable(name: string, card: number): Variable {
  const outcomes: string[] = [];
  for (let i = 0; i < card; i++) outcomes.push(`${name}_${i}`);
  return { name, outcomes };
}

function benchmark(fn: () => void, iterations: number, warmup = 20): number {
  // Warmup for JIT
  for (let i = 0; i < warmup; i++) fn();

  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)];
}

// ─── Benchmark Scenarios ──────────────────────────────────────────

interface BenchResult {
  scenario: string;
  operation: string;
  resultSize: number;
  jsMedianMs: number;
  wasmStyleMedianMs: number;
  speedup: number;
  jsOpsPerSec: number;
  wasmOpsPerSec: number;
  jsMBPerSec: number;
  wasmMBPerSec: number;
}

const results: BenchResult[] = [];
const iterations = 300;

function addResult(
  operation: string,
  scenario: string,
  resultSize: number,
  jsMs: number,
  wasmMs: number,
) {
  const speedup = jsMs / wasmMs;
  const bytesProcessed = resultSize * 8; // Float64
  results.push({
    scenario,
    operation,
    resultSize,
    jsMedianMs: Math.round(jsMs * 1000) / 1000,
    wasmStyleMedianMs: Math.round(wasmMs * 1000) / 1000,
    speedup: Math.round(speedup * 100) / 100,
    jsOpsPerSec: Math.round(1000 / jsMs),
    wasmOpsPerSec: Math.round(1000 / wasmMs),
    jsMBPerSec: Math.round((bytesProcessed / (jsMs / 1000)) / 1e6 * 100) / 100,
    wasmMBPerSec: Math.round((bytesProcessed / (wasmMs / 1000)) / 1e6 * 100) / 100,
  });
}

// ── Multiply Benchmarks ──────────────────────────────────────────

console.error('Running multiply benchmarks...');

// Small: 2-var shared (A,B) * (B,C), binary
{
  const A = makeVariable('A', 2);
  const B = makeVariable('B', 2);
  const C = makeVariable('C', 2);
  const f1Vals = new Float64Array(4); const f2Vals = new Float64Array(4);
  for (let i = 0; i < 4; i++) { f1Vals[i] = Math.random(); f2Vals[i] = Math.random(); }
  const f1 = createFactor([A, B], f1Vals);
  const f2 = createFactor([B, C], f2Vals);
  const buf1 = packFactor([2, 2], f1Vals).buffer;
  const buf2 = packFactor([2, 2], f2Vals).buffer;

  const jsMs = benchmark(() => multiplyFactors(f1, f2), iterations);
  const wasmMs = benchmark(() => wasmStyleMultiplyAuto(buf1, buf2, [2, 2, 2], [0, 1], [1, 2]), iterations);
  addResult('multiply', '2-var shared (2x2 * 2x2)', 8, jsMs, wasmMs);
}

// Medium: 5-var overlap (3^5 * 3^5 -> 3^7)
{
  const vars = Array.from({ length: 7 }, (_, i) => makeVariable(`V${i}`, 3));
  const size1 = 3**5, size2 = 3**5;
  const f1Vals = new Float64Array(size1);
  const f2Vals = new Float64Array(size2);
  for (let i = 0; i < size1; i++) f1Vals[i] = Math.random();
  for (let i = 0; i < size2; i++) f2Vals[i] = Math.random();

  const f1 = createFactor(vars.slice(0, 5), f1Vals);
  const f2 = createFactor(vars.slice(2, 7), f2Vals);
  const buf1 = packFactor(vars.slice(0, 5).map(v => v.outcomes.length), f1Vals).buffer;
  const buf2 = packFactor(vars.slice(2, 7).map(v => v.outcomes.length), f2Vals).buffer;
  const resultCards = vars.map(v => v.outcomes.length);
  const resultSize = tableSize(vars);

  const jsMs = benchmark(() => multiplyFactors(f1, f2), iterations);
  const wasmMs = benchmark(
    () => wasmStyleMultiplyAuto(buf1, buf2, resultCards, [0,1,2,3,4], [2,3,4,5,6]),
    iterations,
  );
  addResult('multiply', '5-var overlap (3^5 * 3^5)', resultSize, jsMs, wasmMs);
}

// Medium: 5-var subset (3^5 * 3^3)
{
  const vars = Array.from({ length: 5 }, (_, i) => makeVariable(`V${i}`, 3));
  const size1 = 3**5, size2 = 3**3;
  const f1Vals = new Float64Array(size1);
  const f2Vals = new Float64Array(size2);
  for (let i = 0; i < size1; i++) f1Vals[i] = Math.random();
  for (let i = 0; i < size2; i++) f2Vals[i] = Math.random();

  const f1 = createFactor(vars, f1Vals);
  const f2 = createFactor(vars.slice(0, 3), f2Vals);
  const buf1 = packFactor(vars.map(v => v.outcomes.length), f1Vals).buffer;
  const buf2 = packFactor(vars.slice(0, 3).map(v => v.outcomes.length), f2Vals).buffer;
  const resultCards = vars.map(v => v.outcomes.length);

  const jsMs = benchmark(() => multiplyFactors(f1, f2), iterations);
  const wasmMs = benchmark(
    () => wasmStyleMultiplyAuto(buf1, buf2, resultCards, [0,1,2,3,4], [0,1,2]),
    iterations,
  );
  addResult('multiply', '5-var subset (3^5 * 3^3)', size1, jsMs, wasmMs);
}

// Large: 10-var overlap (2^10 * 2^10 -> 2^12)
{
  const vars = Array.from({ length: 12 }, (_, i) => makeVariable(`V${i}`, 2));
  const size1 = 1024, size2 = 1024;
  const f1Vals = new Float64Array(size1);
  const f2Vals = new Float64Array(size2);
  for (let i = 0; i < size1; i++) f1Vals[i] = Math.random();
  for (let i = 0; i < size2; i++) f2Vals[i] = Math.random();

  const f1 = createFactor(vars.slice(0, 10), f1Vals);
  const f2 = createFactor(vars.slice(2, 12), f2Vals);
  const buf1 = packFactor(vars.slice(0, 10).map(v => v.outcomes.length), f1Vals).buffer;
  const buf2 = packFactor(vars.slice(2, 12).map(v => v.outcomes.length), f2Vals).buffer;
  const resultCards = vars.map(v => v.outcomes.length);
  const resultSize = tableSize(vars);

  const jsMs = benchmark(() => multiplyFactors(f1, f2), iterations);
  const wasmMs = benchmark(
    () => wasmStyleMultiplyAuto(buf1, buf2, resultCards,
      [0,1,2,3,4,5,6,7,8,9],
      [2,3,4,5,6,7,8,9,10,11]),
    iterations,
  );
  addResult('multiply', '10-var overlap (2^10 * 2^10)', resultSize, jsMs, wasmMs);
}

// Large subset: 10-var (2^10 * 2^5)
{
  const vars = Array.from({ length: 10 }, (_, i) => makeVariable(`V${i}`, 2));
  const size1 = 1024, size2 = 32;
  const f1Vals = new Float64Array(size1);
  const f2Vals = new Float64Array(size2);
  for (let i = 0; i < size1; i++) f1Vals[i] = Math.random();
  for (let i = 0; i < size2; i++) f2Vals[i] = Math.random();

  const f1 = createFactor(vars, f1Vals);
  const f2 = createFactor(vars.slice(0, 5), f2Vals);
  const buf1 = packFactor(vars.map(v => v.outcomes.length), f1Vals).buffer;
  const buf2 = packFactor(vars.slice(0, 5).map(v => v.outcomes.length), f2Vals).buffer;
  const resultCards = vars.map(v => v.outcomes.length);

  const jsMs = benchmark(() => multiplyFactors(f1, f2), iterations);
  const wasmMs = benchmark(
    () => wasmStyleMultiplyAuto(buf1, buf2, resultCards,
      [0,1,2,3,4,5,6,7,8,9],
      [0,1,2,3,4]),
    iterations,
  );
  addResult('multiply', '10-var subset (2^10 * 2^5)', size1, jsMs, wasmMs);
}

// Very large: 15-var overlap (2^15 * 2^15 -> 2^17)
{
  const vars = Array.from({ length: 17 }, (_, i) => makeVariable(`V${i}`, 2));
  const size1 = 2**15, size2 = 2**15;
  const f1Vals = new Float64Array(size1);
  const f2Vals = new Float64Array(size2);
  for (let i = 0; i < size1; i++) f1Vals[i] = Math.random();
  for (let i = 0; i < size2; i++) f2Vals[i] = Math.random();

  const f1 = createFactor(vars.slice(0, 15), f1Vals);
  const f2 = createFactor(vars.slice(2, 17), f2Vals);
  const buf1 = packFactor(vars.slice(0, 15).map(v => v.outcomes.length), f1Vals).buffer;
  const buf2 = packFactor(vars.slice(2, 17).map(v => v.outcomes.length), f2Vals).buffer;
  const resultCards = vars.map(v => v.outcomes.length);
  const resultSize = tableSize(vars);

  const jsMs = benchmark(() => multiplyFactors(f1, f2), iterations, 5);
  const wasmMs = benchmark(
    () => wasmStyleMultiplyAuto(buf1, buf2, resultCards,
      Array.from({length: 15}, (_, i) => i),
      Array.from({length: 15}, (_, i) => i + 2)),
    iterations, 5,
  );
  addResult('multiply', '15-var overlap (2^15 * 2^15)', resultSize, jsMs, wasmMs);
}

// ── Marginalize Benchmarks ───────────────────────────────────────

console.error('Running marginalize benchmarks...');

// Small: (4x4) remove last
{
  const A = makeVariable('A', 4);
  const B = makeVariable('B', 4);
  const vals = new Float64Array(16);
  for (let i = 0; i < 16; i++) vals[i] = Math.random();

  const f = createFactor([A, B], vals);
  const buf = packFactor([4, 4], vals).buffer;

  const jsMs = benchmark(() => marginalize(f, [B]), iterations);
  const wasmMs = benchmark(() => wasmStyleMarginalizeAuto(buf, [1]), iterations);
  addResult('marginalize', '2-var remove last (4x4)', 4, jsMs, wasmMs);
}

// Small: (4x4) remove first
{
  const A = makeVariable('A', 4);
  const B = makeVariable('B', 4);
  const vals = new Float64Array(16);
  for (let i = 0; i < 16; i++) vals[i] = Math.random();

  const f = createFactor([A, B], vals);
  const buf = packFactor([4, 4], vals).buffer;

  const jsMs = benchmark(() => marginalize(f, [A]), iterations);
  const wasmMs = benchmark(() => wasmStyleMarginalizeAuto(buf, [0]), iterations);
  addResult('marginalize', '2-var remove first (4x4)', 4, jsMs, wasmMs);
}

// Medium: 5-var remove 2 trailing
{
  const vars = Array.from({ length: 5 }, (_, i) => makeVariable(`V${i}`, 3));
  const size = 3**5;
  const vals = new Float64Array(size);
  for (let i = 0; i < size; i++) vals[i] = Math.random();

  const f = createFactor(vars, vals);
  const buf = packFactor(vars.map(v => v.outcomes.length), vals).buffer;
  const resultSize = tableSize(vars.slice(0, 3));

  const jsMs = benchmark(() => marginalize(f, vars.slice(3)), iterations);
  const wasmMs = benchmark(() => wasmStyleMarginalizeAuto(buf, [3, 4]), iterations);
  addResult('marginalize', '5-var remove 2 trailing (3^5)', resultSize, jsMs, wasmMs);
}

// Medium: 5-var remove 2 middle (general case)
{
  const vars = Array.from({ length: 5 }, (_, i) => makeVariable(`V${i}`, 3));
  const size = 3**5;
  const vals = new Float64Array(size);
  for (let i = 0; i < size; i++) vals[i] = Math.random();

  const f = createFactor(vars, vals);
  const buf = packFactor(vars.map(v => v.outcomes.length), vals).buffer;
  const resultSize = tableSize([vars[0], vars[2], vars[4]]);

  const jsMs = benchmark(() => marginalize(f, [vars[1], vars[3]]), iterations);
  const wasmMs = benchmark(() => wasmStyleMarginalizeAuto(buf, [1, 3]), iterations);
  addResult('marginalize', '5-var remove 2 middle (3^5)', resultSize, jsMs, wasmMs);
}

// Large: 10-var remove 3 trailing
{
  const vars = Array.from({ length: 10 }, (_, i) => makeVariable(`V${i}`, 2));
  const size = 1024;
  const vals = new Float64Array(size);
  for (let i = 0; i < size; i++) vals[i] = Math.random();

  const f = createFactor(vars, vals);
  const buf = packFactor(vars.map(v => v.outcomes.length), vals).buffer;
  const resultSize = tableSize(vars.slice(0, 7));

  const jsMs = benchmark(() => marginalize(f, vars.slice(7)), iterations);
  const wasmMs = benchmark(() => wasmStyleMarginalizeAuto(buf, [7, 8, 9]), iterations);
  addResult('marginalize', '10-var remove 3 trailing (2^10)', resultSize, jsMs, wasmMs);
}

// Large: 10-var remove 3 general
{
  const vars = Array.from({ length: 10 }, (_, i) => makeVariable(`V${i}`, 2));
  const size = 1024;
  const vals = new Float64Array(size);
  for (let i = 0; i < size; i++) vals[i] = Math.random();

  const f = createFactor(vars, vals);
  const buf = packFactor(vars.map(v => v.outcomes.length), vals).buffer;
  const remaining = vars.filter((_, i) => i !== 2 && i !== 5 && i !== 8);
  const resultSize = tableSize(remaining);

  const jsMs = benchmark(() => marginalize(f, [vars[2], vars[5], vars[8]]), iterations);
  const wasmMs = benchmark(() => wasmStyleMarginalizeAuto(buf, [2, 5, 8]), iterations);
  addResult('marginalize', '10-var remove 3 general (2^10)', resultSize, jsMs, wasmMs);
}

// Large: 10-var remove 9 trailing (extractDistribution scenario)
{
  const vars = Array.from({ length: 10 }, (_, i) => makeVariable(`V${i}`, 2));
  const size = 1024;
  const vals = new Float64Array(size);
  for (let i = 0; i < size; i++) vals[i] = Math.random();

  const f = createFactor(vars, vals);
  const buf = packFactor(vars.map(v => v.outcomes.length), vals).buffer;

  const jsMs = benchmark(() => marginalize(f, vars.slice(1)), iterations);
  const wasmMs = benchmark(() => wasmStyleMarginalizeAuto(buf, Array.from({length: 9}, (_, i) => i + 1)), iterations);
  addResult('marginalize', '10-var remove 9 trailing (2^10)', 2, jsMs, wasmMs);
}

// Very large: 15-var remove 5 general
{
  const vars = Array.from({ length: 15 }, (_, i) => makeVariable(`V${i}`, 2));
  const size = 2**15;
  const vals = new Float64Array(size);
  for (let i = 0; i < size; i++) vals[i] = Math.random();

  const f = createFactor(vars, vals);
  const buf = packFactor(vars.map(v => v.outcomes.length), vals).buffer;
  const removeIdxs = [1, 4, 7, 10, 13];
  const remaining = vars.filter((_, i) => !removeIdxs.includes(i));
  const resultSize = tableSize(remaining);

  const jsMs = benchmark(() => marginalize(f, removeIdxs.map(i => vars[i])), iterations, 5);
  const wasmMs = benchmark(() => wasmStyleMarginalizeAuto(buf, removeIdxs), iterations, 5);
  addResult('marginalize', '15-var remove 5 general (2^15)', resultSize, jsMs, wasmMs);
}

// ─── Output ──────────────────────────────────────────────────────

console.log('');
console.log('## WASM-Style vs Regular Factor Ops Benchmark');
console.log('');
console.log('| Operation    | Scenario                          | Result size | JS (ms) | WASM-style (ms) | Speedup | JS ops/s | WASM ops/s | JS MB/s | WASM MB/s |');
console.log('|--------------|-----------------------------------|------------:|--------:|-----------------:|--------:|---------:|-----------:|--------:|----------:|');
for (const r of results) {
  const flag = r.speedup >= 1.1 ? ' **' : r.speedup <= 0.9 ? ' *' : '';
  console.log(
    `| ${r.operation.padEnd(12)} ` +
    `| ${r.scenario.padEnd(33)} ` +
    `| ${String(r.resultSize).padStart(11)} ` +
    `| ${String(r.jsMedianMs).padStart(7)} ` +
    `| ${String(r.wasmStyleMedianMs).padStart(16)} ` +
    `| ${String(r.speedup + 'x').padStart(7)}${flag} ` +
    `| ${String(r.jsOpsPerSec).padStart(8)} ` +
    `| ${String(r.wasmOpsPerSec).padStart(10)} ` +
    `| ${String(r.jsMBPerSec).padStart(7)} ` +
    `| ${String(r.wasmMBPerSec).padStart(9)} |`
  );
}

console.log('');
console.log('_Legend: ** = WASM-style faster, * = JS faster_');
console.log('');

// ─── Analysis ────────────────────────────────────────────────────

const avgMultiplySpeedup = results
  .filter(r => r.operation === 'multiply')
  .reduce((sum, r) => sum + r.speedup, 0) / results.filter(r => r.operation === 'multiply').length;
const avgMarginalizeSpeedup = results
  .filter(r => r.operation === 'marginalize')
  .reduce((sum, r) => sum + r.speedup, 0) / results.filter(r => r.operation === 'marginalize').length;
const avgOverall = results.reduce((sum, r) => sum + r.speedup, 0) / results.length;

// Focus on large-table results (where WASM would matter most)
const largeResults = results.filter(r => r.resultSize >= 1024);
const avgLargeSpeedup = largeResults.length > 0
  ? largeResults.reduce((sum, r) => sum + r.speedup, 0) / largeResults.length
  : 0;

console.log('## Analysis');
console.log('');
console.log(`Average multiply speedup:    ${Math.round(avgMultiplySpeedup * 100) / 100}x`);
console.log(`Average marginalize speedup: ${Math.round(avgMarginalizeSpeedup * 100) / 100}x`);
console.log(`Average overall speedup:     ${Math.round(avgOverall * 100) / 100}x`);
console.log(`Average large-table speedup: ${Math.round(avgLargeSpeedup * 100) / 100}x (result >= 1024 entries)`);
console.log('');

// Theoretical WASM additional speedup factors
console.log('## Theoretical WASM Projection');
console.log('');
console.log('Known JS-to-WASM performance ratios for tight numeric loops:');
console.log('  - V8 JIT on hot loops: WASM is typically 1.0x-1.3x vs optimized JS');
console.log('  - SIMD (f64x2 multiply): ~1.5x-2.0x on large arrays');
console.log('  - No GC pressure: saves ~5-15% on allocation-heavy paths');
console.log('  - Fixed-width i32 index math: ~1.0x-1.1x (V8 already uses i32 internally)');
console.log('');

const projectedWasmSpeedup = avgLargeSpeedup * 1.3; // conservative WASM factor
console.log(`Projected real WASM speedup over JS Factor ops: ~${Math.round(projectedWasmSpeedup * 100) / 100}x`);
console.log('');

if (projectedWasmSpeedup >= 1.5) {
  console.log('RECOMMENDATION: WASM is worth pursuing for large factor tables.');
  console.log('The raw-ArrayBuffer approach already shows gains; real WASM with SIMD');
  console.log('would add another ~1.3x on top.');
} else if (projectedWasmSpeedup >= 1.1) {
  console.log('RECOMMENDATION: Marginal gains. WASM might help for very large networks');
  console.log('(high treewidth > 15) but the JS implementation is already well-optimized.');
  console.log('Consider WASM only if profiling shows factor ops as the clear bottleneck.');
} else {
  console.log('RECOMMENDATION: WASM is NOT worth pursuing for factor ops.');
  console.log('V8 JIT compiles the typed-array loops efficiently enough that the');
  console.log('overhead of the JS/WASM boundary and data marshaling would negate gains.');
  console.log('Focus optimization efforts elsewhere (e.g., elimination ordering, caching).');
}

console.log('');
console.log(`_Measured on ${new Date().toISOString()}, ${iterations} iterations, median time._`);
