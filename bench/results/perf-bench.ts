#!/usr/bin/env npx tsx
/**
 * Per-query latency benchmark for exact inference.
 *
 * Usage:
 *   npx tsx bench/results/perf-bench.ts run <label> [model ...]   -> perf-<label>.json
 *   npx tsx bench/results/perf-bench.ts report <before> <after>   -> perf-summary.md
 *
 * Evidence is always consistent: it is read off a forward sample of the model
 * (fixed seed), so the benchmark never hits ImpossibleEvidenceError by accident.
 * The "switch" step moves one observation to the value of a second sample; if
 * that combination happens to be impossible the step is skipped for that model.
 *
 * Steps per repetition on one long-lived CachedInferenceEngine (what the viewer does):
 *   add     observe a 1st, 2nd, 3rd variable
 *   switch  change the outcome of an already observed variable
 *   retract drop one observation
 *   clear   drop all evidence
 *   same    repeat the previous query unchanged
 * The same evidence sequence is also run through the one-shot `infer()` ("uncached"),
 * and, when the library supports it, with `queryVariables` set to a single variable.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseBif } from '../../src/lib/bif-parser.js';
import { BayesianNetwork } from '../../src/lib/network.js';
import { CachedInferenceEngine } from '../../src/lib/cached-inference.js';
import { forwardSample, mulberry32 } from '../../src/lib/sampling.js';
import { estimateInferenceCost, DEFAULT_MAX_CLIQUE_ENTRIES } from '../../src/lib/inference.js';
import type { Evidence } from '../../src/lib/types.js';

const MODELS_DIR = join(import.meta.dirname, '..', 'models');
const RESULTS_DIR = import.meta.dirname;
const DEFAULT_MODELS = [
  'asia', 'child', 'alarm', 'insurance', 'hepar2', 'win95pts', 'hailfinder', 'pathfinder',
  'pigs', 'mildew', 'diabetes', 'water', 'barley', 'andes', 'link',
];

type Step = 'add' | 'switch' | 'retract' | 'clear' | 'same';
const STEPS: Step[] = ['add', 'switch', 'retract', 'clear', 'same'];

interface ModelRun {
  model: string;
  nodes: number;
  maxCliqueEntries: number;
  treewidth: number;
  uncachedMs?: number;
  cachedColdMs?: number;
  cachedMs?: Record<Step, number>;
  cachedAvgMs?: number;
  prunedUncachedMs?: number;
  prunedCachedMs?: number;
  /** Models whose full junction tree exceeds the clique budget: single-variable queries only. */
  hugeModel?: { trials: number; rejected: number; meanMs: number; maxMs: number; meanKept: number };
  error?: string;
}

const round = (n: number) => Math.round(n * 1000) / 1000;
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const time = <T>(fn: () => T): [T, number] => {
  const t = performance.now();
  const r = fn();
  return [r, performance.now() - t];
};

/**
 * For networks too large for full exact inference: random single-variable
 * queries with 0-3 observations, answered on the pruned network. Queries whose
 * pruned network still exceeds the clique budget are rejected by the guard.
 */
function runHugeModel(bn: BayesianNetwork): NonNullable<ModelRun['hugeModel']> {
  const rng = mulberry32(5);
  const nonRoots = bn.variables.filter(v => bn.getParents(v).length > 0);
  const trials = 24;
  const times: number[] = [];
  let kept = 0;
  let rejected = 0;
  for (let t = 0; t < trials; t++) {
    const q = bn.variables[Math.floor(rng() * bn.variables.length)];
    const ev: Evidence = new Map();
    for (let i = 0; i < t % 4; i++) {
      const v = nonRoots[Math.floor(rng() * nonRoots.length)];
      ev.set(v.name, v.outcomes[0]);
    }
    const start = performance.now();
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (bn as any).infer(ev, undefined, { queryVariables: [q] });
      times.push(performance.now() - start);
      kept += result.junctionTree.cliques.reduce((n: number, c: unknown[]) => n + c.length, 0);
    } catch (e) {
      const name = (e as Error).name;
      if (name === 'ImpossibleEvidenceError') continue;
      if (!/exact inference aborted/.test((e as Error).message)) throw e;
      rejected++;
    }
  }
  return {
    trials, rejected,
    meanMs: round(mean(times)), maxMs: round(Math.max(...times)),
    meanKept: round(kept / Math.max(1, times.length)),
  };
}

