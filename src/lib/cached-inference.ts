/**
 * Cached inference engine for Bayesian networks.
 *
 * Caches the junction tree construction (moralize, triangulate, find cliques,
 * MST) and the initial clique potentials so that subsequent inference calls
 * with different evidence skip the expensive structural work.
 *
 * When no evidence is provided, clique potentials are deep-cloned from the
 * cache. When evidence is present, only the affected cliques are rebuilt.
 */
import type { Variable, CPT, Evidence, LikelihoodEvidence } from './types.js';
import type { InferenceResult } from './inference.js';
import {
  type Factor,
  cptToFactor,
  multiplyFactors,
  marginalize,
  invertFactor,
  normalizeFactor,
  constantFactor,
  applyEvidence,
  applyLikelihood,
  extractDistribution,
  createFactor,
} from './factor.js';
import { type JunctionTree, type Clique, buildJunctionTree, buildDirectedGraph } from './graph.js';
import { BayesianNetwork } from './network.js';

// ─── Helpers (mirrored from inference.ts to avoid modifying it) ──────

function sepKey(i: number, j: number): string {
  return i < j ? `${i},${j}` : `${j},${i}`;
}

function passMessage(
  iSource: number,
  iDest: number,
  cliques: readonly Clique[],
  cliquePotentials: Map<number, Factor>,
  separatorPotentials: Map<string, Factor>,
): void {
  const key = sepKey(iSource, iDest);
  const oldSepPotential = separatorPotentials.get(key);

  const destNodes = new Set(cliques[iDest]);
  const varsToMarginalize = cliques[iSource].filter(v => !destNodes.has(v));

  const sourcePotential = cliquePotentials.get(iSource)!;
  const newSepPotential = marginalize(sourcePotential, varsToMarginalize);

  separatorPotentials.set(key, newSepPotential);

  const oldDestPotential = cliquePotentials.get(iDest)!;

  const ratio = oldSepPotential
    ? multiplyFactors(newSepPotential, invertFactor(oldSepPotential))
    : newSepPotential;

  const newDestPotential = multiplyFactors(oldDestPotential, ratio);
  cliquePotentials.set(iDest, newDestPotential);
}

function collectEvidence(
  iSource: number,
  iCaller: number,
  marked: boolean[],
  cliques: readonly Clique[],
  neighbors: Map<number, Set<number>>,
  cliquePotentials: Map<number, Factor>,
  separatorPotentials: Map<string, Factor>,
): void {
  marked[iSource] = true;
  for (const iNeighbor of neighbors.get(iSource)!) {
    if (!marked[iNeighbor]) {
      collectEvidence(iNeighbor, iSource, marked, cliques, neighbors, cliquePotentials, separatorPotentials);
    }
  }
  if (iCaller >= 0) {
    passMessage(iSource, iCaller, cliques, cliquePotentials, separatorPotentials);
  }
}

function distributeEvidence(
  iSource: number,
  marked: boolean[],
  cliques: readonly Clique[],
  neighbors: Map<number, Set<number>>,
  cliquePotentials: Map<number, Factor>,
  separatorPotentials: Map<string, Factor>,
): void {
  marked[iSource] = true;
  for (const iNeighbor of neighbors.get(iSource)!) {
    if (!marked[iNeighbor]) {
      passMessage(iSource, iNeighbor, cliques, cliquePotentials, separatorPotentials);
    }
  }
  for (const iNeighbor of neighbors.get(iSource)!) {
    if (!marked[iNeighbor]) {
      distributeEvidence(iNeighbor, marked, cliques, neighbors, cliquePotentials, separatorPotentials);
    }
  }
}

// ─── Deep clone for factors ──────────────────────────────────────────

/** Deep-clone a factor (new Float64Array copy of values). */
function cloneFactor(f: Factor): Factor {
  return createFactor(f.variables, new Float64Array(f.values));
}

