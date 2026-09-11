/**
 * Temporal nodes: "time as a bucketed outcome".
 *
 * An event that may happen at one of several times (or never) is modelled
 * as a single discrete variable whose outcomes are
 *   [ null, o₁@b₁, o₁@b₂, …, o₂@b₁, … ]
 * i.e. the null outcome plus every (outcome × time-bucket) pair
 * (Galán & Díez temporal-nodes Bayesian networks). Buckets are opaque
 * labels ordered in time (e.g. `['Q1-27', 'Q2-27', 'H2-27', '2028']`).
 *
 * Delay constraints between two temporal variables ("the child cannot
 * resolve earlier than `delay` buckets after the parent") are expressed as
 * `-Infinity` log-odds shifts for `gatedLogisticCPT` — see `delayShifts`.
 */
import type { Variable, CPT, Distribution } from './types.js';
import type { LogOddsShift } from './cpt-templates.js';

export const TEMPORAL_SEPARATOR = '@';
export const DEFAULT_NULL_OUTCOME = 'none';

/** Compose the outcome label `outcome@bucket`. */
export function temporalOutcome(outcome: string, bucket: string): string {
  return `${outcome}${TEMPORAL_SEPARATOR}${bucket}`;
}

/** Split `outcome@bucket` (on the last separator); null for the null outcome / plain labels. */
export function parseTemporalOutcome(s: string): { outcome: string; bucket: string } | null {
  const i = s.lastIndexOf(TEMPORAL_SEPARATOR);
  if (i <= 0 || i === s.length - 1) return null;
  return { outcome: s.slice(0, i), bucket: s.slice(i + 1) };
}

/** Index of `bucket` in the ordered bucket list; throws if unknown. */
export function bucketIndex(buckets: readonly string[], bucket: string): number {
  const i = buckets.indexOf(bucket);
  if (i < 0) throw new Error(`Unknown bucket "${bucket}" (buckets: ${buckets.join(', ')})`);
  return i;
}

export interface TemporalVariableOptions {
  readonly name: string;
  /** Non-null outcomes (the null outcome is added automatically; if listed it is skipped). */
  readonly outcomes: readonly string[];
  /** Time buckets in chronological order. */
  readonly buckets: readonly string[];
  /** Label of the "never happens" outcome. Default `'none'`. */
  readonly nullOutcome?: string;
  readonly position?: Variable['position'];
}

/**
 * Build a temporal variable: outcomes `[null, ...outcome@bucket]`, outcome-major.
 */
export function temporalVariable(opts: TemporalVariableOptions): Variable {
  const nullOutcome = opts.nullOutcome ?? DEFAULT_NULL_OUTCOME;
  if (opts.buckets.length === 0) throw new Error('temporalVariable needs at least one bucket');
  const outcomes: string[] = [nullOutcome];
  for (const o of opts.outcomes) {
    if (o === nullOutcome) continue;
    for (const b of opts.buckets) outcomes.push(temporalOutcome(o, b));
  }
  if (outcomes.length === 1) throw new Error('temporalVariable needs at least one non-null outcome');
  const v: Variable = { name: opts.name, outcomes };
  return opts.position ? { ...v, position: opts.position } : v;
}

export interface HazardPriorOptions {
  /** Distribution over non-null outcomes, conditional on the event occurring. Need not be normalised. */
  readonly outcomes: Distribution;
  /** P(event occurs at all) — mass on the null outcome is 1 − pOccur. */
  readonly pOccur: number;
  readonly buckets: readonly string[];
  /**
   * Per-bucket numbers, aligned with `buckets`. With `hazardMode: 'weights'`
   * (default) they are unnormalised occurrence weights; with `'rates'` they
   * are discrete hazard rates h_b = P(occur in b | not before b), turned into
   * occurrence probabilities h_b·Π_{j<b}(1−h_j) (renormalised so occurrence
   * mass sums to `pOccur`).
   */
  readonly hazard: readonly number[];
  readonly hazardMode?: 'weights' | 'rates';
  readonly nullOutcome?: string;
}

/**
 * Prior over a temporal variable: P(null) = 1 − pOccur and
 * P(o@b) = pOccur · P(o | occurs) · P(b | occurs).
 */
