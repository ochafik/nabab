#!/usr/bin/env npx tsx
/**
 * Benchmark runner for nabab Bayesian inference engine.
 *
 * Usage: npx tsx bench/run-bench.ts [model-name]
 *
 * Loads a BIF model, runs inference (priors + several evidence scenarios),
 * measures timing, and outputs JSON with model stats and timings.
 *
 * Output JSON schema:
 * {
 *   model: string,
 *   nodes: number,
 *   edges: number,
 *   maxCliqueSize: number,
 *   treewidth: number,
 *   timings: { parseMs: number, buildJTMs: number, priorInferMs: number, evidenceInferMs: number[] },
 *   marginals: { [varName: string]: { [outcome: string]: number } }
 * }
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { parseBif } from '../src/lib/bif-parser.js';
import { BayesianNetwork } from '../src/lib/network.js';
import { buildDirectedGraph, buildJunctionTree } from '../src/lib/graph.js';
import type { Variable, Evidence } from '../src/lib/types.js';

const MODELS_DIR = join(import.meta.dirname, 'models');

function timeMs(fn: () => void): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

function timeMsReturn<T>(fn: () => T): [T, number] {
  const start = performance.now();
  const result = fn();
  const elapsed = performance.now() - start;
  return [result, elapsed];
}

/**
 * Generate a few evidence scenarios for the model.
 * Picks the first outcome of a few root nodes and leaf nodes.
 */
function generateEvidenceScenarios(bn: BayesianNetwork): Evidence[] {
  const scenarios: Evidence[] = [];

  // Find roots (no parents) and leaves (no children)
  const roots: Variable[] = [];
  const leaves: Variable[] = [];
  for (const v of bn.variables) {
    const parents = bn.getParents(v);
    const children = bn.getChildren(v);
    if (parents.length === 0) roots.push(v);
    if (children.length === 0) leaves.push(v);
  }

  // Scenario 1: evidence on first root
  if (roots.length > 0) {
    const v = roots[0];
    scenarios.push(new Map([[v.name, v.outcomes[0]]]));
  }

  // Scenario 2: evidence on first leaf
  if (leaves.length > 0) {
    const v = leaves[0];
    scenarios.push(new Map([[v.name, v.outcomes[0]]]));
  }

  // Scenario 3: evidence on first root AND first leaf (diagnostic reasoning)
  if (roots.length > 0 && leaves.length > 0) {
    const r = roots[0];
    const l = leaves[0];
    if (r !== l) {
      scenarios.push(
        new Map([
          [r.name, r.outcomes[0]],
          [l.name, l.outcomes[0]],
        ])
      );
    }
  }

  // Scenario 4: multiple evidence (up to 3 variables from the middle)
  const middleVars = bn.variables.filter(v => {
    const p = bn.getParents(v);
    const c = bn.getChildren(v);
    return p.length > 0 && c.length > 0;
  });
  if (middleVars.length >= 2) {
    const selected = middleVars.slice(0, Math.min(3, middleVars.length));
    scenarios.push(new Map(selected.map(v => [v.name, v.outcomes[0]])));
  }

  return scenarios;
}

function runBenchmark(modelPath: string): object {
  const modelName = basename(modelPath, '.bif');
  const content = readFileSync(modelPath, 'utf-8');

  // Parse
  const [parsed, parseMs] = timeMsReturn(() => parseBif(content));

  // Build network
  const bn = new BayesianNetwork(parsed);

  // Build junction tree (measure separately)
  let maxCliqueSize = 0;
  let treewidth = 0;
  const buildJTMs = timeMs(() => {
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
  let priorMarginals: Map<Variable, Map<string, number>> | undefined;
  const priorInferMs = timeMs(() => {
    const result = bn.infer();
    priorMarginals = result.posteriors;
  });

  // Evidence scenarios
  const scenarios = generateEvidenceScenarios(bn);
  const evidenceInferMs: number[] = [];

  for (const evidence of scenarios) {
    const ms = timeMs(() => {
      bn.infer(evidence);
    });
    evidenceInferMs.push(Math.round(ms * 1000) / 1000);
  }

  // Convert marginals to plain object
  const marginals: Record<string, Record<string, number>> = {};
  if (priorMarginals) {
    for (const [v, dist] of priorMarginals) {
      const obj: Record<string, number> = {};
      for (const [outcome, prob] of dist) {
        obj[outcome] = Math.round(prob * 1e6) / 1e6;
      }
      marginals[v.name] = obj;
    }
  }

  return {
    model: modelName,
    nodes: parsed.variables.length,
    edges: edgeCount,
    maxCliqueSize,
    treewidth,
    timings: {
      parseMs: Math.round(parseMs * 1000) / 1000,
      buildJTMs: Math.round(buildJTMs * 1000) / 1000,
      priorInferMs: Math.round(priorInferMs * 1000) / 1000,
      evidenceInferMs,
      evidenceScenarios: scenarios.map(e => Object.fromEntries(e)),
    },
    marginals,
  };
}

// --- Main ---

const args = process.argv.slice(2);

if (args.length === 0) {
  // Run all models
  const files = readdirSync(MODELS_DIR)
    .filter(f => f.endsWith('.bif'))
    .sort();

  if (files.length === 0) {
    console.error('No .bif files found in', MODELS_DIR);
    console.error('Run: cd bench && ./download-models.sh');
    process.exit(1);
  }

  const results = [];
  for (const file of files) {
    try {
      const result = runBenchmark(join(MODELS_DIR, file));
      results.push(result);
      const r = result as any;
      console.error(
        `${r.model.padEnd(12)} nodes=${String(r.nodes).padStart(3)} edges=${String(r.edges).padStart(3)} ` +
        `tw=${String(r.treewidth).padStart(2)} parse=${String(r.timings.parseMs).padStart(6)}ms ` +
        `JT=${String(r.timings.buildJTMs).padStart(6)}ms infer=${String(r.timings.priorInferMs).padStart(6)}ms`
      );
    } catch (e) {
      console.error(`FAILED: ${file}: ${e}`);
    }
  }
  console.log(JSON.stringify(results, null, 2));
} else {
  // Run specific model(s)
  for (const arg of args) {
    const modelPath = arg.endsWith('.bif') ? arg : join(MODELS_DIR, `${arg}.bif`);
    try {
      const result = runBenchmark(modelPath);
      console.log(JSON.stringify(result, null, 2));
    } catch (e) {
      console.error(`FAILED: ${arg}: ${e}`);
      process.exit(1);
    }
  }
}
