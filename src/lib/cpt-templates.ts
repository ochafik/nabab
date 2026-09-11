/**
 * Templated CPT construction.
 *
 * Fully elicited CPTs grow as the product of parent cardinalities; these
 * templates build them from O(#parents) parameters instead.
 *
 * `gatedLogisticCPT`:
 *   P(o | parents) = 1[¬G]·δ_null(o) + 1[G]·softmax_o(log base(o) + Σ_s shift_s(o))
 * where G is a hard gate (CNF over parent outcomes: an AND of OR-groups) and
 * each shift is a per-outcome log-odds vector that applies when a given
 * parent takes a given outcome.
 *
 * `noisyOrCPT`: the classic noisy-OR for a binary child:
 *   P(child active | active parents A) = 1 − (1 − leak)·Π_{i∈A} (1 − w_i)
 *
 * Tables follow nabab's layout: row-major, first parent outermost, the child
 * variable innermost.
 */
import type { Variable, CPT, Distribution } from './types.js';

/** One OR-group of a CNF gate: satisfied iff `parent` takes one of `outcomes`. */
export interface GateClause {
  readonly parent: string;
  readonly outcomes: readonly string[];
}

/** A log-odds shift applied to the child's outcomes when `parent` = `outcome`. */
export interface LogOddsShift {
  readonly parent: string;
  readonly outcome: string;
  /**
   * Added to log(base) per child outcome. Either an array aligned with
   * `variable.outcomes` or a sparse map (missing outcomes shift by 0).
   * `-Infinity` forbids an outcome.
   */
  readonly logOdds: readonly number[] | ReadonlyMap<string, number>;
}

export interface GatedLogisticCPTOptions {
  readonly variable: Variable;
  readonly parents: readonly Variable[];
  /** Outcome forced when the gate is unsatisfied. Default: the first outcome. */
  readonly nullOutcome?: string;
  /**
   * CNF gate: AND of OR-groups. Satisfied iff every group contains some
   * clause whose parent takes one of its listed outcomes. Empty/undefined ⇒
   * always satisfied.
   */
  readonly gate?: ReadonlyArray<ReadonlyArray<GateClause>>;
  /** Prior over the child's outcomes given the gate is satisfied (array aligned with outcomes, or Distribution). Need not be normalised. */
  readonly base: readonly number[] | Distribution;
  readonly shifts?: readonly LogOddsShift[];
}

function baseToLog(variable: Variable, base: readonly number[] | Distribution): Float64Array {
  const card = variable.outcomes.length;
  const log = new Float64Array(card);
  if (!Array.isArray(base)) {
    const map = base as Distribution;
    for (let i = 0; i < card; i++) {
      const p = map.get(variable.outcomes[i]) ?? 0;
      if (p < 0) throw new Error(`Negative base probability for ${variable.name}=${variable.outcomes[i]}`);
      log[i] = Math.log(p);
    }
  } else {
    const arr = base as readonly number[];
    if (arr.length !== card) {
      throw new Error(`base has ${arr.length} entries but ${variable.name} has ${card} outcomes`);
    }
    for (let i = 0; i < card; i++) {
      if (arr[i] < 0) throw new Error(`Negative base probability for ${variable.name}=${variable.outcomes[i]}`);
      log[i] = Math.log(arr[i]);
    }
  }
  if (log.every(x => x === -Infinity)) throw new Error(`base for ${variable.name} has no positive entry`);
  return log;
}

/** Enumerate parent assignments in nabab row order, calling `fn(indices, rowOffset)`. */
function forEachParentRow(
  parents: readonly Variable[],
  card: number,
  fn: (indices: Int32Array, rowOffset: number) => void,
): void {
  const n = parents.length;
  const indices = new Int32Array(n);
  let rows = 1;
  for (const p of parents) rows *= p.outcomes.length;
  for (let r = 0; r < rows; r++) {
    fn(indices, r * card);
    for (let j = n - 1; j >= 0; j--) {
      indices[j]++;
      if (indices[j] < parents[j].outcomes.length) break;
      indices[j] = 0;
    }
  }
}

/** Softmax in place over `logits`; if every logit is -Infinity, put all mass on `fallback`. */
function softmaxInto(out: Float64Array, offset: number, logits: Float64Array, fallback: number): void {
  let max = -Infinity;
  for (let i = 0; i < logits.length; i++) if (logits[i] > max) max = logits[i];
  if (max === -Infinity) {
    for (let i = 0; i < logits.length; i++) out[offset + i] = i === fallback ? 1 : 0;
    return;
  }
  let sum = 0;
  for (let i = 0; i < logits.length; i++) {
    const e = Math.exp(logits[i] - max);
    out[offset + i] = e;
    sum += e;
  }
  for (let i = 0; i < logits.length; i++) out[offset + i] /= sum;
}

/**
 * Build a gated-logistic CPT. See module docs for the formula.
 *
 * If a row's logits are all -Infinity (every outcome forbidden by shifts),
 * the row falls back to the null outcome with probability 1.
 */
