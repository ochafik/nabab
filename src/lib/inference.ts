/**
 * Junction tree inference algorithm.
 *
 * Ported from the Java implementation in JunctionTreeAlgorithmUtils.java.
 * Performs exact inference on Bayesian networks using the junction tree
 * algorithm with two-phase message passing (collect + distribute evidence).
 */
import type { Variable, CPT, Evidence, LikelihoodEvidence, Distribution } from './types.js';
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
} from './factor.js';
import { type DirectedGraph, type JunctionTree, type Clique, buildJunctionTree, buildDirectedGraph } from './graph.js';

// ─── Separator potentials (keyed by ordered clique pair) ─────────────

function sepKey(i: number, j: number): string {
  return i < j ? `${i},${j}` : `${j},${i}`;
}

// ─── Message passing ─────────────────────────────────────────────────

function passMessage(
  iSource: number,
  iDest: number,
  cliques: readonly Clique[],
  cliquePotentials: Map<number, Factor>,
  separatorPotentials: Map<string, Factor>,
): void {
  const key = sepKey(iSource, iDest);
  const oldSepPotential = separatorPotentials.get(key);

  const sourceNodes = new Set(cliques[iSource]);
  const destNodes = new Set(cliques[iDest]);

  // Variables in source but not in destination → marginalize out
  const varsToMarginalize = cliques[iSource].filter(v => !destNodes.has(v));

  const sourcePotential = cliquePotentials.get(iSource)!;
  const newSepPotential = marginalize(sourcePotential, varsToMarginalize);

  separatorPotentials.set(key, newSepPotential);

  const oldDestPotential = cliquePotentials.get(iDest)!;

  // Compute ratio: newSep / oldSep (or just newSep if no old)
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
  // First pass all messages
  for (const iNeighbor of neighbors.get(iSource)!) {
    if (!marked[iNeighbor]) {
      passMessage(iSource, iNeighbor, cliques, cliquePotentials, separatorPotentials);
    }
  }
  // Then recurse
  for (const iNeighbor of neighbors.get(iSource)!) {
    if (!marked[iNeighbor]) {
      distributeEvidence(iNeighbor, marked, cliques, neighbors, cliquePotentials, separatorPotentials);
    }
  }
}

// ─── Public API ──────────────────────────────────────────────────────

export interface InferenceResult {
  /** Posterior distributions for each variable. */
  posteriors: Map<Variable, Distribution>;
  /** The junction tree used. */
  junctionTree: JunctionTree;
  /** Clique potentials after propagation. */
  cliquePotentials: Map<number, Factor>;
}

/**
 * Run exact inference on a Bayesian network.
 *
 * @param variables All variables in the network
 * @param cpts Conditional probability tables
 * @param evidence Optional hard evidence (variable -> outcome string)
 * @param likelihoodEvidence Optional soft evidence (variable -> outcome -> weight)
 */
export function infer(
  variables: readonly Variable[],
  cpts: readonly CPT[],
  evidence?: Evidence,
  likelihoodEvidence?: LikelihoodEvidence,
): InferenceResult {
  // Build DAG from CPTs
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

  if (junctionTree.cliques.length === 0) {
    return { posteriors: new Map(), junctionTree, cliquePotentials: new Map() };
  }

  // Build fusioned definitions: CPT * likelihood (evidence)
  const fusionedFactors = new Map<Variable, Factor>();
  for (const v of variables) {
    const cpt = cptByVar.get(v);
    if (!cpt) continue;
    let factor = cptToFactor(cpt.variable, cpt.parents, cpt.table);

    // Apply hard evidence if present
    if (evidence?.has(v.name)) {
      const observedOutcome = evidence.get(v.name)!;
      const outcomeIdx = v.outcomes.indexOf(observedOutcome);
      if (outcomeIdx >= 0) {
        factor = applyEvidence(factor, v, outcomeIdx);
      }
    }

    // Apply soft/likelihood evidence if present
    if (likelihoodEvidence?.has(v.name)) {
      const weights = likelihoodEvidence.get(v.name)!;
      const weightArray = new Float64Array(v.outcomes.length);
      for (let i = 0; i < v.outcomes.length; i++) {
        weightArray[i] = weights.get(v.outcomes[i]) ?? 1;
      }
      factor = applyLikelihood(factor, v, weightArray);
    }

    fusionedFactors.set(v, factor);
  }

  // ── Initialize clique potentials ──
  const cliquePotentials = new Map<number, Factor>();
  const assigned = new Set<Variable>();

  for (let iClique = 0; iClique < junctionTree.cliques.length; iClique++) {
    const clique = junctionTree.cliques[iClique];
    const cliqueSet = new Set(clique);
    let product: Factor | null = null;

    for (const v of clique) {
      if (assigned.has(v)) continue;
      const f = fusionedFactors.get(v);
      if (!f) continue;

      // Check that all of this factor's variables are in this clique
      if (f.variables.every(fv => cliqueSet.has(fv))) {
        assigned.add(v);
        product = product ? multiplyFactors(product, f) : f;
      }
    }

    cliquePotentials.set(iClique, product ?? constantFactor(1));
  }

  // Check all variables assigned
  for (const v of variables) {
    if (!assigned.has(v) && cptByVar.has(v)) {
      throw new Error(`Failed to assign variable ${v.name} to a clique`);
    }
  }

  // ── Global propagation ──
  const separatorPotentials = new Map<string, Factor>();
  const startClique = junctionTree.cliques.length - 1;

  // Collect evidence (bottom-up)
  const marked1 = new Array(junctionTree.cliques.length).fill(false);
  collectEvidence(
    startClique, -1, marked1,
    junctionTree.cliques, junctionTree.neighbors,
    cliquePotentials, separatorPotentials,
  );

  // Distribute evidence (top-down)
  const marked2 = new Array(junctionTree.cliques.length).fill(false);
  distributeEvidence(
    startClique, marked2,
    junctionTree.cliques, junctionTree.neighbors,
    cliquePotentials, separatorPotentials,
  );

  // Normalize each clique potential
  for (const [i, potential] of cliquePotentials) {
    cliquePotentials.set(i, normalizeFactor(potential, 1));
  }

  // ── Extract posterior distributions ──
  const posteriors = new Map<Variable, Distribution>();
  for (const v of variables) {
    // Find a clique containing this variable and extract its marginal
    for (const [i, potential] of cliquePotentials) {
      if (potential.variables.includes(v)) {
        posteriors.set(v, extractDistribution(potential, v));
        break;
      }
    }
  }

  return { posteriors, junctionTree, cliquePotentials };
}
