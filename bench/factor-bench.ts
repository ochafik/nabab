#!/usr/bin/env npx tsx
/**
 * Micro-benchmark for factor operations (multiplyFactors, marginalize).
 *
 * Usage: npx tsx bench/factor-bench.ts
 *
 * Tests various factor sizes (2-var, 5-var, 10-var) and reports results
 * as a markdown table.
 */
import {
  createFactor,
  multiplyFactors,
  marginalize,
  tableSize,
} from '../src/lib/factor.js';
import type { Variable } from '../src/lib/types.js';

// --- Helpers ---

function makeVariable(name: string, card: number): Variable {
  const outcomes: string[] = [];
  for (let i = 0; i < card; i++) outcomes.push(`${name}_${i}`);
  return { name, outcomes };
}

function makeRandomFactor(variables: Variable[]): ReturnType<typeof createFactor> {
  const size = tableSize(variables);
  const values = new Float64Array(size);
  for (let i = 0; i < size; i++) values[i] = Math.random();
  return createFactor(variables, values);
}

/**
 * Warmup + measure: runs fn `warmup` times to JIT-compile, then
 * measures `iterations` runs and returns median time in ms.
 */
function benchmark(fn: () => void, iterations: number, warmup = 10): number {
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

// --- Scenarios ---

interface BenchResult {
  operation: string;
  scenario: string;
  factorSizeA: number;
  factorSizeB: number;
  resultSize: number;
  medianMs: number;
  opsPerSec: number;
}

const results: BenchResult[] = [];
const iterations = 200;

function addResult(
  operation: string,
  scenario: string,
  sizeA: number,
  sizeB: number,
  resultSize: number,
  medianMs: number,
) {
  results.push({
    operation,
    scenario,
    factorSizeA: sizeA,
    factorSizeB: sizeB,
    resultSize,
    medianMs: Math.round(medianMs * 1000) / 1000,
    opsPerSec: Math.round(1000 / medianMs),
  });
}

// ── multiplyFactors benchmarks ──

console.error('Running multiplyFactors benchmarks...');

// 2-variable factors (binary, shared variable)
{
  const A = makeVariable('A', 2);
  const B = makeVariable('B', 2);
  const C = makeVariable('C', 2);
  const f1 = makeRandomFactor([A, B]);
  const f2 = makeRandomFactor([B, C]);
  const ms = benchmark(() => multiplyFactors(f1, f2), iterations);
  addResult('multiply', '2-var shared (2x2 * 2x2)', f1.values.length, f2.values.length, 8, ms);
}

// 2-variable subset (f2 subset of f1)
{
  const A = makeVariable('A', 3);
  const B = makeVariable('B', 3);
  const f1 = makeRandomFactor([A, B]);
  const f2 = makeRandomFactor([A]);
  const ms = benchmark(() => multiplyFactors(f1, f2), iterations);
  addResult('multiply', '2-var subset (3x3 * 3)', f1.values.length, f2.values.length, 9, ms);
}

// 5-variable factors, 3 shared
{
  const vars = Array.from({ length: 7 }, (_, i) => makeVariable(`V${i}`, 3));
  const f1 = makeRandomFactor(vars.slice(0, 5)); // V0..V4
  const f2 = makeRandomFactor(vars.slice(2, 7)); // V2..V6
  const ms = benchmark(() => multiplyFactors(f1, f2), iterations);
  const resultSize = tableSize(vars);
  addResult('multiply', '5-var overlap (3^5 * 3^5)', f1.values.length, f2.values.length, resultSize, ms);
}

// 5-variable factors, f2 is complete subset of f1
{
  const vars = Array.from({ length: 5 }, (_, i) => makeVariable(`V${i}`, 3));
  const f1 = makeRandomFactor(vars);
  const f2 = makeRandomFactor(vars.slice(0, 3));
  const ms = benchmark(() => multiplyFactors(f1, f2), iterations);
  addResult('multiply', '5-var subset (3^5 * 3^3)', f1.values.length, f2.values.length, f1.values.length, ms);
}

// 10-variable factors, 8 shared (simulates high-treewidth clique merge)
{
  const vars = Array.from({ length: 12 }, (_, i) => makeVariable(`V${i}`, 2));
  const f1 = makeRandomFactor(vars.slice(0, 10)); // V0..V9
  const f2 = makeRandomFactor(vars.slice(2, 12)); // V2..V11
  const ms = benchmark(() => multiplyFactors(f1, f2), iterations);
  const resultSize = tableSize(vars);
  addResult('multiply', '10-var overlap (2^10 * 2^10)', f1.values.length, f2.values.length, resultSize, ms);
}

// Large factor: subset case, big tables
{
  const vars = Array.from({ length: 10 }, (_, i) => makeVariable(`V${i}`, 2));
  const f1 = makeRandomFactor(vars);
  const f2 = makeRandomFactor(vars.slice(0, 5));
  const ms = benchmark(() => multiplyFactors(f1, f2), iterations);
  addResult('multiply', '10-var subset (2^10 * 2^5)', f1.values.length, f2.values.length, f1.values.length, ms);
}

// ── marginalize benchmarks ──

console.error('Running marginalize benchmarks...');

// 2-variable factor, marginalize 1
{
  const A = makeVariable('A', 4);
  const B = makeVariable('B', 4);
  const f = makeRandomFactor([A, B]);
  const ms = benchmark(() => marginalize(f, [B]), iterations);
  addResult('marginalize', '2-var remove last (4x4)', f.values.length, 0, 4, ms);
}

// 2-variable factor, marginalize first
{
  const A = makeVariable('A', 4);
  const B = makeVariable('B', 4);
  const f = makeRandomFactor([A, B]);
  const ms = benchmark(() => marginalize(f, [A]), iterations);
  addResult('marginalize', '2-var remove first (4x4)', f.values.length, 0, 4, ms);
}

// 5-variable factor, marginalize 2 trailing
{
  const vars = Array.from({ length: 5 }, (_, i) => makeVariable(`V${i}`, 3));
  const f = makeRandomFactor(vars);
  const ms = benchmark(() => marginalize(f, vars.slice(3)), iterations);
  addResult('marginalize', '5-var remove 2 trailing (3^5)', f.values.length, 0, tableSize(vars.slice(0, 3)), ms);
}

// 5-variable factor, marginalize 2 leading
{
  const vars = Array.from({ length: 5 }, (_, i) => makeVariable(`V${i}`, 3));
  const f = makeRandomFactor(vars);
  const ms = benchmark(() => marginalize(f, vars.slice(0, 2)), iterations);
  addResult('marginalize', '5-var remove 2 leading (3^5)', f.values.length, 0, tableSize(vars.slice(2)), ms);
}

// 5-variable factor, marginalize 2 middle (general case)
{
  const vars = Array.from({ length: 5 }, (_, i) => makeVariable(`V${i}`, 3));
  const f = makeRandomFactor(vars);
  const ms = benchmark(() => marginalize(f, [vars[1], vars[3]]), iterations);
  addResult('marginalize', '5-var remove 2 middle (3^5)', f.values.length, 0, tableSize([vars[0], vars[2], vars[4]]), ms);
}

// 10-variable factor, marginalize 3 trailing
{
  const vars = Array.from({ length: 10 }, (_, i) => makeVariable(`V${i}`, 2));
  const f = makeRandomFactor(vars);
  const ms = benchmark(() => marginalize(f, vars.slice(7)), iterations);
  addResult('marginalize', '10-var remove 3 trailing (2^10)', f.values.length, 0, tableSize(vars.slice(0, 7)), ms);
}

// 10-variable factor, marginalize 3 general
{
  const vars = Array.from({ length: 10 }, (_, i) => makeVariable(`V${i}`, 2));
  const f = makeRandomFactor(vars);
  const ms = benchmark(() => marginalize(f, [vars[2], vars[5], vars[8]]), iterations);
  const remaining = vars.filter((_, i) => i !== 2 && i !== 5 && i !== 8);
  addResult('marginalize', '10-var remove 3 general (2^10)', f.values.length, 0, tableSize(remaining), ms);
}

// 10-variable factor, marginalize all but 1 (extractDistribution scenario)
{
  const vars = Array.from({ length: 10 }, (_, i) => makeVariable(`V${i}`, 2));
  const f = makeRandomFactor(vars);
  const ms = benchmark(() => marginalize(f, vars.slice(1)), iterations);
  addResult('marginalize', '10-var remove 9 trailing (2^10)', f.values.length, 0, 2, ms);
}

// --- Output results as markdown table ---

console.log('');
console.log('## Factor Operation Benchmarks');
console.log('');
console.log('| Operation | Scenario | Size A | Size B | Result | Median (ms) | Ops/sec |');
console.log('|-----------|----------|-------:|-------:|-------:|------------:|--------:|');
for (const r of results) {
  console.log(
    `| ${r.operation.padEnd(11)} ` +
    `| ${r.scenario.padEnd(38)} ` +
    `| ${String(r.factorSizeA).padStart(6)} ` +
    `| ${String(r.factorSizeB).padStart(6)} ` +
    `| ${String(r.resultSize).padStart(6)} ` +
    `| ${String(r.medianMs).padStart(11)} ` +
    `| ${String(r.opsPerSec).padStart(7)} |`
  );
}
console.log('');
console.log(`_Measured on ${new Date().toISOString()}, ${iterations} iterations, median time._`);
