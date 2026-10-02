/**
 * Most Probable Explanation (MPE) and k-best explanations.
 *
 * MPE = argmax over *all* variables of P(x | e), computed by max-product
 * variable elimination in log space (sums instead of products, max instead
 * of sum-marginalisation) with argmax traceback. The elimination order is
 * the same min-fill heuristic used by sum-product VE.
 *
 * k-best (Lawler 1972 / Nilsson 1998 style): after extracting the best
 * assignment x*, the remaining assignment space is partitioned into disjoint
 * sub-spaces — for each variable v_i (in a fixed order): "v_1..v_{i-1} equal
 * x*, v_i ≠ x*_i" — each solved with a constrained MPE. Constraints are plain
 * likelihood evidence with zero weights (fixed value ⇒ all other outcomes 0;
 * exclusion ⇒ that outcome 0), so the same solver handles every sub-problem.
 * Sub-problem solutions sit in a priority queue; popping the best yields the
 * next explanation, which is split again.
 */
import { validateEvidence, ImpossibleEvidenceError } from './evidence.js';
import type { Variable, CPT, Evidence, LikelihoodEvidence } from './types.js';
import { type Factor, createFactor, tableSize } from './factor.js';
import { minFillOrder } from './variable-elimination.js';

export interface Explanation {
  /** Full assignment: variable name → outcome (includes evidence variables). */
  readonly assignment: Map<string, string>;
  /**
   * log P(assignment, e) — the natural log of the joint probability of the
   * full assignment times the likelihood-evidence weights (NOT normalised by
   * P(e)). Divide by P(e) — obtainable from `infer` — for the conditional
   * probability; rankings are unaffected. -Infinity if inconsistent with the
   * evidence.
   */
  readonly logProbability: number;
}

// ─── Log-space factor operations ─────────────────────────────────────

/** Elementwise sum of two log-factors over the union of their variables. */
function addLogFactors(f1: Factor, f2: Factor): Factor {
  if (f1.variables.length === 0) {
    const values = new Float64Array(f2.values.length);
    for (let i = 0; i < values.length; i++) values[i] = f2.values[i] + f1.values[0];
    return createFactor(f2.variables, values);
  }
  if (f2.variables.length === 0) {
    const values = new Float64Array(f1.values.length);
    for (let i = 0; i < values.length; i++) values[i] = f1.values[i] + f2.values[0];
    return createFactor(f1.variables, values);
  }

  const variables: Variable[] = [...f1.variables];
  for (const v of f2.variables) if (!variables.includes(v)) variables.push(v);
  const nVars = variables.length;
  const result = createFactor(variables, new Float64Array(tableSize(variables)));

  const s1 = new Int32Array(nVars);
  const s2 = new Int32Array(nVars);
  const cards = new Int32Array(nVars);
  for (let i = 0; i < nVars; i++) {
    const v = variables[i];
    const i1 = f1.variables.indexOf(v);
    const i2 = f2.variables.indexOf(v);
    s1[i] = i1 >= 0 ? f1.strides[i1] : 0;
    s2[i] = i2 >= 0 ? f2.strides[i2] : 0;
    cards[i] = v.outcomes.length;
  }

  const indices = new Int32Array(nVars);
  const values = result.values;
  let i1 = 0, i2 = 0;
  for (let i = 0; i < values.length; i++) {
    values[i] = f1.values[i1] + f2.values[i2];
    for (let j = nVars - 1; j >= 0; j--) {
      indices[j]++;
      i1 += s1[j];
      i2 += s2[j];
      if (indices[j] < cards[j]) break;
      i1 -= cards[j] * s1[j];
      i2 -= cards[j] * s2[j];
      indices[j] = 0;
    }
  }
  return result;
}

interface MaxOutResult {
  readonly factor: Factor;
  /** For each assignment of `factor.variables`, the maximising outcome index of the removed variable. */
  readonly argmax: Int32Array;
}

