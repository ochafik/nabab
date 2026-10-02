/**
 * The operations the viewer performs to display a model for the first time,
 * expressed once and run by two runners: a timing runner and a work-counter
 * runner (see run.ts).
 *
 * Mirrors src/viewer: loadExampleFile -> BayesianNetwork.parse (or CSV
 * structure learning) -> setNetwork (new CachedInferenceEngine) -> autoLayout
 * (dagre) -> render() -> engine.infer(he, se). Then the two interactions a user
 * does first: observe one node, retract it. VOI and sensitivity only run when a
 * node is selected / sensitivity mode is toggled, i.e. not on load, so they are
 * not part of this scenario (re-check src/viewer/graph-render.ts render() when
 * the viewer changes what it computes on load).
 */
import dagre from '@dagrejs/dagre';
import { BayesianNetwork } from '../../src/lib/network.js';
import { CachedInferenceEngine } from '../../src/lib/cached-inference.js';
import { buildDag, estimateInferenceCost } from '../../src/lib/inference.js';
import { buildJunctionTree, junctionTreeCost } from '../../src/lib/graph.js';
import { parseCSV, learnStructure } from '../../src/lib/structure-learning.js';
import { forwardSample } from '../../src/lib/sampling.js';
import type { Evidence, Variable } from '../../src/lib/types.js';
import type { ModelSpec } from './models.js';
import { readModel } from './models.js';

export const OPS = ['parse', 'cost', 'jt', 'priors', 'evidence', 'retract', 'layout'] as const;
export type OpName = (typeof OPS)[number];

/** Numbers an op reports about the work it did (structure sizes); added to the instrumented kernel counts. */
export type OpInfo = Record<string, number> | void;

export interface Runner {
  op(name: OpName, fn: () => OpInfo): void;
}

export interface Prepared {
  spec: ModelSpec;
  text: string;
  /** Observation for the "evidence" op, chosen once and deterministically (null: no usable node). */
  evidence: Evidence | null;
}

/** Parse + choose the evidence node: the middle one of the non-root variables, observed at its forward-sampled value. */
export function prepare(spec: ModelSpec): Prepared {
  const text = readModel(spec);
  const bn = parseModel(spec, text);
  let evidence: Evidence | null = null;
  const candidates = bn.variables.filter(v => bn.getParents(v).length > 0 && v.outcomes.length > 1);
  if (candidates.length > 0) {
    const v = candidates[Math.floor(candidates.length / 2)];
    const sample = forwardSample(bn.variables, bn.cpts, 1, { seed: 7 });
    const col = sample.variables.indexOf(v);
    evidence = new Map([[v.name, v.outcomes[sample.columns[col][0]]]]);
  }
  return { spec, text, evidence };
}

function parseModel(spec: ModelSpec, text: string): BayesianNetwork {
  if (spec.kind === 'csv') return new BayesianNetwork(learnStructure(parseCSV(text)));
  return BayesianNetwork.parse(text);
}

const OVER_BUDGET = /exact inference aborted|clique/i;

/** Run the whole first-display scenario once through `runner`. */
export function scenario(p: Prepared, runner: Runner): void {
  let bn!: BayesianNetwork;
  runner.op('parse', () => {
    bn = parseModel(p.spec, p.text);
    let cptEntries = 0;
    for (const c of bn.cpts) cptEntries += c.table.length;
    return { variables: bn.variables.length, cptEntries };
  });
  runner.op('cost', () => {
    const c = estimateInferenceCost(bn.variables, bn.cpts);
    return { treewidth: c.treewidth, maxCliqueEntries: c.maxCliqueEntries, totalCliqueEntries: c.totalCliqueEntries };
  });
  runner.op('jt', () => {
    const jt = buildJunctionTree(buildDag(bn.variables, bn.cpts));
    const c = junctionTreeCost(jt);
    let separatorEntries = 0;
    for (const [a, ns] of jt.neighbors) {
      for (const b of ns) {
        if (b < a) continue;
        const inB = new Set(jt.cliques[b]);
        separatorEntries += jt.cliques[a].filter(v => inB.has(v)).reduce((n, v) => n * v.outcomes.length, 1);
      }
    }
    return { cliques: c.numCliques, maxCliqueEntries: c.maxCliqueEntries, totalCliqueEntries: c.totalCliqueEntries, separatorEntries };
  });
  // The viewer keeps one CachedInferenceEngine per network: priors build it, later queries reuse it.
  let engine: CachedInferenceEngine | null = null;
  runner.op('priors', () => {
    engine = new CachedInferenceEngine(bn);
    try {
      engine.infer();
    } catch (e) {
      // Networks over the clique budget are rejected up front (the viewer shows an error): the cost of
      // failing fast is what is measured, and nothing else can run.
      if (!OVER_BUDGET.test((e as Error).message)) throw e;
      engine = null;
      return { overBudget: 1 };
    }
  });
  if (engine && p.evidence) {
    const eng: CachedInferenceEngine = engine;
    runner.op('evidence', () => { eng.infer(p.evidence!); });
    runner.op('retract', () => { eng.infer(); });
  }
  runner.op('layout', () => {
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: 'TB', nodesep: 50, ranksep: 70, marginx: 30, marginy: 30, ranker: bn.variables.length > 150 ? 'tight-tree' : 'network-simplex' });
    g.setDefaultEdgeLabel(() => ({}));
    const h = (v: Variable) => (v.outcomes.length === 2 ? 56 : 30 + v.outcomes.length * 24);
    let edges = 0;
    for (const v of bn.variables) g.setNode(v.name, { width: 160, height: h(v) });
    for (const cpt of bn.cpts) for (const par of cpt.parents) { g.setEdge(par.name, cpt.variable.name); edges++; }
    dagre.layout(g);
    return { nodes: bn.variables.length, edges };
  });
}
