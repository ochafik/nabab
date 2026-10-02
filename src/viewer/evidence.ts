/**
 * Evidence model: hard observations, soft (Jeffrey's rule) evidence,
 * tweak tracking and the interactions that mutate them.
 */
import type { Variable, Evidence, LikelihoodEvidence, Distribution } from '../lib/types.js';
import { S, getActive, setIntervention } from './state.js';
import { rerender } from './render-bus.js';
import {
  buildEffectiveEvidence, targetObs, sliderObs, multiWeightObs, hardObs, type VarObs,
} from './evidence-model.js';

/** Current observation state of a variable, as a pure value. */
export function getObs(name: string): VarObs {
  return {
    enabled: S.observationEnabled.has(name),
    hard: S.hardEvidence.get(name),
    soft: S.softEvidence.get(name),
    tweaked: new Set(S.tweakedOutcomes.get(name) ?? []),
  };
}

/** Write an observation state back to the shared viewer state (no re-render). */
function writeObs(name: string, obs: VarObs): void {
  if (obs.enabled) S.observationEnabled.add(name); else S.observationEnabled.delete(name);
  if (obs.hard !== undefined) S.hardEvidence.set(name, obs.hard); else S.hardEvidence.delete(name);
  if (obs.soft) S.softEvidence.set(name, obs.soft); else S.softEvidence.delete(name);
  S.tweakedOutcomes.set(name, obs.tweaked);
}

/** Observing a variable replaces any do() intervention on it. */
function dropIntervention(name: string): void {
  if (S.interventions.has(name)) setIntervention(name, null);
}

/**
 * Convert user-set target marginals to likelihood evidence via Jeffrey's rule
 * (likelihood(x) = target(x) / prior(x), priors computed once per active
 * network). Interventions come back as hard evidence for the mutilated
 * network. `override` substitutes one variable's observation (hover preview).
 */
export function effectiveEvidence(override?: { name: string; obs: VarObs }): [Evidence | undefined, LikelihoodEvidence | undefined] {
  const net = S.network;
  const active = getActive();
  if (!net || !active) return [undefined, undefined];
  return buildEffectiveEvidence({
    hard: S.hardEvidence,
    soft: S.softEvidence,
    enabled: S.observationEnabled,
    interventions: S.interventions,
    getVariable: n => net.getVariable(n),
    getPriors: (): Map<Variable, Distribution> => {
      if (!S.priorCache) S.priorCache = active.engine.infer().posteriors;
      return S.priorCache;
    },
    override,
  });
}

export function toggleEye(v: Variable): void {
  dropIntervention(v.name);
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
  dropIntervention(v.name);
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
  dropIntervention(v.name);
  writeObs(v.name, sliderObs(v, trueRatio, getObs(v.name)));
  rerender();
}

/** Commit "outcome `idx` at probability `target`" exactly as the hover preview showed it. */
export function commitTarget(v: Variable, idx: number, target: number): void {
  dropIntervention(v.name);
  writeObs(v.name, targetObs(v, idx, target, getObs(v.name)));
  rerender();
}

/** Observe `outcome` with certainty. */
export function observeHard(v: Variable, outcome: string): void {
  dropIntervention(v.name);
  writeObs(v.name, hardObs(v, outcome));
  rerender();
}

/** Observe several variables with certainty in one go (single re-render). */
export function observeAllHard(entries: Iterable<[Variable, string]>): void {
  for (const [v, outcome] of entries) {
    dropIntervention(v.name);
    writeObs(v.name, hardObs(v, outcome));
  }
  rerender();
}

/** do(v = outcome); doing the same again clears it. Observations of v are removed. */
export function toggleIntervention(v: Variable, outcome: string): void {
  if (S.interventions.get(v.name) === outcome) {
    setIntervention(v.name, null);
  } else {
    setIntervention(v.name, outcome);
    S.hardEvidence.delete(v.name); S.softEvidence.delete(v.name);
    S.observationEnabled.delete(v.name); S.tweakedOutcomes.delete(v.name);
  }
  rerender();
}

export function cycleOutcome(v: Variable, i: number): void {
  dropIntervention(v.name);
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
  dropIntervention(v.name);
  writeObs(v.name, multiWeightObs(v, outcomeIdx, value, getObs(v.name)));
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
