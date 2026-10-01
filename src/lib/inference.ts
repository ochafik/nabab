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
import {
  type DirectedGraph,
  type JunctionTree,
  type Clique,
  type CostEstimate,
  type EliminationHeuristic,
  buildJunctionTree,
  buildDirectedGraph,
  estimateJunctionTreeCost,
} from './graph.js';

/** Default ceiling on the largest clique-table size (entries) for exact inference.
 *
 * Chosen so a single clique factor stays ~256 MiB (32M × 8 bytes/Float64). Message
 * passing holds only a handful of such factors at once, so peak stays comfortably
 * within a couple of GB. The motivating incident (treewidth ~16, cardinality ~3.4)
 * needs ≈8.3e8 entries (~6.6 GiB per array) and is blocked with ~25× margin, while
 * realistic min-fill results up to treewidth ~13 (≈1.9e7 entries) still run. */
export const DEFAULT_MAX_CLIQUE_ENTRIES = 32_000_000;

export interface InferOptions {
  /**
   * Fail fast (throw) instead of allocating if the largest junction-tree clique
   * would exceed this many table entries. Defaults to the env var
   * NABAB_MAX_CLIQUE_ENTRIES, else DEFAULT_MAX_CLIQUE_ENTRIES. Pass Infinity to
   * disable the guard entirely.
   */
  readonly maxCliqueEntries?: number;
  /** Triangulation heuristic (default 'min-fill'). */
  readonly eliminationHeuristic?: EliminationHeuristic;
}

/** Resolve the clique-size budget: explicit option > env var > default. */
function resolveMaxCliqueEntries(opt?: number): number {
  if (opt !== undefined) return opt;
  const env = typeof process !== 'undefined' ? process.env?.NABAB_MAX_CLIQUE_ENTRIES : undefined;
  if (env !== undefined && env !== '') {
    const parsed = Number(env);
    // Non-positive or non-finite means "no limit".
    if (!Number.isFinite(parsed) || parsed <= 0) return Infinity;
    return parsed;
  }
  return DEFAULT_MAX_CLIQUE_ENTRIES;
}

/** Build the directed graph (DAG) implied by a set of CPTs. */
function buildDag(variables: readonly Variable[], cpts: readonly CPT[]): DirectedGraph {
  const edges: Array<[Variable, Variable]> = [];
  for (const cpt of cpts) {
    for (const parent of cpt.parents) {
      edges.push([parent, cpt.variable]);
    }
  }
  return buildDirectedGraph([...variables], edges);
}

/**
 * Estimate the cost of exact (junction-tree) inference on a network *without*
 * running it or allocating any clique tables. Use this to gate expensive
 * inference: check `maxCliqueEntries` / `treewidth` against a budget first.
 */
export function estimateInferenceCost(
  variables: readonly Variable[],
  cpts: readonly CPT[],
  options?: { eliminationHeuristic?: EliminationHeuristic },
): CostEstimate {
  const dag = buildDag(variables, cpts);
  return estimateJunctionTreeCost(dag, { heuristic: options?.eliminationHeuristic });
}

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
 * @param options Optional guard budget (maxCliqueEntries) and triangulation heuristic
 */
export function infer(
  variables: readonly Variable[],
  cpts: readonly CPT[],
  evidence?: Evidence,
  likelihoodEvidence?: LikelihoodEvidence,
  options?: InferOptions,
): InferenceResult {
  // Build DAG from CPTs
  const cptByVar = new Map<Variable, CPT>();
  for (const cpt of cpts) {
    cptByVar.set(cpt.variable, cpt);
  }

  const dag = buildDag(variables, cpts);

  // ── Fail-fast guard (BEFORE building the junction tree) ──
  // Refuse to allocate an intractably large clique table (which would OOM or
  // hang the process). Cost is estimated from the elimination ordering alone —
  // no clique table is allocated, and maximal cliques are NOT enumerated (that
  // enumeration can itself blow up on a high-treewidth graph, so the guard must
  // run first to stay fast on exactly the networks it needs to reject).
  const budget = resolveMaxCliqueEntries(options?.maxCliqueEntries);
  if (Number.isFinite(budget)) {
    const cost = estimateJunctionTreeCost(dag, { heuristic: options?.eliminationHeuristic });
    if (cost.maxCliqueEntries > budget) {
      const vars = cost.largestClique.map(v => v.name).join(', ');
      const mb = Math.round((budget * 8) / 1e6);
      throw new Error(
        `nabab: exact inference aborted — largest junction-tree clique {${vars}} ` +
        `(treewidth ${cost.treewidth}) would need ${cost.maxCliqueEntries.toLocaleString()} ` +
        `table entries, exceeding the budget of ${budget.toLocaleString()} entries ` +
        `(~${mb} MB per Float64 array). Raise options.maxCliqueEntries or the ` +
        `NABAB_MAX_CLIQUE_ENTRIES env var (or set to Infinity to disable this guard), ` +
        `or use an approximate method such as loopyBeliefPropagation().`,
      );
    }
  }

  const junctionTree = buildJunctionTree(dag, { heuristic: options?.eliminationHeuristic });

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
    for (const [, potential] of cliquePotentials) {
      if (potential.variables.includes(v)) {
        posteriors.set(v, extractDistribution(potential, v));
        break;
      }
    }
  }

  return { posteriors, junctionTree, cliquePotentials };
}