function runModel(name: string): ModelRun {
  const bn = new BayesianNetwork(parseBif(readFileSync(join(MODELS_DIR, `${name}.bif`), 'utf-8')));
  const cost = estimateInferenceCost(bn.variables, bn.cpts);
  const out: ModelRun = {
    model: name, nodes: bn.variables.length,
    maxCliqueEntries: cost.maxCliqueEntries, treewidth: cost.treewidth,
  };
  if (cost.maxCliqueEntries > DEFAULT_MAX_CLIQUE_ENTRIES) {
    out.hugeModel = runHugeModel(bn);
    return out;
  }
  const sample = forwardSample(bn.variables, bn.cpts, 2, { seed: 7 });
  const rng = mulberry32(11);
  const colOf = new Map(sample.variables.map((v, i) => [v, i]));
  // Observed variables: non-roots with a few outcomes preferred (like a user clicking on nodes).
  const candidates = bn.variables.filter(v => bn.getParents(v).length > 0 && v.outcomes.length > 1);
  const pick = (k: number) => {
    const chosen: typeof candidates = [];
    while (chosen.length < k) {
      const v = candidates[Math.floor(rng() * candidates.length)];
      if (!chosen.includes(v)) chosen.push(v);
    }
    return chosen;
  };
  const [e1, e2, e3] = pick(3);
  const outcome = (v: typeof e1, s: number) => {
    const first = sample.columns[colOf.get(v)!][0];
    const idx = sample.columns[colOf.get(v)!][s];
    // The "switch" outcome (sample 1) must differ from the initial one (sample 0).
    return v.outcomes[s === 1 && idx === first ? (first + 1) % v.outcomes.length : idx];
  };
  const queryVar = pick(1)[0];

  const ev = (entries: Array<[typeof e1, number]>): Evidence =>
    new Map(entries.map(([v, s]) => [v.name, outcome(v, s)]));
  // [step kind, evidence] sequence for one repetition.
  const seq: Array<[Step, Evidence]> = [
    ['clear', new Map()],
    ['add', ev([[e1, 0]])],
    ['add', ev([[e1, 0], [e2, 0]])],
    ['add', ev([[e1, 0], [e2, 0], [e3, 0]])],
    ['same', ev([[e1, 0], [e2, 0], [e3, 0]])],
    ['switch', ev([[e1, 0], [e2, 1], [e3, 0]])],
    ['retract', ev([[e2, 1], [e3, 0]])],
    ['clear', new Map()],
  ];

  const reps = out.maxCliqueEntries > 2e6 ? 1 : out.maxCliqueEntries > 2e5 ? 3 : 7;
  /** Run the sequence `reps` times; per step kind, the mean over positions of the median time across reps. */
  const run = (fn: (e: Evidence) => unknown) => {
    // Small models take microseconds per query: warm up the JIT so the first model run is not penalised.
    if (out.maxCliqueEntries < 2e5) {
      for (let r = 0; r < 20; r++) for (const [, e] of seq) { try { fn(e); } catch { /* impossible evidence */ } }
    }
    const times: number[][] = seq.map(() => []);
    for (let r = 0; r < reps; r++) {
      seq.forEach(([, e], pos) => {
        try {
          times[pos].push(time(() => fn(e))[1]);
        } catch (err) {
          if ((err as Error).name !== 'ImpossibleEvidenceError') throw err;
        }
      });
    }
    const perStep: Record<Step, number[]> = { add: [], switch: [], retract: [], clear: [], same: [] };
    seq.forEach(([kind], pos) => {
      if (times[pos].length) perStep[kind].push([...times[pos]].sort((x, y) => x - y)[times[pos].length >> 1]);
    });
    return perStep;
  };

  // One-shot infer(): rebuilds the junction tree every call.
  const uncachedSteps = run(e => bn.infer(e));
  out.uncachedMs = round(mean(Object.values(uncachedSteps).flat()));

  // Cached engine.
  const engine = new CachedInferenceEngine(bn);
  out.cachedColdMs = round(time(() => engine.infer())[1]);
  const cached = run(e => engine.infer(e));
  out.cachedMs = Object.fromEntries(STEPS.map(s => [s, round(mean(cached[s]))])) as Record<Step, number>;
  out.cachedAvgMs = round(mean(Object.values(cached).flat()));

  // queryVariables (only if the library supports it).
  const supportsQuery = existsSync(join(import.meta.dirname, '..', '..', 'src', 'lib', 'pruning.ts'));
  if (supportsQuery) {
    const q = { queryVariables: [queryVar] };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uncachedQ = run(e => (bn as any).infer(e, undefined, q));
    out.prunedUncachedMs = round(mean(Object.values(uncachedQ).flat()));
    const engineQ = new CachedInferenceEngine(bn);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cachedQ = run(e => (engineQ as any).infer(e, undefined, q));
    out.prunedCachedMs = round(mean(Object.values(cachedQ).flat()));
  }
  return out;
}

