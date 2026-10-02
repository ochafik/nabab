/**
 * Pure evidence model (no DOM, no shared state): how a user gesture on one
 * variable turns into hard / soft evidence, and how the viewer's evidence maps
 * become engine inputs via Jeffrey's rule.
 *
 * Both the committing code paths (evidence.ts) and the what-if hover preview
 * use these functions, so a preview shows exactly what a click would commit.
 */
import type { Variable, Evidence, LikelihoodEvidence, Distribution } from '../lib/types.js';

/** The observation state of a single variable. */
export interface VarObs {
  enabled: boolean;
  hard?: string;
  /** Target marginals (before Jeffrey's rule). */
  soft?: Map<string, number>;
  /** Outcomes the user explicitly set (rendered bold; pinned when others float). */
  tweaked: Set<string>;
}

/** Probability targets the hover preview snaps to. */
export const SNAPS: readonly number[] = [0, 0.25, 0.5, 0.75, 1];

/** Index of the snap target nearest to a horizontal fraction in [0, 1]. */
export function snapIndex(fraction: number): number {
  const f = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0));
  let best = 0;
  for (let i = 1; i < SNAPS.length; i++) if (Math.abs(SNAPS[i] - f) < Math.abs(SNAPS[best] - f)) best = i;
  return best;
}

export function isSliderVar(v: Variable): boolean {
  return v.outcomes.length === 2;
}

/** Two-outcome variables use a single slider: the thumb position is P(outcomes[0]). */
export function sliderObs(v: Variable, trueRatio: number, cur?: VarObs): VarObs {
  const t = Math.max(0, Math.min(1, trueRatio));
  const tweaked = cur?.tweaked ?? new Set<string>();
  if (t > 0.995) return { enabled: true, hard: v.outcomes[0], tweaked: new Set(tweaked) };
  if (t < 0.005) return { enabled: true, hard: v.outcomes[1], tweaked: new Set(tweaked) };
  return { enabled: true, soft: new Map([[v.outcomes[0], t], [v.outcomes[1], 1 - t]]), tweaked: new Set(tweaked) };
}

/** Observe `outcome` with certainty, only that outcome marked as tweaked. */
export function hardObs(v: Variable, outcome: string): VarObs {
  if (!v.outcomes.includes(outcome)) throw new Error(`Unknown outcome ${outcome} for ${v.name}`);
  return { enabled: true, hard: outcome, tweaked: new Set([outcome]) };
}

/**
 * Set one outcome's probability and rescale the floating (non-tweaked)
 * outcomes to share the remainder. Mirrors the slider-drag semantics.
 */
export function multiWeightObs(v: Variable, outcomeIdx: number, value: number, cur: VarObs): VarObs {
  const o = v.outcomes[outcomeIdx];
  // Weights start from the current soft evidence, or uniform (hard evidence is replaced).
  const w = cur.soft ? new Map(cur.soft) : new Map(v.outcomes.map(x => [x, 1 / v.outcomes.length] as [string, number]));
  const tweaked = new Set(cur.tweaked);
  tweaked.add(o);
  w.set(o, value);

  let tweakedSum = 0;
  for (const t of tweaked) tweakedSum += w.get(t) ?? 0;
  const remaining = Math.max(0, 1 - tweakedSum);
  const floating = v.outcomes.filter(x => !tweaked.has(x));
  if (floating.length > 0) {
    const floatSum = floating.reduce((s, x) => s + (w.get(x) ?? 0), 0);
    for (const f of floating) {
      w.set(f, floatSum > 0 ? (w.get(f) ?? 0) / floatSum * remaining : remaining / floating.length);
    }
  } else if (tweakedSum !== 1 && tweakedSum > 0) {
    for (const t of tweaked) w.set(t, (w.get(t) ?? 0) / tweakedSum);
  }

  for (const x of v.outcomes) {
    if ((w.get(x) ?? 0) > 0.995) return { enabled: true, hard: x, tweaked: new Set(v.outcomes) };
  }
  return { enabled: true, soft: w, tweaked };
}