// ─── Cached inference engine ─────────────────────────────────────────

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

  // Cached structure (depends only on network topology)
  private _fingerprint: string | null = null;
  private _junctionTree: JunctionTree | null = null;
  private _cptByVar: Map<Variable, CPT> | null = null;

  /**
   * Cached initial clique potentials built from raw CPT factors (no
   * evidence applied). Used as the starting point for evidence-free
   * queries. Deep-cloned before use so the cache is never mutated.
   */
  private _baseCliquePotentials: Map<number, Factor> | null = null;

  /**
   * Records which variables were assigned to which clique, and in what
   * order. Needed to rebuild a clique's potential when evidence changes.
   * Map: cliqueIndex -> list of variables assigned to that clique.
   */
  private _cliqueAssignedVars: Map<number, Variable[]> | null = null;

  constructor(network: BayesianNetwork) {
    this._network = network;
  }

  // ── Cache management ──

  private _ensureCache(): void {
    const fp = networkFingerprint(this._network);
    if (this._fingerprint === fp && this._junctionTree !== null) {
      return; // cache is still valid
    }

    const variables = this._network.variables;
    const cpts = this._network.cpts;

    // Build DAG
    const edges: Array<[Variable, Variable]> = [];
    const cptByVar = new Map<Variable, CPT>();
    for (const cpt of cpts) {
      cptByVar.set(cpt.variable, cpt);
      for (const parent of cpt.parents) {
        edges.push([parent, cpt.variable]);
      }
    }
    const dag = buildDirectedGraph([...variables], edges);
    const junctionTree = buildJunctionTree(dag);

    // Build evidence-free clique potentials and track assignment
    const baseCliquePotentials = new Map<number, Factor>();
    const cliqueAssignedVars = new Map<number, Variable[]>();
    const assigned = new Set<Variable>();

    if (junctionTree.cliques.length > 0) {
      const rawFactors = new Map<Variable, Factor>();
      for (const v of variables) {
        const cpt = cptByVar.get(v);
        if (!cpt) continue;
        rawFactors.set(v, cptToFactor(cpt.variable, cpt.parents, cpt.table));
      }

      for (let iClique = 0; iClique < junctionTree.cliques.length; iClique++) {
        const clique = junctionTree.cliques[iClique];
        const cliqueSet = new Set(clique);
        let product: Factor | null = null;
        const assignedHere: Variable[] = [];

        for (const v of clique) {
          if (assigned.has(v)) continue;
          const f = rawFactors.get(v);
          if (!f) continue;
          if (f.variables.every(fv => cliqueSet.has(fv))) {
            assigned.add(v);
            assignedHere.push(v);
            product = product ? multiplyFactors(product, f) : f;
          }
        }

        baseCliquePotentials.set(iClique, product ?? constantFactor(1));
        cliqueAssignedVars.set(iClique, assignedHere);
      }

      for (const v of variables) {
        if (!assigned.has(v) && cptByVar.has(v)) {
          throw new Error(`Failed to assign variable ${v.name} to a clique`);
        }
      }
    }

    this._fingerprint = fp;
    this._junctionTree = junctionTree;
    this._cptByVar = cptByVar;
    this._baseCliquePotentials = baseCliquePotentials;
    this._cliqueAssignedVars = cliqueAssignedVars;
  }

  // ── Inference ──

  infer(evidence?: Evidence, likelihoodEvidence?: LikelihoodEvidence): InferenceResult {
    this._ensureCache();

    const junctionTree = this._junctionTree!;
    const variables = this._network.variables;

    if (junctionTree.cliques.length === 0) {
      return { posteriors: new Map(), junctionTree, cliquePotentials: new Map() };
    }

    // Build clique potentials for this query
    const cliquePotentials = this._buildCliquePotentials(evidence, likelihoodEvidence);

    // ── Global propagation ──
    const separatorPotentials = new Map<string, Factor>();
    const startClique = junctionTree.cliques.length - 1;

    const marked1 = new Array(junctionTree.cliques.length).fill(false);
    collectEvidence(
      startClique, -1, marked1,
      junctionTree.cliques, junctionTree.neighbors,
      cliquePotentials, separatorPotentials,
    );

    const marked2 = new Array(junctionTree.cliques.length).fill(false);
    distributeEvidence(
      startClique, marked2,
      junctionTree.cliques, junctionTree.neighbors,
      cliquePotentials, separatorPotentials,
    );

    // Normalize
    for (const [i, potential] of cliquePotentials) {
      cliquePotentials.set(i, normalizeFactor(potential, 1));
    }

    // Extract posteriors
    const posteriors = new Map<Variable, Map<string, number>>();
    for (const v of variables) {
      for (const [, potential] of cliquePotentials) {
        if (potential.variables.includes(v)) {
          posteriors.set(v, extractDistribution(potential, v));
          break;
        }
      }
    }

    return { posteriors, junctionTree, cliquePotentials };
  }

  /**
   * Build clique potentials for a query. If no evidence is provided,
   * deep-clone the cached base potentials. If evidence is present,
   * only rebuild cliques whose assigned variables have evidence;
   * clone the rest from the cache.
   */
  private _buildCliquePotentials(
    evidence?: Evidence,
    likelihoodEvidence?: LikelihoodEvidence,
  ): Map<number, Factor> {
    const junctionTree = this._junctionTree!;
    const cptByVar = this._cptByVar!;
    const basePotentials = this._baseCliquePotentials!;
    const cliqueAssignedVars = this._cliqueAssignedVars!;
    const hasAnyEvidence = (evidence && evidence.size > 0) || (likelihoodEvidence && likelihoodEvidence.size > 0);

    const cliquePotentials = new Map<number, Factor>();

    for (let iClique = 0; iClique < junctionTree.cliques.length; iClique++) {
      if (!hasAnyEvidence) {
        // No evidence at all: deep-clone the cached potential
        cliquePotentials.set(iClique, cloneFactor(basePotentials.get(iClique)!));
        continue;
      }

      // Check if any assigned variable in this clique has evidence
      const assignedVars = cliqueAssignedVars.get(iClique) ?? [];
      const cliqueHasEvidence = assignedVars.some(
        v => evidence?.has(v.name) || likelihoodEvidence?.has(v.name),
      );

      if (!cliqueHasEvidence) {
        // This clique is unaffected by evidence: deep-clone
        cliquePotentials.set(iClique, cloneFactor(basePotentials.get(iClique)!));
        continue;
      }

      // Rebuild this clique's potential with evidence applied to affected factors
      let product: Factor | null = null;
      for (const v of assignedVars) {
        const cpt = cptByVar.get(v);
        if (!cpt) continue;

        let factor = cptToFactor(cpt.variable, cpt.parents, cpt.table);

        if (evidence?.has(v.name)) {
          const observedOutcome = evidence.get(v.name)!;
          const outcomeIdx = v.outcomes.indexOf(observedOutcome);
          if (outcomeIdx >= 0) {
            factor = applyEvidence(factor, v, outcomeIdx);
          }
        }

        if (likelihoodEvidence?.has(v.name)) {
          const weights = likelihoodEvidence.get(v.name)!;
          const weightArray = new Float64Array(v.outcomes.length);
          for (let i = 0; i < v.outcomes.length; i++) {
            weightArray[i] = weights.get(v.outcomes[i]) ?? 1;
          }
          factor = applyLikelihood(factor, v, weightArray);
        }

        product = product ? multiplyFactors(product, factor) : factor;
      }

      cliquePotentials.set(iClique, product ?? constantFactor(1));
    }

    return cliquePotentials;
  }
}