function report(beforeLabel: string, afterLabel: string): string {
  const load = (l: string): ModelRun[] =>
    JSON.parse(readFileSync(join(RESULTS_DIR, `perf-${l}.json`), 'utf-8')).models;
  const before = new Map(load(beforeLabel).map(m => [m.model, m]));
  const after = load(afterLabel);
  const f = (n?: number | null) => (n === undefined || n === null || Number.isNaN(n) ? 'n/a' : n >= 100 ? n.toFixed(0) : n.toFixed(2));
  const x = (a?: number | null, b?: number | null) =>
    a == null || b == null || !b || Number.isNaN(a) || Number.isNaN(b) ? 'n/a' : `${(a / b).toFixed(1)}x`;
  let md = `# Per-query latency: before vs after\n\n`;
  md += `Generated by \`bench/results/perf-bench.ts\` (${beforeLabel} vs ${afterLabel}), same machine, same harness. `;
  md += `All times are milliseconds per query, averaged over the evidence sequence (add x3, same, switch, retract, clear), `;
  md += `with consistent evidence taken from a seeded forward sample.\n\n`;
  md += `Platform: ${process.platform} ${process.arch}, Node ${process.version}\n\n`;
  md += `## Cached engine (what the viewer and MCP do on every evidence change)\n\n`;
  md += `| Model | Nodes | Max clique entries | Before avg | After avg | Speedup | Before add | After add | Before switch | After switch | Before clear | After clear | After same |\n`;
  md += `|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|\n`;
  for (const a of after) {
    const b = before.get(a.model);
    if (a.hugeModel) continue;
    if (a.error || !a.cachedMs) { md += `| ${a.model} | ${a.nodes} | ${a.maxCliqueEntries} | ${b?.error ? 'err' : f(b?.cachedAvgMs)} | ${a.error ?? 'n/a'} | | | | | | | | |\n`; continue; }
    md += `| ${a.model} | ${a.nodes} | ${a.maxCliqueEntries} | ${f(b?.cachedAvgMs)} | ${f(a.cachedAvgMs)} | ${x(b?.cachedAvgMs, a.cachedAvgMs)} | ${f(b?.cachedMs?.add)} | ${f(a.cachedMs.add)} | ${f(b?.cachedMs?.switch)} | ${f(a.cachedMs.switch)} | ${f(b?.cachedMs?.clear)} | ${f(a.cachedMs.clear)} | ${f(a.cachedMs.same)} |\n`;
  }
  const huge = after.filter(a => a.hugeModel);
  if (huge.length) {
    md += `\n## Networks too large for full exact inference\n\n`;
    md += `Their junction tree has a clique over the default budget (${DEFAULT_MAX_CLIQUE_ENTRIES.toLocaleString()} entries), so every query was refused before (the clique-size guard). `;
    md += `After: random single-variable queries with 0-3 observations, pruned to the relevant sub-network. Rejected means the pruned network still exceeds the budget.\n\n`;
    md += `| Model | Nodes | Largest clique (entries) | Before | Queries | Answered | Rejected | Mean ms | Max ms |\n|---|--:|--:|--|--:|--:|--:|--:|--:|\n`;
    for (const a of huge) {
      const h = a.hugeModel!;
      const b = before.get(a.model);
      md += `| ${a.model} | ${a.nodes} | ${a.maxCliqueEntries.toLocaleString()} | ${b?.hugeModel ? `${b.hugeModel.rejected}/${b.hugeModel.trials} refused (clique budget)` : 'n/a'} | ${h.trials} | ${h.trials - h.rejected} | ${h.rejected} | ${f(h.meanMs)} | ${f(h.maxMs)} |\n`;
    }
  }
  md += `\n## One-shot \`infer()\` (builds the junction tree on every call)\n\n`;
  md += `| Model | Before | After | Speedup | Cold cached build, before | Cold cached build, after |\n|---|--:|--:|--:|--:|--:|\n`;
  for (const a of after) {
    const b = before.get(a.model);
    if (a.error || a.hugeModel) continue;
    md += `| ${a.model} | ${f(b?.uncachedMs)} | ${f(a.uncachedMs)} | ${x(b?.uncachedMs, a.uncachedMs)} | ${f(b?.cachedColdMs)} | ${f(a.cachedColdMs)} |\n`;
  }
  md += `\n## Single-variable query (\`queryVariables: [v]\`), after only\n\n`;
  md += `Compared against the full all-variables query on the same engine type.\n\n`;
  md += `| Model | One-shot, all vars | One-shot, 1 var | Speedup | Cached, all vars | Cached, 1 var | Speedup |\n|---|--:|--:|--:|--:|--:|--:|\n`;
  for (const a of after) {
    if (a.error || a.hugeModel || a.prunedCachedMs === undefined) continue;
    md += `| ${a.model} | ${f(a.uncachedMs)} | ${f(a.prunedUncachedMs)} | ${x(a.uncachedMs, a.prunedUncachedMs)} | ${f(a.cachedAvgMs)} | ${f(a.prunedCachedMs)} | ${x(a.cachedAvgMs, a.prunedCachedMs)} |\n`;
  }
  return md;
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'run') {
  const [label, ...models] = rest;
  const names = models.length ? models : DEFAULT_MODELS;
  const results: ModelRun[] = [];
  for (const name of names) {
    process.stderr.write(`${name}... `);
    try {
      const r = runModel(name);
      results.push(r);
      process.stderr.write(r.hugeModel ? `pruned only, mean ${r.hugeModel.meanMs} ms\n` : `cached avg ${r.cachedAvgMs} ms, uncached ${r.uncachedMs} ms\n`);
    } catch (e) {
      const msg = (e as Error).message.slice(0, 200);
      process.stderr.write(`FAILED ${msg}\n`);
      results.push({ model: name, nodes: 0, maxCliqueEntries: 0, treewidth: 0, error: msg });
    }
  }
  const file = join(RESULTS_DIR, `perf-${label}.json`);
  if (models.length && existsSync(file)) {
    // Merge into an existing file (e.g. adding munin1 separately).
    const prev: ModelRun[] = JSON.parse(readFileSync(file, 'utf-8')).models;
    const keep = prev.filter(p => !results.some(r => r.model === p.model));
    results.unshift(...keep);
  }
  writeFileSync(file, JSON.stringify({ platform: `${process.platform} ${process.arch}`, node: process.version, models: results }, null, 2));
} else if (cmd === 'report') {
  writeFileSync(join(RESULTS_DIR, 'perf-summary.md'), report(rest[0], rest[1]));
} else {
  console.error('usage: perf-bench.ts run <label> [model...] | report <before> <after>');
  process.exit(1);
}
