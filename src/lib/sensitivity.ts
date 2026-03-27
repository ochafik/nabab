/**
 * Sensitivity analysis for Bayesian networks.
 *
 * Answers: "How much does the posterior of a query variable change
 * when a single CPT parameter is perturbed?"
 *
 * Uses finite differences: perturb each parameter by ±epsilon,
 * renormalize the row, rerun inference, measure the change.
 */
import type { Variable, CPT, Evidence, Distribution } from './types.js';
import { BayesianNetwork } from './network.js';

export interface SensitivityResult {
  /** The variable whose CPT parameter was varied. */
  variable: string;
  /** Description of the parent configuration, e.g. "parent1=val1, parent2=val2". */
  parentConfig: string;
  /** The outcome whose probability was varied. */
  outcome: string;
  /** Approximate derivative: d(query posterior) / d(parameter). */
  derivative: number;
  /** Current (original) value of the parameter. */
  currentValue: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────

/** Build a human-readable label for a parent configuration index. */
function parentConfigLabel(parents: readonly Variable[], configIndex: number): string {
  if (parents.length === 0) return '(none)';
  const parts: string[] = [];
  let remaining = configIndex;
  // Parents vary outermost → first parent has largest stride
  for (let i = parents.length - 1; i >= 0; i--) {
    const nOutcomes = parents[i].outcomes.length;
    const outcomeIdx = remaining % nOutcomes;
    remaining = Math.floor(remaining / nOutcomes);
    parts.unshift(`${parents[i].name}=${parents[i].outcomes[outcomeIdx]}`);
  }
  return parts.join(', ');
}

/**
 * Clone a network with one CPT parameter changed, renormalizing the row.
 *
 * @param network  Original network
 * @param cptIndex Index of the CPT in network.cpts
 * @param rowStart Offset into the CPT table where this row begins
 * @param rowLen   Number of outcomes (length of one row)
 * @param col      Which outcome within the row to perturb
 * @param newValue The new probability value for that cell
 */
function cloneWithPerturbedParam(
  network: BayesianNetwork,
  cptIndex: number,
  rowStart: number,
  rowLen: number,
  col: number,
  newValue: number,
): BayesianNetwork {
  const origCpt = network.cpts[cptIndex];
  const newTable = new Float64Array(origCpt.table);

  // Clamp to valid probability range
  const clamped = Math.max(0, Math.min(1, newValue));
  const oldValue = newTable[rowStart + col];

  // Set the perturbed parameter
  newTable[rowStart + col] = clamped;

  // Renormalize the other entries in this row so the row sums to 1.
  // Distribute the leftover (1 - clamped) proportionally among the others.
  const sumOthers = 1 - oldValue; // original sum of the other entries
  const targetOthers = 1 - clamped;

  for (let j = 0; j < rowLen; j++) {
    if (j === col) continue;
    if (sumOthers > 1e-15) {
      newTable[rowStart + j] = (origCpt.table[rowStart + j] / sumOthers) * targetOthers;
    } else {
      // All other entries were 0; spread uniformly
      newTable[rowStart + j] = targetOthers / (rowLen - 1);
    }
  }

  const newCpts: CPT[] = network.cpts.map((c, i) =>
    i === cptIndex ? { variable: c.variable, parents: c.parents, table: newTable } : c,
  );
  return new BayesianNetwork({
    name: network.name,
    variables: [...network.variables],
    cpts: newCpts,
  });
}

/** Extract the posterior probability of queryVariable=queryOutcome from a network. */
function queryPosterior(
  network: BayesianNetwork,
  queryVariable: string,
  queryOutcome: string,
  evidence?: Evidence,
): number {
  const dist = network.query(queryVariable, evidence);
  return dist.get(queryOutcome) ?? 0;
}

// ─── Public API ───────────────────────────────────────────────────────

/**
 * One-way sensitivity analysis: compute how the posterior of
 * queryVariable=queryOutcome changes as each CPT parameter is varied.
 *
 * Uses forward finite differences: perturb each parameter by +epsilon,
 * renormalize, rerun inference, measure the change.
 */
export function sensitivityAnalysis(
  network: BayesianNetwork,
  queryVariable: string,
  queryOutcome: string,
  evidence?: Evidence,
  epsilon = 0.01,
): SensitivityResult[] {
  const basePosterior = queryPosterior(network, queryVariable, queryOutcome, evidence);
  const results: SensitivityResult[] = [];

  for (let ci = 0; ci < network.cpts.length; ci++) {
    const cpt = network.cpts[ci];
    const varObj = cpt.variable;
    const nOutcomes = varObj.outcomes.length;
    const nRows = cpt.table.length / nOutcomes;

    for (let row = 0; row < nRows; row++) {
      const rowStart = row * nOutcomes;
      const pConfig = parentConfigLabel(cpt.parents, row);

      for (let col = 0; col < nOutcomes; col++) {
        const currentValue = cpt.table[rowStart + col];

        // Choose perturbation direction that stays within [0,1]
        let eps = epsilon;
        if (currentValue + eps > 1) eps = -epsilon;

        const perturbed = cloneWithPerturbedParam(
          network, ci, rowStart, nOutcomes, col, currentValue + eps,
        );
        const perturbedPosterior = queryPosterior(perturbed, queryVariable, queryOutcome, evidence);
        const derivative = (perturbedPosterior - basePosterior) / eps;

        results.push({
          variable: varObj.name,
          parentConfig: pConfig,
          outcome: varObj.outcomes[col],
          derivative,
          currentValue,
        });
      }
    }
  }

  return results;
}

/**
 * Find the N most influential parameters for a given query,
 * ranked by |derivative|.
 */
export function mostInfluentialParameters(
  network: BayesianNetwork,
  queryVariable: string,
  queryOutcome: string,
  topN = 10,
  evidence?: Evidence,
): SensitivityResult[] {
  const all = sensitivityAnalysis(network, queryVariable, queryOutcome, evidence);
  all.sort((a, b) => Math.abs(b.derivative) - Math.abs(a.derivative));
  return all.slice(0, topN);
}

/**
 * Tornado analysis: for each CPT parameter, sweep it from 0 to 1 in
 * `steps` evenly-spaced values and record the query posterior at each.
 *
 * Returns entries sorted by descending range (most sensitive first).
 */
export function tornadoAnalysis(
  network: BayesianNetwork,
  queryVariable: string,
  queryOutcome: string,
  evidence?: Evidence,
  steps = 5,
): Array<{
  variable: string;
  parentConfig: string;
  outcome: string;
  queryValues: number[];
  range: number;
}> {
  const stepValues = Array.from({ length: steps }, (_, i) => i / (steps - 1));
  const results: Array<{
    variable: string;
    parentConfig: string;
    outcome: string;
    queryValues: number[];
    range: number;
  }> = [];

  for (let ci = 0; ci < network.cpts.length; ci++) {
    const cpt = network.cpts[ci];
    const varObj = cpt.variable;
    const nOutcomes = varObj.outcomes.length;
    const nRows = cpt.table.length / nOutcomes;

    for (let row = 0; row < nRows; row++) {
      const rowStart = row * nOutcomes;
      const pConfig = parentConfigLabel(cpt.parents, row);

      for (let col = 0; col < nOutcomes; col++) {
        const queryValues: number[] = [];
        for (const sv of stepValues) {
          const modified = cloneWithPerturbedParam(
            network, ci, rowStart, nOutcomes, col, sv,
          );
          queryValues.push(queryPosterior(modified, queryVariable, queryOutcome, evidence));
        }
        const range = Math.max(...queryValues) - Math.min(...queryValues);
        results.push({
          variable: varObj.name,
          parentConfig: pConfig,
          outcome: varObj.outcomes[col],
          queryValues,
          range,
        });
      }
    }
  }

  results.sort((a, b) => b.range - a.range);
  return results;
}