export function gatedLogisticCPT(opts: GatedLogisticCPTOptions): CPT {
  const { variable, parents } = opts;
  const card = variable.outcomes.length;
  const nullOutcome = opts.nullOutcome ?? variable.outcomes[0];
  const nullIdx = variable.outcomes.indexOf(nullOutcome);
  if (nullIdx < 0) throw new Error(`nullOutcome "${nullOutcome}" is not an outcome of ${variable.name}`);

  const parentIdx = (name: string): number => {
    const i = parents.findIndex(p => p.name === name);
    if (i < 0) throw new Error(`"${name}" is not a parent of ${variable.name}`);
    return i;
  };
  const outcomeIdx = (p: Variable, outcome: string): number => {
    const i = p.outcomes.indexOf(outcome);
    if (i < 0) throw new Error(`"${outcome}" is not an outcome of ${p.name}`);
    return i;
  };

  // Compile gate: groups of (parentIndex, allowed outcome index set).
  const gate = (opts.gate ?? []).map(group => {
    if (group.length === 0) throw new Error('Gate OR-group must not be empty');
    return group.map(clause => {
      const pi = parentIdx(clause.parent);
      return { pi, allowed: new Set(clause.outcomes.map(o => outcomeIdx(parents[pi], o))) };
    });
  });

  // Compile shifts: (parentIndex, outcomeIndex, logOdds vector).
  const shifts = (opts.shifts ?? []).map(s => {
    const pi = parentIdx(s.parent);
    const oi = outcomeIdx(parents[pi], s.outcome);
    const vec = new Float64Array(card);
    if (Array.isArray(s.logOdds)) {
      const arr = s.logOdds as readonly number[];
      if (arr.length !== card) {
        throw new Error(`logOdds for ${s.parent}=${s.outcome} has ${arr.length} entries, expected ${card}`);
      }
      vec.set(arr);
    } else {
      for (const [o, w] of s.logOdds as ReadonlyMap<string, number>) {
        const ci = variable.outcomes.indexOf(o);
        if (ci < 0) throw new Error(`"${o}" is not an outcome of ${variable.name}`);
        vec[ci] = w;
      }
    }
    return { pi, oi, vec };
  });

  const logBase = baseToLog(variable, opts.base);
  const table = new Float64Array(card * parents.reduce((n, p) => n * p.outcomes.length, 1));
  const logits = new Float64Array(card);

  forEachParentRow(parents, card, (indices, offset) => {
    const satisfied = gate.every(group => group.some(c => c.allowed.has(indices[c.pi])));
    if (!satisfied) {
      table[offset + nullIdx] = 1;
      return;
    }
    logits.set(logBase);
    for (const s of shifts) {
      if (indices[s.pi] !== s.oi) continue;
      for (let i = 0; i < card; i++) logits[i] += s.vec[i];
    }
    softmaxInto(table, offset, logits, nullIdx);
  });

  return { variable, parents, table };
}

export interface NoisyOrCPTOptions {
  /** Binary child variable. */
  readonly variable: Variable;
  readonly parents: readonly Variable[];
  /** P(child active | no parent active). */
  readonly leak: number;
  /** Per parent: P(child active | only that parent active), aligned with `parents`. */
  readonly weights: readonly number[];
  /** Child's inactive outcome. Default: the first outcome (the other one is "active"). */
  readonly nullOutcome?: string;
  /** Per parent, the outcome that counts as "active". Default: each parent's second outcome. */
  readonly parentActiveOutcomes?: readonly string[];
}

/**
 * Classic noisy-OR CPT for a binary child.
 */
export function noisyOrCPT(opts: NoisyOrCPTOptions): CPT {
  const { variable, parents, leak, weights } = opts;
  if (variable.outcomes.length !== 2) throw new Error(`noisyOrCPT requires a binary child; ${variable.name} has ${variable.outcomes.length} outcomes`);
  if (weights.length !== parents.length) throw new Error(`weights has ${weights.length} entries but there are ${parents.length} parents`);
  if (leak < 0 || leak > 1) throw new Error(`leak must be in [0, 1], got ${leak}`);
  for (const w of weights) if (w < 0 || w > 1) throw new Error(`weights must be in [0, 1], got ${w}`);

  const nullOutcome = opts.nullOutcome ?? variable.outcomes[0];
  const nullIdx = variable.outcomes.indexOf(nullOutcome);
  if (nullIdx < 0) throw new Error(`nullOutcome "${nullOutcome}" is not an outcome of ${variable.name}`);
  const activeIdx = 1 - nullIdx;

  const activeParentIdx = parents.map((p, i) => {
    const name = opts.parentActiveOutcomes?.[i];
    if (name === undefined) {
      if (p.outcomes.length !== 2) {
        throw new Error(`Parent ${p.name} is not binary; specify parentActiveOutcomes`);
      }
      return 1;
    }
    const idx = p.outcomes.indexOf(name);
    if (idx < 0) throw new Error(`"${name}" is not an outcome of ${p.name}`);
    return idx;
  });

  const rows = parents.reduce((n, p) => n * p.outcomes.length, 1);
  const table = new Float64Array(2 * rows);
  forEachParentRow(parents, 2, (indices, offset) => {
    let pInactive = 1 - leak;
    for (let i = 0; i < parents.length; i++) {
      if (indices[i] === activeParentIdx[i]) pInactive *= 1 - weights[i];
    }
    table[offset + activeIdx] = 1 - pInactive;
    table[offset + nullIdx] = pInactive;
  });
  return { variable, parents, table };
}