export function hazardPrior(opts: HazardPriorOptions): Distribution {
  const { buckets, hazard, pOccur } = opts;
  if (hazard.length !== buckets.length) {
    throw new Error(`hazard has ${hazard.length} entries but there are ${buckets.length} buckets`);
  }
  if (pOccur < 0 || pOccur > 1) throw new Error(`pOccur must be in [0, 1], got ${pOccur}`);
  for (const h of hazard) if (h < 0 || (opts.hazardMode === 'rates' && h > 1)) throw new Error(`Invalid hazard value ${h}`);

  const nullOutcome = opts.nullOutcome ?? DEFAULT_NULL_OUTCOME;

  // Bucket occurrence probabilities, summing to 1.
  const pBucket = new Float64Array(buckets.length);
  if (opts.hazardMode === 'rates') {
    let survive = 1;
    for (let b = 0; b < buckets.length; b++) {
      pBucket[b] = survive * hazard[b];
      survive *= 1 - hazard[b];
    }
  } else {
    pBucket.set(hazard);
  }
  let bSum = 0;
  for (const p of pBucket) bSum += p;
  if (bSum <= 0 && pOccur > 0) throw new Error('hazard has no positive entry');
  for (let b = 0; b < buckets.length; b++) pBucket[b] = bSum > 0 ? pBucket[b] / bSum : 0;

  let oSum = 0;
  for (const [o, p] of opts.outcomes) {
    if (o === nullOutcome) continue;
    if (p < 0) throw new Error(`Negative probability for outcome ${o}`);
    oSum += p;
  }
  if (oSum <= 0 && pOccur > 0) throw new Error('outcomes has no positive entry');

  const dist: Distribution = new Map();
  dist.set(nullOutcome, 1 - pOccur);
  for (const [o, p] of opts.outcomes) {
    if (o === nullOutcome) continue;
    const pO = oSum > 0 ? p / oSum : 0;
    for (let b = 0; b < buckets.length; b++) {
      dist.set(temporalOutcome(o, buckets[b]), pOccur * pO * pBucket[b]);
    }
  }
  return dist;
}

/**
 * Turn a Distribution into a parentless CPT for `variable` (outcomes missing
 * from the distribution get 0; the table is normalised).
 */
export function priorCPT(variable: Variable, dist: Distribution): CPT {
  const table = new Float64Array(variable.outcomes.length);
  let sum = 0;
  for (let i = 0; i < table.length; i++) {
    const p = dist.get(variable.outcomes[i]) ?? 0;
    table[i] = p;
    sum += p;
  }
  if (sum <= 0) throw new Error(`Distribution has no mass on the outcomes of ${variable.name}`);
  for (let i = 0; i < table.length; i++) table[i] /= sum;
  return { variable, parents: [], table };
}

export interface DelayShiftsOptions {
  /** Temporal parent. */
  readonly parent: Variable;
  /** Temporal child (same bucket list as the parent). */
  readonly child: Variable;
  /** Buckets shared by parent and child, chronological. */
  readonly buckets: readonly string[];
  /** Minimum bucket gap: child bucket index ≥ parent bucket index + delay. Default 0. */
  readonly delay?: number;
}

/**
 * Log-odds shifts (for `gatedLogisticCPT`) that forbid the child from
 * resolving earlier than `delay` buckets after the parent resolved:
 * for every parent outcome `o@bp`, all child outcomes `o'@bc` with
 * index(bc) < index(bp) + delay get `-Infinity`. The child's null outcome
 * is never forbidden.
 *
 * Example — child C can only follow parent P, at least one bucket later:
 * ```ts
 * gatedLogisticCPT({
 *   variable: C, parents: [P],
 *   gate: [[{ parent: 'P', outcomes: P.outcomes.filter(o => o !== 'none') }]],
 *   base: hazardPrior({ ... }),
 *   shifts: delayShifts({ parent: P, child: C, buckets, delay: 1 }),
 * })
 * ```
 */
export function delayShifts(opts: DelayShiftsOptions): LogOddsShift[] {
  const { parent, child, buckets } = opts;
  const delay = opts.delay ?? 0;
  const shifts: LogOddsShift[] = [];
  for (const po of parent.outcomes) {
    const parsed = parseTemporalOutcome(po);
    if (!parsed) continue;
    const minChildBucket = bucketIndex(buckets, parsed.bucket) + delay;
    const logOdds = new Map<string, number>();
    for (const co of child.outcomes) {
      const cp = parseTemporalOutcome(co);
      if (!cp) continue;
      if (bucketIndex(buckets, cp.bucket) < minChildBucket) logOdds.set(co, -Infinity);
    }
    if (logOdds.size > 0) shifts.push({ parent: parent.name, outcome: po, logOdds });
  }
  return shifts;
}
