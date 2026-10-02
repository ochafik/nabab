/**
 * Evidence validation shared by every inference entry point.
 */
import type { Variable, Evidence, LikelihoodEvidence } from './types.js';

/**
 * Thrown when the supplied evidence has probability zero under the network
 * (e.g. two contradictory hard observations), so no posterior is defined.
 */
export class ImpossibleEvidenceError extends Error {
  constructor(message = 'nabab: the evidence has probability zero under this network (contradictory or impossible observations); posteriors are undefined.') {
    super(message);
    this.name = 'ImpossibleEvidenceError';
  }
}

/**
 * Validate hard and likelihood evidence against a set of variables.
 *
 * Throws a descriptive Error when:
 * - a variable name in `evidence` / `likelihood` is not in `variables`;
 * - a hard-evidence outcome is not one of the variable's outcomes;
 * - a likelihood map has an unknown outcome key, a negative / NaN / infinite
 *   weight, or weights that are all zero (outcomes left unspecified default
 *   to weight 1, so an all-zero check considers only the effective vector).
 *
 * Does nothing when both arguments are undefined or empty.
 */
export function validateEvidence(
  variables: readonly Variable[],
  evidence?: Evidence,
  likelihood?: LikelihoodEvidence,
): void {
  if (!(evidence?.size) && !(likelihood?.size)) return;
  const byName = new Map<string, Variable>();
  for (const v of variables) byName.set(v.name, v);

  const lookup = (name: string, kind: string): Variable => {
    const v = byName.get(name);
    if (!v) {
      throw new Error(
        `nabab: unknown variable "${name}" in ${kind} evidence. Known variables: ${[...byName.keys()].join(', ')}`,
      );
    }
    return v;
  };

  if (evidence) {
    for (const [name, outcome] of evidence) {
      const v = lookup(name, 'hard');
      if (!v.outcomes.includes(outcome)) {
        throw new Error(
          `nabab: unknown outcome "${outcome}" for variable "${name}" in hard evidence. Valid outcomes: ${v.outcomes.join(', ')}`,
        );
      }
    }
  }

  if (likelihood) {
    for (const [name, weights] of likelihood) {
      const v = lookup(name, 'likelihood');
      for (const [outcome, w] of weights) {
        if (!v.outcomes.includes(outcome)) {
          throw new Error(
            `nabab: unknown outcome "${outcome}" for variable "${name}" in likelihood evidence. Valid outcomes: ${v.outcomes.join(', ')}`,
          );
        }
        if (typeof w !== 'number' || !Number.isFinite(w) || w < 0) {
          throw new Error(
            `nabab: invalid likelihood weight ${w} for "${name}=${outcome}": weights must be finite and non-negative`,
          );
        }
      }
      if (!v.outcomes.some(o => (weights.get(o) ?? 1) > 0)) {
        throw new Error(`nabab: likelihood evidence for variable "${name}" has all-zero weights`);
      }
    }
  }
}
