/**
 * Value of Information (VOI) for Bayesian networks.
 *
 * For each unobserved variable X, computes how much observing X would
 * reduce uncertainty about the query variable Q:
 *   VOI(X, Q | e) = H(Q | e) - Σ_x P(X=x|e) · H(Q | e, X=x)
 *
 * Variables with higher VOI are more worth observing next.
 */
import type { Evidence, Variable } from './types.js';
import { BayesianNetwork } from './network.js';
import { CachedInferenceEngine } from './cached-inference.js';
import { dConnectedVars } from './d-separation.js';

export interface VOIResult {
  variable: string;
  /** Expected entropy reduction (bits) if this variable were observed. */
  voi: number;
  /** Current entropy of Q given evidence (before observing X). */
  baseEntropy: number;
  /** For each possible outcome of X: the posterior of Q and its entropy. */
  outcomes: Array<{
    outcome: string;
    probability: number; // P(X=x|e)
    queryEntropy: number; // H(Q|e,X=x)
  }>;
}

/**
 * Shannon entropy in bits.
 */
export function entropy(dist: Map<string, number>): number {
  let h = 0;
  for (const p of dist.values()) {
    if (p > 1e-15) h -= p * Math.log2(p);
  }
  return h;
}

/**
 * Compute Value of Information for all unobserved variables.
 *
 * @param network The Bayesian network
 * @param queryVariable The variable we care about
 * @param evidence Current evidence (hard evidence only)
 * @param engine Optional cached inference engine (reused for speed)
 * @returns VOI results sorted by descending VOI
 */
/**
 * Compute VOI for multiple query variables simultaneously.
 * For each candidate X, sums VOI across all query variables:
 * "How much does observing X reduce total uncertainty about Q₁, Q₂, ...?"
 */
export function multiQueryVOI(
  network: BayesianNetwork,
  queryVariables: string[],
  evidence?: Evidence,
  engine?: CachedInferenceEngine,
): VOIResult[] {
  if (queryVariables.length === 0) return [];
  if (queryVariables.length === 1) return valueOfInformation(network, queryVariables[0], evidence, engine);

  const querySet = new Set(queryVariables);
  const perQuery = queryVariables.map(q => valueOfInformation(network, q, evidence, engine));

  // Merge: sum VOI across queries per candidate
  const merged = new Map<string, VOIResult>();
  for (const results of perQuery) {
    for (const r of results) {
      if (querySet.has(r.variable)) continue; // skip if candidate is also a query
      const existing = merged.get(r.variable);
      if (existing) {
        existing.voi += r.voi;
        existing.baseEntropy += r.baseEntropy;
      } else {
        merged.set(r.variable, { ...r, outcomes: [...r.outcomes] });
      }
    }
  }

  const result = [...merged.values()];
  result.sort((a, b) => b.voi - a.voi);
  return result;
}

export function valueOfInformation(
  network: BayesianNetwork,
  queryVariable: string,
  evidence?: Evidence,
  engine?: CachedInferenceEngine,
): VOIResult[] {
  const eng = engine ?? new CachedInferenceEngine(network);
  const ev = evidence ?? new Map();

  // Base inference: P(Q|e)
  const baseResult = eng.infer(ev);
  const qVar = network.getVariable(queryVariable);
  if (!qVar) return [];
  const baseDist = baseResult.posteriors.get(qVar);
  if (!baseDist) return [];
  const baseH = entropy(baseDist);

  // Prune: only d-connected variables can have non-zero VOI
  const evidenceVars = new Set(ev.keys());
  const connected = dConnectedVars(network, queryVariable, [...evidenceVars]);
  const connectedNames = new Set([...connected].map(v => v.name));

  const results: VOIResult[] = [];

  for (const candidate of network.variables) {
    // Skip: query variable itself, already observed, or d-separated
    if (candidate.name === queryVariable) continue;
    if (ev.has(candidate.name)) continue;
    if (!connectedNames.has(candidate.name)) continue;

    let expectedH = 0;
    const outcomes: VOIResult['outcomes'] = [];

    // P(X|e) — marginal of the candidate given current evidence
    const candidateDist = baseResult.posteriors.get(candidate);
    if (!candidateDist) continue;

    for (const outcome of candidate.outcomes) {
      const pX = candidateDist.get(outcome) ?? 0;
      if (pX < 1e-15) {
        outcomes.push({ outcome, probability: pX, queryEntropy: 0 });
        continue;
      }

      // Augment evidence with X=outcome
      const augmented = new Map(ev);
      augmented.set(candidate.name, outcome);

      const augResult = eng.infer(augmented);
      const augDist = augResult.posteriors.get(qVar);
      const hGiven = augDist ? entropy(augDist) : 0;

      expectedH += pX * hGiven;
      outcomes.push({ outcome, probability: pX, queryEntropy: hGiven });
    }

    const voi = Math.max(0, baseH - expectedH); // clamp rounding errors
    results.push({ variable: candidate.name, voi, baseEntropy: baseH, outcomes });
  }

  results.sort((a, b) => b.voi - a.voi);
  return results;
}
