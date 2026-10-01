/**
 * Evidence model: hard observations, soft (Jeffrey's rule) evidence,
 * tweak tracking and the interactions that mutate them.
 */
import type { Variable, Evidence, LikelihoodEvidence, Distribution } from '../lib/types.js';
import { S } from './state.js';
import { rerender } from './render-bus.js';

/**
 * Convert user-set target marginals to likelihood evidence via Jeffrey's rule.
 * User sets "I want P(X=ok)=0.19" but the engine needs likelihood weights.
 * Jeffrey's rule: likelihood(x) = target(x) / prior(x).
 * We compute priors once (no evidence), then divide.
 */
export function effectiveEvidence(): [Evidence | undefined, LikelihoodEvidence | undefined] {
  if (!S.network) return [undefined, undefined];
  const he = new Map<string, string>();
  const se = new Map<string, Map<string, number>>();

  for (const [k, v] of S.hardEvidence) if (S.observationEnabled.has(k)) he.set(k, v);

  // For soft evidence, apply Jeffrey's rule: L(x) = target(x) / prior(x)
  if (S.softEvidence.size > 0) {
    // Compute priors once (cached until network changes)
    if (!S.priorCache) {
      const priorResult = S.network.infer();
      S.priorCache = priorResult.posteriors;
    }
    for (const [k, targetWeights] of S.softEvidence) {
      if (!S.observationEnabled.has(k)) continue;
      const variable = S.network.getVariable(k);
      if (!variable) continue;
      const prior = S.priorCache.get(variable);
      if (!prior) { se.set(k, targetWeights); continue; }

      // Jeffrey's rule: likelihood = target / prior
      const likelihood = new Map<string, number>();
      for (const [outcome, targetP] of targetWeights) {
        const priorP = prior.get(outcome) ?? 0;
        likelihood.set(outcome, priorP > 1e-10 ? targetP / priorP : targetP > 0 ? 1e6 : 0);
      }
      se.set(k, likelihood);
    }
  }

  return [he.size ? he : undefined, se.size ? se : undefined];
}

export function toggleEye(v: Variable): void {
  if (S.observationEnabled.has(v.name)) {
    S.observationEnabled.delete(v.name);
    S.tweakedOutcomes.delete(v.name);
    if (S.hardEvidence.has(v.name)) S.rememberedHard.set(v.name, S.hardEvidence.get(v.name)!);
    if (S.softEvidence.has(v.name)) S.rememberedSoft.set(v.name, S.softEvidence.get(v.name)!);
  } else {
    S.observationEnabled.add(v.name);
    if (!S.hardEvidence.has(v.name) && !S.softEvidence.has(v.name)) {
      if (S.rememberedHard.has(v.name)) S.hardEvidence.set(v.name, S.rememberedHard.get(v.name)!);
      else if (S.rememberedSoft.has(v.name)) S.softEvidence.set(v.name, S.rememberedSoft.get(v.name)!);
      else S.hardEvidence.set(v.name, v.outcomes[0]);
    }
  }
  rerender();
}

export function eyeTooltip(v: Variable): string {
  const on = S.observationEnabled.has(v.name);
  if (on && S.hardEvidence.has(v.name)) return `Observing ${v.name} = ${S.hardEvidence.get(v.name)}. Click to disable.`;
  if (on && S.softEvidence.has(v.name)) return `Soft evidence on ${v.name}. Click to disable.`;
  if (on) return 'Observation active. Click to disable.';
  if (S.rememberedHard.has(v.name)) return `Click to restore: ${v.name} = ${S.rememberedHard.get(v.name)}`;
  if (S.rememberedSoft.has(v.name)) return `Click to restore soft evidence`;
  return `Click to observe ${v.name}`;
}

export function cycleObservation(v: Variable): void {
  const cur = S.hardEvidence.get(v.name);
  if (!S.observationEnabled.has(v.name)) {
    S.observationEnabled.add(v.name);
    S.hardEvidence.set(v.name, v.outcomes[0]);
    S.softEvidence.delete(v.name);
    S.tweakedOutcomes.set(v.name, new Set([v.outcomes[0]]));
  } else if (cur) {
    const idx = v.outcomes.indexOf(cur);
    if (idx < v.outcomes.length - 1) {
      S.hardEvidence.set(v.name, v.outcomes[idx + 1]);
      S.tweakedOutcomes.set(v.name, new Set([v.outcomes[idx + 1]]));
    } else {
      S.hardEvidence.delete(v.name); S.softEvidence.delete(v.name);
      S.observationEnabled.delete(v.name); S.tweakedOutcomes.delete(v.name);
    }
  } else {
    S.hardEvidence.set(v.name, v.outcomes[0]); S.softEvidence.delete(v.name);
    S.tweakedOutcomes.set(v.name, new Set([v.outcomes[0]]));
  }
  rerender();
}

export function setSlider(v: Variable, trueRatio: number): void {
  S.hardEvidence.delete(v.name); S.observationEnabled.add(v.name);
  const t = Math.max(0, Math.min(1, trueRatio));
  if (t > 0.995) { S.hardEvidence.set(v.name, v.outcomes[0]); S.softEvidence.delete(v.name); }
  else if (t < 0.005) { S.hardEvidence.set(v.name, v.outcomes[1]); S.softEvidence.delete(v.name); }
  else S.softEvidence.set(v.name, new Map([[v.outcomes[0], t], [v.outcomes[1], 1 - t]]));
  rerender();
}

