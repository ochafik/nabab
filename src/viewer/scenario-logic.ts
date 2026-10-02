/**
 * Pure helpers for the "Most likely scenario" mode: turn k-best explanations
 * into conditional probabilities, diff them against the best scenario and
 * against each node's own most likely value, and format chips. No DOM, no
 * shared viewer state.
 */
import type { Distribution } from '../lib/types.js';

export interface ScenarioInput {
  readonly assignment: ReadonlyMap<string, string>;
  /** log P(assignment, e), not normalised (see Explanation). */
  readonly logProbability: number;
}

export interface ScenarioProb {
  /** P(assignment | e). */
  p: number;
  /** Share of the listed scenarios' total probability, in [0, 1]. */
  share: number;
}

/**
 * P(x | e) = exp(log P(x, e)) / P(e). Soft evidence enters both numerator
 * (mpe.ts multiplies likelihood weights into the joint) and P(e) (infer()
 * returns the same weighted sum), so the ratio is a proper probability.
 * `share`s are relative to the sum over the given scenarios.
 */
export function scenarioProbabilities(list: readonly ScenarioInput[], probabilityOfEvidence: number): ScenarioProb[] {
  const ps = list.map(s => (probabilityOfEvidence > 0 ? Math.exp(s.logProbability) / probabilityOfEvidence : 0));
  const total = ps.reduce((a, b) => a + b, 0);
  return ps.map(p => ({ p, share: total > 0 ? p / total : 0 }));
}

/** Total probability covered by the listed scenarios (clamped to 1 against rounding). */
export function coveredMass(probs: readonly ScenarioProb[]): number {
  return Math.min(1, probs.reduce((a, b) => a + b.p, 0));
}

export interface Assign { name: string; outcome: string; }

/** Assignments of `names` (in order) where `a` differs from `base`. */
export function diffAssignments(a: ReadonlyMap<string, string>, base: ReadonlyMap<string, string>, names: readonly string[]): Assign[] {
  const out: Assign[] = [];
  for (const name of names) {
    const o = a.get(name);
    if (o !== undefined && o !== base.get(name)) out.push({ name, outcome: o });
  }
  return out;
}

/** Most likely outcome of a distribution (first one on ties); undefined if empty. */
export function argmaxOutcome(d: Distribution | undefined): string | undefined {
  let best: string | undefined;
  let bp = -Infinity;
  if (d) for (const [o, p] of d) if (p > bp) { bp = p; best = o; }
  return best;
}

export interface MarginalDiff extends Assign {
  /** The node's own most likely value. */
  marginal: string;
}

/**
 * Variables (among `names`) whose value in the scenario differs from their
 * own marginal argmax: the scenario's "surprises".
 */
export function diffFromMarginal(
  a: ReadonlyMap<string, string>,
  posteriors: ReadonlyMap<string, Distribution>,
  names: readonly string[],
): MarginalDiff[] {
  const out: MarginalDiff[] = [];
  for (const name of names) {
    const o = a.get(name);
    const m = argmaxOutcome(posteriors.get(name));
    if (o !== undefined && m !== undefined && o !== m) out.push({ name, outcome: o, marginal: m });
  }
  return out;
}

/** Variables shown in a scenario: unobserved and not intervened, in network order. */
export function scenarioVariables(all: readonly string[], observed: ReadonlySet<string>, intervened: ReadonlySet<string>): string[] {
  return all.filter(n => !observed.has(n) && !intervened.has(n));
}

/** "lung = yes" */
export function formatChip(a: Assign): string {
  return `${a.name} = ${a.outcome}`;
}

/** Percentage for a probability: "41%", "4.1%", "0.12%", "<0.01%". */
export function formatPercent(p: number): string {
  if (!(p > 0)) return '0%';
  const pct = p * 100;
  if (pct >= 99.5) return '100%';
  if (pct >= 10) return `${Math.round(pct)}%`;
  if (pct >= 1) return `${pct.toFixed(1)}%`;
  if (pct >= 0.01) return `${pct.toFixed(2)}%`;
  return '<0.01%';
}

/** Short pill text for a node badge. */
export function pillText(outcome: string, max = 12): string {
  const o = outcome.length > max ? outcome.slice(0, max - 1) + '…' : outcome;
  return `scenario: ${o}`;
}

/** One-hot posteriors for a full assignment (what hard evidence on it would give). */
export function oneHotPosteriors(
  assignment: ReadonlyMap<string, string>,
  outcomesOf: (name: string) => readonly string[] | undefined,
  names: readonly string[],
): Map<string, Distribution> {
  const out = new Map<string, Distribution>();
  for (const name of names) {
    const outs = outcomesOf(name);
    const a = assignment.get(name);
    if (!outs || a === undefined) continue;
    out.set(name, new Map(outs.map(o => [o, o === a ? 1 : 0] as [string, number])));
  }
  return out;
}