/** Max-marginalise `v` out of a log-factor, recording the argmax. */
function maxOut(f: Factor, v: Variable): MaxOutResult {
  const vIdx = f.variables.indexOf(v);
  const remaining = f.variables.filter(x => x !== v);
  const size = tableSize(remaining);
  const values = new Float64Array(size).fill(-Infinity);
  const argmax = new Int32Array(size);
  const result = createFactor(remaining, values);

  const nSrc = f.variables.length;
  const cards = new Int32Array(nSrc);
  const resultStride = new Int32Array(nSrc);
  for (let i = 0; i < nSrc; i++) {
    cards[i] = f.variables[i].outcomes.length;
    const r = remaining.indexOf(f.variables[i]);
    resultStride[i] = r >= 0 ? result.strides[r] : 0;
  }

  const indices = new Int32Array(nSrc);
  let rIdx = 0;
  const src = f.values;
  for (let i = 0; i < src.length; i++) {
    const val = src[i];
    if (val > values[rIdx]) {
      values[rIdx] = val;
      argmax[rIdx] = indices[vIdx];
    }
    for (let j = nSrc - 1; j >= 0; j--) {
      indices[j]++;
      rIdx += resultStride[j];
      if (indices[j] < cards[j]) break;
      rIdx -= cards[j] * resultStride[j];
      indices[j] = 0;
    }
  }
  return { factor: result, argmax };
}

/** Add per-outcome log-weights of `v` into a log-factor (no-op if `v` absent). */
function addLogWeights(f: Factor, v: Variable, logW: Float64Array): Factor {
  const vIdx = f.variables.indexOf(v);
  if (vIdx < 0) return f;
  const values = new Float64Array(f.values.length);
  const stride = f.strides[vIdx];
  const card = v.outcomes.length;
  const block = stride * card;
  for (let start = 0; start < values.length; start += block) {
    for (let o = 0; o < card; o++) {
      const w = logW[o];
      const from = start + o * stride;
      for (let i = from; i < from + stride; i++) values[i] = f.values[i] + w;
    }
  }
  return createFactor(f.variables, values);
}

/** Convert CPTs (plus evidence) into log-factors. */
function buildLogFactors(
  cpts: readonly CPT[],
  evidence?: Evidence,
  likelihoodEvidence?: LikelihoodEvidence,
): Factor[] {
  return cpts.map(cpt => {
    const scope = [...cpt.parents, cpt.variable];
    const values = new Float64Array(cpt.table.length);
    for (let i = 0; i < values.length; i++) values[i] = Math.log(cpt.table[i]);
    let f = createFactor(scope, values);
    for (const v of scope) {
      const observed = evidence?.get(v.name);
      if (observed !== undefined) {
        const idx = v.outcomes.indexOf(observed);
        if (idx < 0) throw new Error(`Unknown outcome "${observed}" for variable ${v.name}`);
        const logW = new Float64Array(v.outcomes.length).fill(-Infinity);
        logW[idx] = 0;
        f = addLogWeights(f, v, logW);
      }
      // Likelihoods are multiplicative: apply only on the variable's own CPT.
      const lw = v === cpt.variable ? likelihoodEvidence?.get(v.name) : undefined;
      if (lw) {
        const logW = new Float64Array(v.outcomes.length);
        for (let i = 0; i < logW.length; i++) logW[i] = Math.log(lw.get(v.outcomes[i]) ?? 1);
        f = addLogWeights(f, v, logW);
      }
    }
    return f;
  });
}

interface MaxProductResult {
  /** Outcome index per variable (aligned with the `variables` argument). */
  readonly indices: Int32Array;
  readonly logProbability: number;
}

/** Max-product VE over log-factors with traceback. */
function runMaxProduct(
  variables: readonly Variable[],
  logFactors: readonly Factor[],
  order: readonly Variable[],
): MaxProductResult {
  const pool: Factor[] = [...logFactors];
  const trace: Array<{ variable: Variable; step: MaxOutResult | null }> = [];

  for (const v of order) {
    const relevant: Factor[] = [];
    const rest: Factor[] = [];
    for (const f of pool) (f.variables.includes(v) ? relevant : rest).push(f);
    if (relevant.length === 0) {
      trace.push({ variable: v, step: null });
      continue;
    }
    let product = relevant[0];
    for (let i = 1; i < relevant.length; i++) product = addLogFactors(product, relevant[i]);
    const step = maxOut(product, v);
    pool.length = 0;
    pool.push(...rest, step.factor);
    trace.push({ variable: v, step });
  }

  let logProbability = 0;
  for (const f of pool) {
    // All remaining factors are constants (every variable was eliminated).
    for (let i = 0; i < f.values.length; i++) logProbability += f.values[i];
  }

  // Traceback in reverse elimination order.
  const assigned = new Map<Variable, number>();
  for (let t = trace.length - 1; t >= 0; t--) {
    const { variable, step } = trace[t];
    if (!step) {
      assigned.set(variable, 0);
      continue;
    }
    let idx = 0;
    const vars = step.factor.variables;
    for (let i = 0; i < vars.length; i++) idx += assigned.get(vars[i])! * step.factor.strides[i];
    assigned.set(variable, step.argmax[idx]);
  }

  const indices = new Int32Array(variables.length);
  for (let i = 0; i < variables.length; i++) indices[i] = assigned.get(variables[i]) ?? 0;
  return { indices, logProbability };
}