/**
 * What a click (or a preview) of "outcome `idx` at probability `target`"
 * produces for a variable: one slider for binary variables, otherwise the
 * multi-outcome rule. target 1 = hard evidence, 0 = rule the outcome out.
 */
export function targetObs(v: Variable, idx: number, target: number, cur: VarObs): VarObs {
  if (isSliderVar(v)) return sliderObs(v, idx === 0 ? target : 1 - target, cur);
  if (target >= 1) return { enabled: true, hard: v.outcomes[idx], tweaked: new Set(v.outcomes) };
  return multiWeightObs(v, idx, target, cur);
}

/** Per-outcome weights an observation state displays (hard = one-hot). */
export function obsWeights(v: Variable, obs: VarObs): Map<string, number> {
  if (obs.hard !== undefined) return new Map(v.outcomes.map(o => [o, o === obs.hard ? 1 : 0] as [string, number]));
  if (obs.soft) return new Map(obs.soft);
  return new Map(v.outcomes.map(o => [o, 1 / v.outcomes.length] as [string, number]));
}

export interface EvidenceInputs {
  hard: ReadonlyMap<string, string>;
  soft: ReadonlyMap<string, Map<string, number>>;
  enabled: ReadonlySet<string>;
  /** do(X=x): these variables ignore observations and are pinned instead. */
  interventions?: ReadonlyMap<string, string>;
  getVariable: (name: string) => Variable | undefined;
  /** Prior marginals (computed lazily, only when soft evidence is present). */
  getPriors: () => Map<Variable, Distribution>;
  /** Replace the observation of one variable (used by the hover preview). */
  override?: { name: string; obs: VarObs };
}

/**
 * Convert viewer evidence into engine inputs. Soft evidence uses Jeffrey's
 * rule: likelihood(x) = target(x) / prior(x). Interventions are returned as
 * hard evidence (for use with the mutilated network). Stale or invalid
 * entries are dropped.
 */
export function buildEffectiveEvidence(inp: EvidenceInputs): [Evidence | undefined, LikelihoodEvidence | undefined] {
  const he: Evidence = new Map();
  const se: LikelihoodEvidence = new Map();
  const skip = (name: string) => inp.interventions?.has(name) || inp.override?.name === name;

  for (const [k, v] of inp.hard) {
    if (!inp.enabled.has(k) || skip(k)) continue;
    if (inp.getVariable(k)?.outcomes.includes(v)) he.set(k, v);
  }

  const softTargets = new Map<string, Map<string, number>>();
  for (const [k, targetWeights] of inp.soft) {
    if (!inp.enabled.has(k) || skip(k)) continue;
    softTargets.set(k, targetWeights);
  }
  const ov = inp.override;
  if (ov) {
    const variable = inp.getVariable(ov.name);
    if (variable && ov.obs.enabled) {
      if (ov.obs.hard !== undefined) he.set(ov.name, ov.obs.hard);
      else if (ov.obs.soft) softTargets.set(ov.name, ov.obs.soft);
    }
  }

  if (softTargets.size > 0) {
    const priors = inp.getPriors();
    for (const [k, targetWeights] of softTargets) {
      const variable = inp.getVariable(k);
      if (!variable) continue;
      if (![...targetWeights.keys()].every(o => variable.outcomes.includes(o))) continue;
      if (![...targetWeights.values()].every(w => Number.isFinite(w) && w >= 0)) continue;
      const prior = priors.get(variable);
      if (!prior) { se.set(k, targetWeights); continue; }
      const likelihood = new Map<string, number>();
      for (const [outcome, targetP] of targetWeights) {
        const priorP = prior.get(outcome) ?? 0;
        likelihood.set(outcome, priorP > 1e-10 ? targetP / priorP : targetP > 0 ? 1e6 : 0);
      }
      // An all-zero vector (every outcome excluded) is not valid evidence.
      if (variable.outcomes.some(o => (likelihood.get(o) ?? 1) > 0)) se.set(k, likelihood);
    }
  }

  if (inp.interventions) {
    for (const [k, x] of inp.interventions) if (inp.getVariable(k)?.outcomes.includes(x)) he.set(k, x);
  }
  return [he.size ? he : undefined, se.size ? se : undefined];
}
