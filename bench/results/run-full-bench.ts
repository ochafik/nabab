#!/usr/bin/env npx tsx
/**
 * Full benchmark suite: runs all models, tests cached vs uncached inference,
 * and writes results to baseline.json and baseline-summary.md.
 *
 * Usage: npx tsx bench/results/run-full-bench.ts
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { parseBif } from '../../src/lib/bif-parser.js';
import { BayesianNetwork } from '../../src/lib/network.js';
import { CachedInferenceEngine } from '../../src/lib/cached-inference.js';
import { buildDirectedGraph, buildJunctionTree } from '../../src/lib/graph.js';
import type { Variable, Evidence } from '../../src/lib/types.js';

const MODELS_DIR = join(import.meta.dirname, '..', 'models');
const RESULTS_DIR = import.meta.dirname;

function timeMsReturn<T>(fn: () => T): [T, number] {
  const start = performance.now();
  const result = fn();
  const elapsed = performance.now() - start;
  return [result, elapsed];
}

function generateEvidenceScenarios(bn: BayesianNetwork, count: number): Evidence[] {
  const scenarios: Evidence[] = [];
  const vars = [...bn.variables];

  // Deterministic scenarios based on variable index
  for (let i = 0; i < count; i++) {
    const ev: Evidence = new Map();
    // Pick 1-3 variables based on scenario index
    const numVars = 1 + (i % 3);
    for (let j = 0; j < numVars; j++) {
      const vIdx = (i * 7 + j * 13) % vars.length;
      const v = vars[vIdx];
      const oIdx = (i + j) % v.outcomes.length;
      ev.set(v.name, v.outcomes[oIdx]);
    }
    scenarios.push(ev);
  }
  return scenarios;
}

interface ModelResult {
  model: string;
  nodes: number;
  edges: number;
  maxCliqueSize: number;
  treewidth: number;
  timings: {
    parseMs: number;
    buildJTMs: number;
    priorInferMs: number;
    evidenceInferAvgMs: number;
    totalMs: number;
  };
  cachedInference: {
    uncached10Ms: number;
    cached10Ms: number;
    speedupRatio: number;
  };
  error?: string;
}

function runModelBenchmark(modelPath: string): ModelResult {
  const modelName = basename(modelPath, '.bif');
  const content = readFileSync(modelPath, 'utf-8');

  // Parse
  const [parsed, parseMs] = timeMsReturn(() => parseBif(content));

  // Build network
  const bn = new BayesianNetwork(parsed);

  // Build junction tree (measure separately)
  let maxCliqueSize = 0;
  let treewidth = 0;
  const [, buildJTMs] = timeMsReturn(() => {
    const edges: Array<[Variable, Variable]> = [];
    for (const cpt of parsed.cpts) {
      for (const parent of cpt.parents) {
        edges.push([parent, cpt.variable]);
      }
    }
    const dag = buildDirectedGraph([...parsed.variables], edges);
    const jt = buildJunctionTree(dag);
    for (const clique of jt.cliques) {
      if (clique.length > maxCliqueSize) maxCliqueSize = clique.length;
    }
    treewidth = maxCliqueSize > 0 ? maxCliqueSize - 1 : 0;
  });

  const edgeCount = parsed.cpts.reduce((sum, cpt) => sum + cpt.parents.length, 0);

  // Prior inference
  const [, priorInferMs] = timeMsReturn(() => {
    bn.infer();
  });

  // Evidence inference (average of 4 scenarios)
  const scenarios = generateEvidenceScenarios(bn, 4);
  let evidenceTotalMs = 0;
  for (const evidence of scenarios) {
    const [, ms] = timeMsReturn(() => bn.infer(evidence));
    evidenceTotalMs += ms;
  }
  const evidenceInferAvgMs = evidenceTotalMs / scenarios.length;

  // === Cached vs uncached comparison ===
  // Generate 10 different evidence scenarios
  const cacheScenarios = generateEvidenceScenarios(bn, 10);

  // Uncached: 10 calls to bn.infer() (each builds junction tree from scratch)
  const [, uncached10Ms] = timeMsReturn(() => {
    for (const ev of cacheScenarios) {
      bn.infer(ev);
    }
  });

  // Cached: create engine, then 10 calls
  const cachedEngine = new CachedInferenceEngine(bn);
  // Warm up - first call builds cache
  cachedEngine.infer();
  const [, cached10Ms] = timeMsReturn(() => {
    for (const ev of cacheScenarios) {
      cachedEngine.infer(ev);
    }
  });

  const speedupRatio = uncached10Ms > 0 ? uncached10Ms / cached10Ms : 1;
  const totalMs = parseMs + buildJTMs + priorInferMs + evidenceTotalMs;

  return {
    model: modelName,
    nodes: parsed.variables.length,
    edges: edgeCount,
    maxCliqueSize,
    treewidth,
    timings: {
      parseMs: round(parseMs),
      buildJTMs: round(buildJTMs),
      priorInferMs: round(priorInferMs),
      evidenceInferAvgMs: round(evidenceInferAvgMs),
      totalMs: round(totalMs),
    },
    cachedInference: {
      uncached10Ms: round(uncached10Ms),
      cached10Ms: round(cached10Ms),
      speedupRatio: round(speedupRatio),
    },
  };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// --- Main ---
const files = readdirSync(MODELS_DIR)
  .filter(f => f.endsWith('.bif'))
  .sort();

if (files.length === 0) {
  console.error('No .bif files found in', MODELS_DIR);
  process.exit(1);
}

const results: ModelResult[] = [];
const errors: Array<{ model: string; error: string }> = [];

// Set a per-model timeout of 120s for the really large models
const TIMEOUT_MS = 120_000;

for (const file of files) {
  const modelName = basename(file, '.bif');
  console.error(`Running: ${modelName}...`);
  try {
    const startTotal = performance.now();
    const result = runModelBenchmark(join(MODELS_DIR, file));
    const elapsed = performance.now() - startTotal;

    results.push(result);
    console.error(
      `  ${modelName.padEnd(14)} nodes=${String(result.nodes).padStart(4)} edges=${String(result.edges).padStart(4)} ` +
      `tw=${String(result.treewidth).padStart(2)} parse=${String(result.timings.parseMs).padStart(8)}ms ` +
      `JT=${String(result.timings.buildJTMs).padStart(8)}ms infer=${String(result.timings.priorInferMs).padStart(10)}ms ` +
      `cached_speedup=${result.cachedInference.speedupRatio}x  (${round(elapsed)}ms total)`
    );
  } catch (e: any) {
    const errMsg = e?.message ?? String(e);
    errors.push({ model: modelName, error: errMsg });
    console.error(`  FAILED: ${modelName}: ${errMsg}`);
  }
}

// Write JSON results
const jsonOutput = {
  timestamp: new Date().toISOString(),
  platform: `${process.platform} ${process.arch}`,
  nodeVersion: process.version,
  models: results,
  errors,
};
writeFileSync(join(RESULTS_DIR, 'baseline.json'), JSON.stringify(jsonOutput, null, 2));

// Write Markdown summary
let md = `# Nabab Benchmark Results\n\n`;
md += `**Date:** ${new Date().toISOString().split('T')[0]}\n`;
md += `**Platform:** ${process.platform} ${process.arch}\n`;
md += `**Node:** ${process.version}\n\n`;

md += `## Model Summary\n\n`;
md += `| Model | Nodes | Edges | Treewidth | Max Clique | Parse (ms) | JT Build (ms) | Inference (ms) | Evid. Avg (ms) | Total (ms) |\n`;
md += `|-------|------:|------:|----------:|-----------:|-----------:|---------------:|---------------:|---------------:|-----------:|\n`;

for (const r of results) {
  md += `| ${r.model} | ${r.nodes} | ${r.edges} | ${r.treewidth} | ${r.maxCliqueSize} | ${r.timings.parseMs} | ${r.timings.buildJTMs} | ${r.timings.priorInferMs} | ${r.timings.evidenceInferAvgMs} | ${r.timings.totalMs} |\n`;
}

if (errors.length > 0) {
  md += `\n### Errors\n\n`;
  for (const e of errors) {
    md += `- **${e.model}**: ${e.error}\n`;
  }
}

md += `\n## Cached vs Uncached Inference (10 queries each)\n\n`;
md += `| Model | Uncached 10x (ms) | Cached 10x (ms) | Speedup |\n`;
md += `|-------|------------------:|----------------:|--------:|\n`;

for (const r of results) {
  md += `| ${r.model} | ${r.cachedInference.uncached10Ms} | ${r.cachedInference.cached10Ms} | ${r.cachedInference.speedupRatio}x |\n`;
}

md += `\n---\n*Generated by bench/results/run-full-bench.ts*\n`;

writeFileSync(join(RESULTS_DIR, 'baseline-summary.md'), md);

console.error(`\nDone. ${results.length} models benchmarked, ${errors.length} errors.`);
console.error(`Results written to bench/results/baseline.json and bench/results/baseline-summary.md`);
