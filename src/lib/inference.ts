/**
 * Junction tree inference algorithm.
 *
 * Ported from the Java implementation in JunctionTreeAlgorithmUtils.java.
 * Performs exact inference on Bayesian networks using the junction tree
 * algorithm with two-phase message passing (collect + distribute evidence).
 */
import { validateEvidence } from './evidence.js';
import type { Factor } from './factor.js';
import type { Variable, CPT, Evidence, LikelihoodEvidence, Distribution } from './types.js';
import { CalibratedTree, buildLikelihoods } from './calibrated-tree.js';
import { relevantNetwork, resolveQueryVariables } from './pruning.js';
import {
  type DirectedGraph,
  type JunctionTree,
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
  /**
   * Compute posteriors only for these variables (or variable names). The
   * network is first pruned to the part that can influence them given the
   * evidence: barren nodes (unobserved nodes with no queried or observed
   * descendants) and nodes d-separated from the query by the evidence are
   * dropped before the junction tree is built, which can shrink it a lot.
   *
   * Posteriors of the query variables are identical to those of a full run.
   * Differences from a full run, all consequences of dropping nodes:
   * - `posteriors` holds only the query variables;
   * - `junctionTree` and `cliquePotentials` describe the pruned network;
   * - evidence that is d-separated from the query is ignored, so
   *   `probabilityOfEvidence` is the probability of the *relevant* evidence only,
   *   and contradictions confined to irrelevant evidence are not reported as
   *   `ImpossibleEvidenceError`. Omit the option when either matters.
   */
  readonly queryVariables?: readonly (Variable | string)[];
}

/** Resolve the clique-size budget: explicit option > env var > default. */
export function resolveMaxCliqueEntries(opt?: number): number {
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

/** Throw the standard "exact inference aborted" error if a clique table would exceed the budget. */
export function assertWithinCliqueBudget(cost: CostEstimate, budget: number): void {
  if (cost.maxCliqueEntries <= budget) return;
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

/** Build the directed graph (DAG) implied by a set of CPTs. */
export function buildDag(variables: readonly Variable[], cpts: readonly CPT[]): DirectedGraph {
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

// ─── Public API ──────────────────────────────────────────────────────

export interface InferenceResult {
  /** Posterior distributions for each variable. */
  posteriors: Map<Variable, Distribution>;
  /** The junction tree used. */
  junctionTree: JunctionTree;
  /** Clique potentials after propagation (normalized to sum to 1). */
  cliquePotentials: Map<number, Factor>;
  /**
   * P(evidence): the probability of the observations under the network. For
   * hard evidence this is the joint probability of the observed outcomes; with
   * likelihood evidence it is the expected likelihood weight (so it is not
   * bounded by 1 only if weights exceed 1). It is 1 when there is no evidence.
   * `infer` never returns a result with `probabilityOfEvidence` of 0 — see
   * `ImpossibleEvidenceError`.
   */
  probabilityOfEvidence: number;
}

/**
 * Run exact inference on a Bayesian network.
 *
 * @param variables All variables in the network
 * @param cpts Conditional probability tables
 * @param evidence Optional hard evidence (variable -> outcome string)
 * @param likelihoodEvidence Optional soft evidence (variable -> outcome -> weight)
 * @param options Optional guard budget (maxCliqueEntries) and triangulation heuristic
 * @throws Error if the evidence names an unknown variable or outcome, or has
 *   invalid likelihood weights (see `validateEvidence`).
 * @throws ImpossibleEvidenceError if the evidence has probability zero (e.g.
 *   contradictory observations); no posterior exists in that case.
 */
export function infer(
  variables: readonly Variable[],
  cpts: readonly CPT[],
  evidence?: Evidence,
  likelihoodEvidence?: LikelihoodEvidence,
  options?: InferOptions,
): InferenceResult {
  validateEvidence(variables, evidence, likelihoodEvidence);

  // Optionally prune to the part of the network the query depends on.
  const query = resolveQueryVariables(variables, options?.queryVariables);
  if (query) {
    const pruned = relevantNetwork(variables, cpts, query, ...evidenceSets(variables, evidence, likelihoodEvidence));
    variables = pruned.variables;
    cpts = pruned.cpts;
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
    assertWithinCliqueBudget(estimateJunctionTreeCost(dag, { heuristic: options?.eliminationHeuristic }), budget);
  }

  const junctionTree = buildJunctionTree(dag, { heuristic: options?.eliminationHeuristic });

  if (junctionTree.cliques.length === 0) {
    return { posteriors: new Map(), junctionTree, cliquePotentials: new Map(), probabilityOfEvidence: 1 };
  }

  // One-shot: no need to keep the CPT products around for re-initialisation.
  const tree = new CalibratedTree(variables, cpts, junctionTree);
  const probabilityOfEvidence = tree.calibrate(buildLikelihoods(variables, evidence, likelihoodEvidence));
  return readResult(tree, variables, query, probabilityOfEvidence);
}

/** The variables with hard evidence, and those with only likelihood evidence. */
export function evidenceSets(
  variables: readonly Variable[],
  evidence?: Evidence,
  likelihoodEvidence?: LikelihoodEvidence,
): [Set<Variable>, Set<Variable>] {
  const hard = new Set<Variable>();
  const soft = new Set<Variable>();
  for (const v of variables) {
    if (evidence?.has(v.name)) hard.add(v);
    else if (likelihoodEvidence?.has(v.name)) soft.add(v);
  }
  return [hard, soft];
}

/** Collect the posteriors of a calibrated tree into an `InferenceResult`. */
export function readResult(
  tree: CalibratedTree,
  variables: readonly Variable[],
  query: ReadonlySet<Variable> | undefined,
  probabilityOfEvidence: number,
): InferenceResult {
  const posteriors = new Map<Variable, Distribution>();
  for (const v of variables) {
    if (query && !query.has(v)) continue;
    const dist = tree.marginal(v);
    if (dist) posteriors.set(v, dist);
  }
  const result = { posteriors, junctionTree: tree.junctionTree, probabilityOfEvidence } as InferenceResult;
  tree.defineCliquePotentials(result);
  return result;
}