function toExplanation(variables: readonly Variable[], r: MaxProductResult): Explanation {
  const assignment = new Map<string, string>();
  for (let i = 0; i < variables.length; i++) {
    assignment.set(variables[i].name, variables[i].outcomes[r.indices[i]]);
  }
  return { assignment, logProbability: r.logProbability };
}

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Most probable full assignment given evidence (max-product VE).
 * Throws `ImpossibleEvidenceError` if the evidence has probability zero.
 */
export function mostProbableExplanation(
  variables: readonly Variable[],
  cpts: readonly CPT[],
  evidence?: Evidence,
  likelihoodEvidence?: LikelihoodEvidence,
): Explanation {
  validateEvidence(variables, evidence, likelihoodEvidence);
  const order = minFillOrder(variables, cpts);
  const factors = buildLogFactors(cpts, evidence, likelihoodEvidence);
  const result = runMaxProduct(variables, factors, order);
  if (result.logProbability === -Infinity) throw new ImpossibleEvidenceError();
  return toExplanation(variables, result);
}

interface Constraints {
  readonly fixed: Map<Variable, number>;
  readonly excluded: Map<Variable, Set<number>>;
}

interface Candidate {
  readonly result: MaxProductResult;
  readonly constraints: Constraints;
}

/** Binary max-heap on logProbability. */
class MaxHeap {
  private items: Candidate[] = [];
  get size(): number { return this.items.length; }
  push(c: Candidate): void {
    const a = this.items;
    a.push(c);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].result.logProbability >= a[i].result.logProbability) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): Candidate {
    const a = this.items;
    const top = a[0];
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l].result.logProbability > a[m].result.logProbability) m = l;
        if (r < a.length && a[r].result.logProbability > a[m].result.logProbability) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

/**
 * The `k` most probable full assignments, in descending probability
 * (ties in arbitrary order). Returns fewer than `k` if the evidence leaves
 * fewer consistent assignments.
 */
export function kBestExplanations(
  variables: readonly Variable[],
  cpts: readonly CPT[],
  k: number,
  evidence?: Evidence,
  likelihoodEvidence?: LikelihoodEvidence,
): Explanation[] {
  if (k <= 0) return [];
  validateEvidence(variables, evidence, likelihoodEvidence);
  const order = minFillOrder(variables, cpts);
  const base = buildLogFactors(cpts, evidence, likelihoodEvidence);

  // Variables eligible for constraint splitting: not hard evidence, > 1 outcome.
  const splitVars = variables.filter(v => !(evidence?.has(v.name)) && v.outcomes.length > 1);
  const colOf = new Map<Variable, number>();
  variables.forEach((v, i) => colOf.set(v, i));

  const solve = (constraints: Constraints): MaxProductResult => {
    const factors = base.map(f => {
      let g = f;
      for (const v of f.variables) {
        const fixed = constraints.fixed.get(v);
        const excluded = constraints.excluded.get(v);
        if (fixed === undefined && !excluded) continue;
        const logW = new Float64Array(v.outcomes.length);
        if (fixed !== undefined) {
          logW.fill(-Infinity);
          logW[fixed] = 0;
        }
        if (excluded) for (const o of excluded) logW[o] = -Infinity;
        g = addLogWeights(g, v, logW);
      }
      return g;
    });
    return runMaxProduct(variables, factors, order);
  };

  const heap = new MaxHeap();
  const root: Constraints = { fixed: new Map(), excluded: new Map() };
  const first = solve(root);
  if (first.logProbability === -Infinity) return [];
  heap.push({ result: first, constraints: root });

  const results: Explanation[] = [];
  while (results.length < k && heap.size > 0) {
    const best = heap.pop();
    results.push(toExplanation(variables, best.result));
    if (results.length >= k) break;

    const { fixed, excluded } = best.constraints;
    const bestIdx = best.result.indices;
    const prefix = new Map(fixed);
    for (const v of splitVars) {
      if (fixed.has(v)) continue;
      const value = bestIdx[colOf.get(v)!];
      const childExcluded = new Map(excluded);
      childExcluded.set(v, new Set([...(excluded.get(v) ?? []), value]));
      const child: Constraints = { fixed: new Map(prefix), excluded: childExcluded };
      const r = solve(child);
      if (r.logProbability > -Infinity) heap.push({ result: r, constraints: child });
      prefix.set(v, value);
    }
  }
  return results;
}
