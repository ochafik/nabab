/**
 * Cached inference engine for Bayesian networks.
 *
 * Builds the junction tree (moralize, triangulate, find cliques, MST) and the
 * CPT product of every clique once, and keeps the tree calibrated between
 * queries (see `CalibratedTree`). A query that only adds information to the
 * previous one costs a single outward message pass; retracting or switching
 * evidence re-initialises the affected part of the tree from the cached
 * products; repeating the previous query costs nothing beyond reading marginals.
 *
 * With `queryVariables`, the network is pruned to what the query depends on
 * (see `relevantNetwork`) and a smaller engine is built for that pruned
 * network, then reused for later queries that prune to the same network.
 */
import type { Variable, CPT, Evidence, LikelihoodEvidence } from './types.js';
import { type InferenceResult, buildDag, evidenceSets, readResult } from './inference.js';
import { validateEvidence } from './evidence.js';
import { CalibratedTree, buildLikelihoods } from './calibrated-tree.js';
import { relevantNetwork, resolveQueryVariables } from './pruning.js';
import { type JunctionTree, buildJunctionTree } from './graph.js';
import { BayesianNetwork } from './network.js';

/** Per-call options of `CachedInferenceEngine.infer`. */
export interface CachedInferOptions {
  /**
   * Only compute (and prune the network for) these variables or variable
   * names. Same semantics and caveats as `InferOptions.queryVariables`.
   */
  readonly queryVariables?: readonly (Variable | string)[];
}

/** How many pruned networks to keep engines for. */
const MAX_PRUNED_ENGINES = 16;

/** A calibrated tree over (a pruned part of) the network. */
interface Engine {
  readonly variables: readonly Variable[];
  readonly junctionTree: JunctionTree;
  /** Undefined for a network with no cliques. */
  readonly tree?: CalibratedTree;
}

function createEngine(variables: readonly Variable[], cpts: readonly CPT[]): Engine {
  const junctionTree = buildJunctionTree(buildDag(variables, cpts));
  if (junctionTree.cliques.length === 0) return { variables, junctionTree };
  return {
    variables,
    junctionTree,
    tree: new CalibratedTree(variables, cpts, junctionTree, { cacheInitialPotentials: true }),
  };
}

/**
 * A fingerprint of the network structure used to detect when the cache
 * must be invalidated. Includes variable names, outcomes, parent
 * structure, and CPT table lengths.
 */
function networkFingerprint(network: BayesianNetwork): string {
  const parts: string[] = [];
  for (const v of network.variables) {
    parts.push(`${v.name}:[${v.outcomes.join(',')}]`);
  }
  for (const cpt of network.cpts) {
    const parents = cpt.parents.map(p => p.name).join(',');
    parts.push(`P(${cpt.variable.name}|${parents})=${cpt.table.length}`);
  }
  return parts.join(';');
}

export class CachedInferenceEngine {
  private _network: BayesianNetwork;

  private _fingerprint: string | null = null;
  private _full: Engine | null = null;
  /** Engines for pruned networks, least recently used first. */
  private _pruned = new Map<string, Engine>();

  constructor(network: BayesianNetwork) {
    this._network = network;
  }

  // ── Cache management ──

  private _ensureCache(): Engine {
    const fp = networkFingerprint(this._network);
    if (this._fingerprint !== fp) {
      this._fingerprint = fp;
      this._full = null;
      this._pruned.clear();
    }
    return (this._full ??= createEngine(this._network.variables, this._network.cpts));
  }

  /** The engine for the part of the network needed by `query` given `observed`. */
  private _engineFor(
    full: Engine,
    query: ReadonlySet<Variable>,
    observed: ReadonlySet<Variable>,
    soft: ReadonlySet<Variable>,
  ): Engine {
    const { variables, cpts } = this._network;
    const relevant = relevantNetwork(variables, cpts, query, observed, soft);
    if (relevant.variables.length === variables.length && relevant.cpts.length === cpts.length) return full;

    const index = new Map(variables.map((v, i) => [v, i]));
    const key = `${relevant.variables.map(v => index.get(v)).join(',')}|${relevant.cpts.map(c => index.get(c.variable)).join(',')}`;
    let engine = this._pruned.get(key);
    if (engine) {
      this._pruned.delete(key); // refresh recency
    } else {
      engine = createEngine(relevant.variables, relevant.cpts);
      if (this._pruned.size >= MAX_PRUNED_ENGINES) this._pruned.delete(this._pruned.keys().next().value!);
    }
    this._pruned.set(key, engine);
    return engine;
  }

  // ── Inference ──

  infer(evidence?: Evidence, likelihoodEvidence?: LikelihoodEvidence, options?: CachedInferOptions): InferenceResult {
    const full = this._ensureCache();
    const variables = this._network.variables;
    validateEvidence(variables, evidence, likelihoodEvidence);

    const query = resolveQueryVariables(variables, options?.queryVariables);
    let engine = full;
    if (query) {
      engine = this._engineFor(full, query, ...evidenceSets(variables, evidence, likelihoodEvidence));
    }

    if (!engine.tree) {
      return { posteriors: new Map(), junctionTree: engine.junctionTree, cliquePotentials: new Map(), probabilityOfEvidence: 1 };
    }
    const probabilityOfEvidence = engine.tree.calibrate(buildLikelihoods(engine.variables, evidence, likelihoodEvidence));
    return readResult(engine.tree, engine.variables, query, probabilityOfEvidence);
  }
}
