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
import {
  type InferenceResult,
  assertWithinCliqueBudget,
  buildDag,
  evidenceSets,
  readResult,
  resolveMaxCliqueEntries,
} from './inference.js';
import { validateEvidence } from './evidence.js';
import { CalibratedTree, buildLikelihoods } from './calibrated-tree.js';
import { relevantNetwork, resolveQueryVariables } from './pruning.js';
import { type JunctionTree, type CostEstimate, buildJunctionTree, junctionTreeCost } from './graph.js';
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

/**
 * Below this many total clique-table entries a full query takes a few
 * milliseconds, less than building a junction tree for a pruned network, so
 * `queryVariables` only restricts which posteriors are returned.
 */
const PRUNE_MIN_TABLE_ENTRIES = 2_000_000;

/** The junction tree of (a pruned part of) the network, and its cost. */
interface Structure {
  readonly variables: readonly Variable[];
  readonly cpts: readonly CPT[];
  readonly junctionTree: JunctionTree;
  readonly cost: CostEstimate;
  /** Created on first use: allocating tables of an over-budget tree is refused. */
  tree?: CalibratedTree;
}

function createStructure(variables: readonly Variable[], cpts: readonly CPT[]): Structure {
  const junctionTree = buildJunctionTree(buildDag(variables, cpts));
  return { variables, cpts, junctionTree, cost: junctionTreeCost(junctionTree) };
}

/** The calibrated tree for a structure; throws if its largest clique is over the size budget. */
function treeOf(structure: Structure): CalibratedTree | undefined {
  if (structure.junctionTree.cliques.length === 0) return undefined;
  if (!structure.tree) {
    assertWithinCliqueBudget(structure.cost, resolveMaxCliqueEntries());
    structure.tree = new CalibratedTree(structure.variables, structure.cpts, structure.junctionTree, {
      cacheInitialPotentials: true,
    });
  }
  return structure.tree;
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
  private _full: Structure | null = null;
  /** Structures of pruned networks, least recently used first. */
  private _pruned = new Map<string, Structure>();

  constructor(network: BayesianNetwork) {
    this._network = network;
  }

  // ── Cache management ──

  private _ensureCache(): Structure {
    const fp = networkFingerprint(this._network);
    if (this._fingerprint !== fp) {
      this._fingerprint = fp;
      this._full = null;
      this._pruned.clear();
    }
    return (this._full ??= createStructure(this._network.variables, this._network.cpts));
  }

  /** The structure for the part of the network needed by `query` given the evidence. */
  private _structureFor(
    full: Structure,
    query: ReadonlySet<Variable>,
    observed: ReadonlySet<Variable>,
    soft: ReadonlySet<Variable>,
  ): Structure {
    if (full.cost.totalCliqueEntries < PRUNE_MIN_TABLE_ENTRIES) return full;
    const { variables, cpts } = this._network;
    const relevant = relevantNetwork(variables, cpts, query, observed, soft);
    if (relevant.variables.length === variables.length && relevant.cpts.length === cpts.length) return full;

    const index = new Map(variables.map((v, i) => [v, i]));
    const key = `${relevant.variables.map(v => index.get(v)).join(',')}|${relevant.cpts.map(c => index.get(c.variable)).join(',')}`;
    let structure = this._pruned.get(key);
    if (structure) {
      this._pruned.delete(key); // refresh recency
    } else {
      structure = createStructure(relevant.variables, relevant.cpts);
      if (this._pruned.size >= MAX_PRUNED_ENGINES) this._pruned.delete(this._pruned.keys().next().value!);
    }
    this._pruned.set(key, structure);
    return structure;
  }

  // ── Inference ──

  infer(evidence?: Evidence, likelihoodEvidence?: LikelihoodEvidence, options?: CachedInferOptions): InferenceResult {
    const full = this._ensureCache();
    const variables = this._network.variables;
    validateEvidence(variables, evidence, likelihoodEvidence);

    const query = resolveQueryVariables(variables, options?.queryVariables);
    const structure = query
      ? this._structureFor(full, query, ...evidenceSets(variables, evidence, likelihoodEvidence))
      : full;

    const tree = treeOf(structure);
    if (!tree) {
      return { posteriors: new Map(), junctionTree: structure.junctionTree, cliquePotentials: new Map(), probabilityOfEvidence: 1 };
    }
    const probabilityOfEvidence = tree.calibrate(buildLikelihoods(structure.variables, evidence, likelihoodEvidence));
    return readResult(tree, structure.variables, query, probabilityOfEvidence);
  }
}