export function cycleOutcome(v: Variable, i: number): void {
  const o = v.outcomes[i];
  if (!S.observationEnabled.has(v.name)) {
    // Not observed → set this outcome to 100%, only it is tweaked
    S.hardEvidence.set(v.name, o); S.softEvidence.delete(v.name); S.observationEnabled.add(v.name);
    S.tweakedOutcomes.set(v.name, new Set([o]));
    rerender(); return;
  }
  // If this outcome is tweaked → un-tweak it
  const tweaked = S.tweakedOutcomes.get(v.name);
  if (tweaked?.has(o)) {
    clearOutcomeTweak(v, i);
    return;
  }
  // Not tweaked → set to 100%, mark only this one tweaked
  S.hardEvidence.set(v.name, o); S.softEvidence.delete(v.name);
  S.tweakedOutcomes.set(v.name, new Set([o]));
  rerender();
}

/** Get current weights for a multi-class variable (evidence or posterior). */
export function getWeights(v: Variable, posteriors?: Map<Variable, Distribution>): Map<string, number> {
  if (S.hardEvidence.has(v.name)) {
    const h = S.hardEvidence.get(v.name)!;
    return new Map(v.outcomes.map(o => [o, o === h ? 1 : 0]));
  }
  if (S.softEvidence.has(v.name)) return new Map(S.softEvidence.get(v.name)!);
  // Fall back to posteriors or uniform
  if (posteriors) {
    const dist = posteriors.get(v);
    if (dist) return new Map(dist);
  }
  return new Map(v.outcomes.map(o => [o, 1 / v.outcomes.length]));
}

/** Set a single outcome's weight, rescale floating (non-tweaked) outcomes. */
export function setMultiWeight(v: Variable, outcomeIdx: number, value: number): void {
  const o = v.outcomes[outcomeIdx];
  S.hardEvidence.delete(v.name);
  S.observationEnabled.add(v.name);

  // Init weights from current state if needed
  const w = S.softEvidence.has(v.name) ? new Map(S.softEvidence.get(v.name)!) : getWeights(v);
  if (!S.tweakedOutcomes.has(v.name)) S.tweakedOutcomes.set(v.name, new Set());
  const tweaked = S.tweakedOutcomes.get(v.name)!;
  tweaked.add(o);

  // Set this outcome
  w.set(o, value);

  // Remaining budget for floating outcomes
  let tweakedSum = 0;
  for (const t of tweaked) tweakedSum += w.get(t) ?? 0;
  const remaining = Math.max(0, 1 - tweakedSum);

  // Distribute remaining among floating (non-tweaked) outcomes
  const floating = v.outcomes.filter(x => !tweaked.has(x));
  if (floating.length > 0) {
    const floatSum = floating.reduce((s, x) => s + (w.get(x) ?? 0), 0);
    for (const f of floating) {
      w.set(f, floatSum > 0 ? (w.get(f) ?? 0) / floatSum * remaining : remaining / floating.length);
    }
  } else if (tweakedSum !== 1) {
    // All tweaked but don't sum to 1 — scale all proportionally
    for (const t of tweaked) w.set(t, (w.get(t) ?? 0) / tweakedSum);
  }

  // Snap to hard evidence if one is ~100%
  for (const x of v.outcomes) {
    if ((w.get(x) ?? 0) > 0.995) {
      S.hardEvidence.set(v.name, x); S.softEvidence.delete(v.name);
      S.tweakedOutcomes.set(v.name, new Set(v.outcomes));
      rerender(); return;
    }
  }

  S.softEvidence.set(v.name, w);
  rerender();
}

/** Clear a single outcome's tweak (make it floating). */
export function clearOutcomeTweak(v: Variable, outcomeIdx: number): void {
  const tweaked = S.tweakedOutcomes.get(v.name);
  if (!tweaked) return;
  tweaked.delete(v.outcomes[outcomeIdx]);

  if (tweaked.size === 0) {
    // No tweaks left → clear observation entirely
    S.hardEvidence.delete(v.name); S.softEvidence.delete(v.name);
    S.observationEnabled.delete(v.name); S.tweakedOutcomes.delete(v.name);
  } else {
    // Redistribute: un-tweaked outcome becomes floating
    const w = S.softEvidence.has(v.name) ? new Map(S.softEvidence.get(v.name)!) : getWeights(v);
    let tweakedSum = 0;
    for (const t of tweaked) tweakedSum += w.get(t) ?? 0;
    const remaining = Math.max(0, 1 - tweakedSum);
    const floating = v.outcomes.filter(x => !tweaked.has(x));
    const floatSum = floating.reduce((s, x) => s + (w.get(x) ?? 0), 0);
    for (const f of floating) {
      w.set(f, floatSum > 0 ? (w.get(f) ?? 0) / floatSum * remaining : remaining / floating.length);
    }
    S.softEvidence.set(v.name, w);
  }
  rerender();
}
