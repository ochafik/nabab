#!/usr/bin/env npx tsx
/**
 * Performance regression gate. See README ("Performance regression gate").
 *
 *   npm run perf                         measure, compare to the committed baselines, exit 1 on regression
 *   npm run perf:baseline                measure and overwrite bench/perf/{counters,timings}.json
 *   npm run perf:baseline -- --provisional   same, flagging the timings as not recorded on CI hardware
 *
 * Options: --models a,b (substring match on ids), --no-retry, --counters-only
 *
 * Two signals:
 *  - work counters (deterministic: table entries touched, messages, clique sizes): strict, +5 %.
 *  - wall-clock medians, normalised by a calibration micro-benchmark: tolerant (see TIMING_*).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';
import { BayesianNetwork } from '../../src/lib/network.js';
import { createLoopPlan, createFactor, multiplyInto, sumInto } from '../../src/lib/factor.js';
import { workCounters, resetWorkCounters, readWorkCounters } from '../../src/lib/work-counters.js';
import type { Variable } from '../../src/lib/types.js';
import { listModels, readModel, type ModelSpec } from './models.js';
import { OPS, prepare, scenario, type OpName, type Prepared } from './ops.js';

// ─── Tolerances ──────────────────────────────────────────────────────

/** Work counters are deterministic: any growth beyond this is a real change in the amount of work. */
const COUNTER_TOLERANCE = 0.05;
/**
 * Timings: fail if normalised median > baseline * TIMING_FACTOR + TIMING_SLACK_MS.
 * Shared CI runners are noisy (a different host, noisy neighbours, frequency scaling): even after
 * calibration a 1.3-1.5x swing between runs is routine, so 2x is where "slower machine" stops being
 * a plausible explanation and an algorithmic regression (the thing counters can miss, e.g. a slower
 * inner loop) becomes the likely one. The slack absorbs timer granularity, GC pauses and JIT
 * state on sub-millisecond operations, where a ratio is meaningless.
 */
const TIMING_FACTOR = 2.0;
const TIMING_SLACK_MS = 2;
const MIN_REPS = 5;
const TARGET_MS = 250;      // keep repeating until this much time has been spent on the model...
const MAX_REPS = 25;
const MAX_MODEL_MS = 4000;  // ...but never more than this per model (slow models get fewer, >= 3, repeats)
const SLOW_SCENARIO_MS = 800;

const DIR = import.meta.dirname;
const COUNTERS_FILE = join(DIR, 'counters.json');
const TIMINGS_FILE = join(DIR, 'timings.json');
const OUT_DIR = join(DIR, 'out');

// ─── Types ───────────────────────────────────────────────────────────

type Counters = Record<string, Partial<Record<OpName, Record<string, number>>>>;
interface Stat { median: number; min: number; mad: number; n: number }
type Timings = Record<string, Partial<Record<OpName, Stat>>>;
interface TimingsFile {
  version: 1;
  /** True: recorded off CI hardware; the timing gate only warns. */
  provisional: boolean;
  recordedAt: string;
  machine: { platform: string; arch: string; cpu: string; node: string };
  calibrationMs: number;
  models: Timings;
}

// ─── Statistics ──────────────────────────────────────────────────────

const median = (a: number[]): number => {
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const stat = (a: number[]): Stat => {
  const med = median(a);
  return { median: med, min: Math.min(...a), mad: median(a.map(x => Math.abs(x - med))), n: a.length };
};
const round = (x: number, d = 4) => Math.round(x * 10 ** d) / 10 ** d;

// ─── Calibration ─────────────────────────────────────────────────────

/**
 * Fixed workload resembling the real one (the same typed-array kernels plus parsing/allocation),
 * whose time scales with the machine, not with the code under test. Timings are divided by it.
 */
function calibrate(): number {
  const mk = (n: string, card: number): Variable => ({ name: n, outcomes: Array.from({ length: card }, (_, i) => `s${i}`) });
  const vars = [mk('a', 8), mk('b', 8), mk('c', 8), mk('d', 8), mk('e', 8), mk('f', 8)]; // 262144 entries
  const sep = createFactor([vars[1], vars[4]], new Float64Array(64));
  const planSep = createLoopPlan(vars, sep);
  const table = new Float64Array(262144).fill(0.5);
  const small = new Float64Array(64).fill(1.01);
  const out = new Float64Array(64);
  const text = readModel({ id: 'bench/alarm.bif', kind: 'network', path: join(DIR, '..', 'models', 'alarm.bif') });
  const run = () => {
    const t = performance.now();
    for (let i = 0; i < 20; i++) { multiplyInto(table, planSep, small); sumInto(table, planSep, out); }
    for (let i = 0; i < 3; i++) BayesianNetwork.parse(text);
    return performance.now() - t;
  };
  run();
  const times = Array.from({ length: 9 }, run);
  return median(times);
}

// ─── Measurement ─────────────────────────────────────────────────────

function measureCounters(p: Prepared): Counters[string] {
  const res: Counters[string] = {};
  workCounters.enabled = true;
  try {
    scenario(p, {
      op(name, fn) {
        resetWorkCounters();
        const info = fn() ?? {};
        const w = readWorkCounters();
        const rec: Record<string, number> = { ...info };
        if (w.messages > 0) rec.messages = w.messages;
        if (w.entries > 0) rec.entries = w.entries;
        res[name] = rec;
      },
    });
  } finally {
    workCounters.enabled = false;
  }
  return res;
}

function measureTimings(p: Prepared, repsScale = 1): Timings[string] {
  scenario(p, { op: (_n, fn) => { fn(); } }); // warmup (JIT, caches)
  const samples: Partial<Record<OpName, number[]>> = {};
  const started = performance.now();
  let reps = 0;
  for (;;) {
    const t0 = performance.now();
    scenario(p, {
      op(name, fn) {
        const t = performance.now();
        fn();
        (samples[name] ??= []).push(performance.now() - t);
      },
    });
    reps++;
    const scenarioMs = performance.now() - t0;
    const elapsed = performance.now() - started;
    const minReps = scenarioMs > SLOW_SCENARIO_MS ? 3 : MIN_REPS;
    if (reps >= MAX_REPS * repsScale) break;
    if (reps >= minReps && (elapsed >= TARGET_MS * repsScale || elapsed + scenarioMs > MAX_MODEL_MS * repsScale)) break;
  }
  const out: Timings[string] = {};
  for (const op of OPS) if (samples[op]) out[op] = { ...stat(samples[op]!), median: round(stat(samples[op]!).median), min: round(stat(samples[op]!).min), mad: round(stat(samples[op]!).mad) };
  return out;
}

// ─── Comparison ──────────────────────────────────────────────────────

interface CounterRow { model: string; op: string; metric: string; base: number | undefined; cur: number; ratio: number; status: 'ok' | 'FAIL' | 'improved' | 'new' }
interface TimingRow { model: string; op: string; base: number | undefined; cur: number; allowed: number | undefined; ratio: number | undefined; mad: number; status: 'ok' | 'FAIL' | 'warn' | 'new' }

function compareCounters(base: Counters, cur: Counters, subset: boolean): CounterRow[] {
  const rows: CounterRow[] = [];
  for (const [model, ops] of Object.entries(cur)) {
    for (const [op, metrics] of Object.entries(ops)) {
      for (const [metric, v] of Object.entries(metrics!)) {
        const b = base[model]?.[op as OpName]?.[metric];
        if (b === undefined) { rows.push({ model, op, metric, base: b, cur: v, ratio: NaN, status: 'new' }); continue; }
        const ratio = b === 0 ? (v === 0 ? 1 : Infinity) : v / b;
        rows.push({ model, op, metric, base: b, cur: v, ratio, status: ratio > 1 + COUNTER_TOLERANCE ? 'FAIL' : ratio < 1 - COUNTER_TOLERANCE ? 'improved' : 'ok' });
      }
    }
  }
  // Baseline entries that vanished (model deleted / op no longer runs) are changes the developer must acknowledge.
  if (!subset) {
    for (const [model, ops] of Object.entries(base)) {
      for (const [op, metrics] of Object.entries(ops)) {
        for (const [metric, b] of Object.entries(metrics!)) {
          if (cur[model]?.[op as OpName]?.[metric] === undefined) rows.push({ model, op, metric, base: b, cur: NaN, ratio: NaN, status: 'new' });
        }
      }
    }
  }
  return rows;
}

function compareTimings(base: TimingsFile | null, cur: Timings, calib: number): TimingRow[] {
  const rows: TimingRow[] = [];
  const scale = base ? calib / base.calibrationMs : 1; // how much slower this machine is than the baseline's
  for (const [model, ops] of Object.entries(cur)) {
    for (const op of OPS) {
      const c = ops[op];
      if (!c) continue;
      const b = base?.models[model]?.[op];
      if (!b) { rows.push({ model, op, base: undefined, cur: c.median, allowed: undefined, ratio: undefined, mad: c.mad, status: 'new' }); continue; }
      const expected = b.median * scale;
      const allowed = expected * TIMING_FACTOR + TIMING_SLACK_MS;
      const regress = c.median > allowed;
      rows.push({
        model, op, base: round(expected), cur: c.median, allowed: round(allowed), mad: c.mad,
        ratio: expected > 0 ? c.median / expected : undefined,
        status: regress ? (base!.provisional ? 'warn' : 'FAIL') : 'ok',
      });
    }
  }
  return rows;
}

// ─── Reporting ───────────────────────────────────────────────────────

const f = (x: number | undefined, d = 2) => (x === undefined || Number.isNaN(x) ? '-' : x >= 1e6 ? x.toExponential(3) : x.toFixed(x < 10 ? d : x < 100 ? 1 : 0));
const fx = (x: number | undefined) => (x === undefined || Number.isNaN(x) ? '-' : `${x.toFixed(2)}x`);

function report(counterRows: CounterRow[], timingRows: TimingRow[], calib: number, base: TimingsFile | null, retried: string[]): { text: string; failed: boolean } {
  const cFail = counterRows.filter(r => r.status === 'FAIL');
  const cNew = counterRows.filter(r => r.status === 'new');
  const cImp = counterRows.filter(r => r.status === 'improved');
  const tFail = timingRows.filter(r => r.status === 'FAIL');
  const tWarn = timingRows.filter(r => r.status === 'warn');
  const tNew = timingRows.filter(r => r.status === 'new');
  const failed = cFail.length > 0 || cNew.length > 0 || tFail.length > 0;
  const L: string[] = [];
  L.push(`## Performance gate: ${failed ? 'FAILED' : 'passed'}`, '');
  L.push(`- Counters: ${counterRows.length} checked, tolerance +${COUNTER_TOLERANCE * 100}%: ${cFail.length} regressions, ${cImp.length} improvements, ${cNew.length} missing from baseline`);
  L.push(`- Timings: ${timingRows.length} checked, limit = baseline x (calibration ratio) x ${TIMING_FACTOR} + ${TIMING_SLACK_MS} ms: ${tFail.length} failures, ${tWarn.length} warnings${base?.provisional ? ' (baseline is PROVISIONAL: timing gate only warns)' : ''}, ${tNew.length} without baseline`);
  L.push(`- Calibration: ${calib.toFixed(2)} ms now, ${base ? base.calibrationMs.toFixed(2) + ' ms in baseline (machine speed ratio ' + (calib / base.calibrationMs).toFixed(2) + ')' : 'no baseline'}`);
  if (retried.length) L.push(`- Retried once after a failure: ${retried.join(', ')}`);
  L.push('');
  if (cFail.length) {
    L.push('### Work regressions (deterministic)', '', '| model | op | metric | baseline | current | ratio |', '|---|---|---|---:|---:|---:|');
    for (const r of cFail) L.push(`| ${r.model} | ${r.op} | ${r.metric} | ${f(r.base, 0)} | ${f(r.cur, 0)} | ${fx(r.ratio)} |`);
    L.push('', 'The amount of work grew by more than 5%. If that is intended, run `npm run perf:baseline` and commit bench/perf/counters.json.', '');
  }
  if (cNew.length) {
    L.push('### Counters not in the baseline (new/removed model or metric)', '');
    for (const r of cNew.slice(0, 30)) L.push(`- ${r.model} ${r.op} ${r.metric}: baseline ${f(r.base, 0)}, current ${f(r.cur, 0)}`);
    L.push('', 'Run `npm run perf:baseline` and commit bench/perf/*.json.', '');
  }
  if (cImp.length) {
    L.push('### Improvements: lock them in', '');
    for (const r of cImp.slice(0, 30)) L.push(`- ${r.model} ${r.op} ${r.metric}: ${f(r.base, 0)} -> ${f(r.cur, 0)} (${fx(r.ratio)})`);
    L.push('', 'Work dropped by more than 5%: run `npm run perf:baseline` and commit bench/perf/counters.json so the gain cannot silently regress.', '');
  }
  if (tFail.length || tWarn.length) {
    L.push('### Timing regressions', '', '| model | op | baseline ms (scaled) | current ms | limit ms | ratio | status |', '|---|---|---:|---:|---:|---:|---|');
    for (const r of [...tFail, ...tWarn]) L.push(`| ${r.model} | ${r.op} | ${f(r.base)} | ${f(r.cur)} | ${f(r.allowed)} | ${fx(r.ratio)} | ${r.status} |`);
    L.push('');
  }
  L.push('<details><summary>All timings (model x op)</summary>', '', '| model | op | baseline ms (scaled) | current ms | MAD | ratio | status |', '|---|---|---:|---:|---:|---:|---|');
  for (const r of timingRows) L.push(`| ${r.model} | ${r.op} | ${f(r.base)} | ${f(r.cur)} | ${f(r.mad)} | ${fx(r.ratio)} | ${r.status} |`);
  L.push('', '</details>', '');
  L.push('<details><summary>All work counters</summary>', '', '| model | op | metric | baseline | current | ratio | status |', '|---|---|---|---:|---:|---:|---|');
  for (const r of counterRows) L.push(`| ${r.model} | ${r.op} | ${r.metric} | ${f(r.base, 0)} | ${f(r.cur, 0)} | ${fx(r.ratio)} | ${r.status} |`);
  L.push('', '</details>', '');
  return { text: L.join('\n'), failed };
}

// ─── Main ────────────────────────────────────────────────────────────

function main(): void {
  const args = process.argv.slice(2);
  const flag = (n: string) => args.includes(`--${n}`);
  const modelArg = args.find(a => a.startsWith('--models='))?.slice('--models='.length);
  const record = flag('record');
  const provisional = flag('provisional');
  const countersOnly = flag('counters-only');

  let specs: ModelSpec[] = listModels();
  if (modelArg) {
    const wanted = modelArg.split(',');
    specs = specs.filter(s => wanted.some(w => s.id.includes(w)));
  }
  const subset = specs.length !== listModels().length;

  const t0 = performance.now();
  const calib0 = calibrate();
  console.log(`calibration: ${calib0.toFixed(2)} ms`);

  const prepared = specs.map(prepare);
  const counters: Counters = {};
  for (const p of prepared) {
    counters[p.spec.id] = measureCounters(p);
    if (record) {
      const again = measureCounters(p);
      if (JSON.stringify(again) !== JSON.stringify(counters[p.spec.id])) throw new Error(`counters of ${p.spec.id} are not deterministic`);
    }
  }
  console.log(`counters done in ${((performance.now() - t0) / 1000).toFixed(1)} s`);

  const timings: Timings = {};
  if (!countersOnly) {
    for (const p of prepared) timings[p.spec.id] = measureTimings(p);
    console.log(`timings done in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  }
  let calib = Math.min(calib0, calibrate()); // the faster of before/after: less sensitive to a noisy moment

  const machine = { platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model ?? 'unknown', node: process.version };
  const current: TimingsFile = { version: 1, provisional, recordedAt: new Date().toISOString(), machine, calibrationMs: round(calib), models: timings };
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, 'timings.current.json'), JSON.stringify(current, null, 1) + '\n');
  writeFileSync(join(OUT_DIR, 'counters.current.json'), JSON.stringify({ version: 1, models: counters }, null, 1) + '\n');

  if (record) {
    if (!subset) {
      writeFileSync(COUNTERS_FILE, JSON.stringify({ version: 1, models: counters }, null, 1) + '\n');
      if (!countersOnly) writeFileSync(TIMINGS_FILE, JSON.stringify(current, null, 1) + '\n');
      console.log(`wrote ${COUNTERS_FILE}${countersOnly ? '' : ` and ${TIMINGS_FILE}${provisional ? ' (provisional)' : ''}`}`);
    } else {
      console.log('--models given: baseline files not overwritten (see bench/perf/out/*.current.json)');
    }
    return;
  }

  const baseCounters: Counters = existsSync(COUNTERS_FILE) ? JSON.parse(readFileSync(COUNTERS_FILE, 'utf-8')).models : {};
  const baseTimings: TimingsFile | null = existsSync(TIMINGS_FILE) ? JSON.parse(readFileSync(TIMINGS_FILE, 'utf-8')) : null;
  const counterRows = compareCounters(baseCounters, counters, subset);

  let timingRows = countersOnly ? [] : compareTimings(baseTimings, timings, calib);
  // Retry once: re-measure (with twice the repeats) only the models that failed, keep the better median.
  const retried: string[] = [];
  const failedModels = [...new Set(timingRows.filter(r => r.status === 'FAIL').map(r => r.model))];
  if (!flag('no-retry') && failedModels.length > 0) {
    for (const id of failedModels) {
      const p = prepared.find(q => q.spec.id === id)!;
      const again = measureTimings(p, 2);
      for (const op of OPS) {
        if (again[op] && timings[id][op] && again[op]!.median < timings[id][op]!.median) timings[id][op] = again[op];
      }
      retried.push(id);
    }
    calib = Math.min(calib, calibrate());
    timingRows = compareTimings(baseTimings, timings, calib);
  }

  const { text, failed } = report(counterRows, timingRows, calib, baseTimings, retried);
  // Console: everything except the (long) all-rows tables, plus the slowest operations. The step summary has it all.
  const slowest = [...timingRows].sort((a, b) => b.cur - a.cur).slice(0, 12);
  console.log(text.slice(0, text.indexOf('<details>')));
  console.log('Slowest operations:');
  for (const r of slowest) console.log(`  ${r.model.padEnd(24)} ${r.op.padEnd(9)} ${f(r.cur).padStart(8)} ms  (baseline ${f(r.base)} ms, ${fx(r.ratio)})`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + '\n');
  console.log(`total ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  if (failed) process.exit(1);
}

main();
