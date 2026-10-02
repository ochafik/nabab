/**
 * Monte-Carlo sampling for Bayesian networks.
 *
 * - `forwardSample`: ancestral (prior) sampling — draw each variable in
 *   topological order from its CPT row given the sampled parents.
 * - `likelihoodWeighting`: importance sampling consistent with evidence.
 *   Hard-evidence variables are clamped and the sample weight is multiplied
 *   by P(e | parents); likelihood-evidence variables are drawn from the
 *   reweighted row P(x | parents)·w(x) and the sample weight is multiplied
 *   by the row's normaliser Σ_x P(x | parents)·w(x).
 *
 * Sample storage is column-major: `SampleResult.columns[i]` is a typed array
 * of length `n` holding the outcome index of `variables[i]` in each sample.
 * This keeps per-variable statistics (marginals, mutual information) cache
 * friendly and compact (1 byte per cell when a variable has ≤ 256 outcomes).
 */
import { validateEvidence } from './evidence.js';
import type { Variable, CPT, Evidence, LikelihoodEvidence, Distribution } from './types.js';

export interface SamplingOptions {
  /** PRNG seed; the same seed always yields the same samples. Default: random. */
  readonly seed?: number;
}

/** One column of samples: outcome index per sample for a single variable. */
export type SampleColumn = Uint8Array | Uint16Array;

export interface SampleResult {
  /** Variables in column order (topological order of the network). */
  readonly variables: readonly Variable[];
  /** Number of samples. */
  readonly n: number;
  /** `columns[i][s]` = outcome index of `variables[i]` in sample `s`. */
  readonly columns: readonly SampleColumn[];
  /** Importance weight of each sample (all 1 for `forwardSample`). */
  readonly weights: Float64Array;
  /** Σ weights (0 if every sample was inconsistent with the evidence). */
  readonly totalWeight: number;
}

/**
 * Seeded 32-bit PRNG (mulberry32). Returns floats in [0, 1).
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRng(opts?: SamplingOptions): () => number {
  if (opts?.seed !== undefined) return mulberry32(opts.seed);
  return mulberry32(Math.floor(Math.random() * 4294967296));
}

/**
 * Topological order of the network (parents before children) via Kahn's
 * algorithm. Variables without a CPT are treated as roots. Throws on cycles.
 */
export function topologicalOrder(variables: readonly Variable[], cpts: readonly CPT[]): Variable[] {
  const cptByVar = new Map<Variable, CPT>();
  for (const cpt of cpts) cptByVar.set(cpt.variable, cpt);

  const inDegree = new Map<Variable, number>();
  const children = new Map<Variable, Variable[]>();
  for (const v of variables) {
    inDegree.set(v, 0);
    children.set(v, []);
  }
  for (const v of variables) {
    const cpt = cptByVar.get(v);
    if (!cpt) continue;
    for (const p of cpt.parents) {
      if (!inDegree.has(p)) throw new Error(`Parent ${p.name} of ${v.name} is not in the variable list`);
      inDegree.set(v, inDegree.get(v)! + 1);
      children.get(p)!.push(v);
    }
  }

  // Stable: process roots in the order they appear in `variables`.
  const queue: Variable[] = variables.filter(v => inDegree.get(v) === 0);
  const order: Variable[] = [];
  for (let head = 0; head < queue.length; head++) {
    const v = queue[head];
    order.push(v);
    for (const c of children.get(v)!) {
      const d = inDegree.get(c)! - 1;
      inDegree.set(c, d);
      if (d === 0) queue.push(c);
    }
  }
  if (order.length !== variables.length) {
    throw new Error('Network contains a cycle; cannot compute a topological order');
  }
  return order;
}

function makeColumn(card: number, n: number): SampleColumn {
  return card <= 256 ? new Uint8Array(n) : new Uint16Array(n);
}

/** Per-variable sampling plan: CPT row lookup precomputed against column indices. */
interface Plan {
  readonly variable: Variable;
  readonly card: number;
  readonly table: Float64Array;
  /** Column index of each parent (in `order`). */
  readonly parentCols: Int32Array;
  /** Row stride of each parent (in outcome units). */
  readonly parentStrides: Int32Array;
  /** Hard-evidence outcome index, or -1. */
  readonly clamped: number;
  /** Likelihood weights per outcome, or null. */
  readonly likelihood: Float64Array | null;
}

function buildPlans(
  order: readonly Variable[],
  cpts: readonly CPT[],
  evidence?: Evidence,
  likelihoodEvidence?: LikelihoodEvidence,
): Plan[] {
  const colOf = new Map<Variable, number>();
  order.forEach((v, i) => colOf.set(v, i));
  const cptByVar = new Map<Variable, CPT>();
  for (const cpt of cpts) cptByVar.set(cpt.variable, cpt);

  return order.map(v => {
    const card = v.outcomes.length;
    const cpt = cptByVar.get(v);
    const parents = cpt?.parents ?? [];
    let table: Float64Array;
    if (cpt) {
      table = cpt.table;
    } else {
      // No CPT: uniform prior.
      table = new Float64Array(card).fill(1 / card);
    }
    const parentCols = new Int32Array(parents.length);
    const parentStrides = new Int32Array(parents.length);
    let stride = card;
    for (let i = parents.length - 1; i >= 0; i--) {
      parentCols[i] = colOf.get(parents[i])!;
      parentStrides[i] = stride;
      stride *= parents[i].outcomes.length;
    }

    let clamped = -1;
    const observed = evidence?.get(v.name);
    if (observed !== undefined) {
      clamped = v.outcomes.indexOf(observed);
      if (clamped < 0) throw new Error(`Unknown outcome "${observed}" for variable ${v.name}`);
    }

    let likelihood: Float64Array | null = null;
    const lw = likelihoodEvidence?.get(v.name);
    if (lw) {
      likelihood = new Float64Array(card);
      for (let i = 0; i < card; i++) likelihood[i] = lw.get(v.outcomes[i]) ?? 1;
    }

    return { variable: v, card, table, parentCols, parentStrides, clamped, likelihood };
  });
}

/** Draw an index from unnormalised weights `w[offset .. offset+card)` given total `sum`. */
function drawIndex(w: Float64Array, offset: number, card: number, sum: number, u: number): number {
  let acc = 0;
  const target = u * sum;
  for (let i = 0; i < card; i++) {
    acc += w[offset + i];
    if (target < acc) return i;
  }
  // Rounding: return the last outcome with non-zero weight.
  for (let i = card - 1; i >= 0; i--) if (w[offset + i] > 0) return i;
  return card - 1;
}

function runSampler(
  variables: readonly Variable[],
  cpts: readonly CPT[],
  n: number,
  opts: SamplingOptions | undefined,
  evidence?: Evidence,
  likelihoodEvidence?: LikelihoodEvidence,
): SampleResult {
  if (!Number.isInteger(n) || n < 0) throw new Error(`Sample count must be a non-negative integer, got ${n}`);
  validateEvidence(variables, evidence, likelihoodEvidence);
  const rng = makeRng(opts);
  const order = topologicalOrder(variables, cpts);
  const plans = buildPlans(order, cpts, evidence, likelihoodEvidence);
  const columns = plans.map(p => makeColumn(p.card, n));
  const weights = new Float64Array(n);
  let totalWeight = 0;

  // Scratch buffer for reweighted rows.
  let maxCard = 1;
  for (const p of plans) if (p.card > maxCard) maxCard = p.card;
  const scratch = new Float64Array(maxCard);

  for (let s = 0; s < n; s++) {
    let w = 1;
    for (let c = 0; c < plans.length; c++) {
      const p = plans[c];
      let offset = 0;
      for (let i = 0; i < p.parentCols.length; i++) {
        offset += columns[p.parentCols[i]][s] * p.parentStrides[i];
      }

      if (p.clamped >= 0) {
        const idx = p.clamped;
        w *= p.table[offset + idx];
        if (p.likelihood) w *= p.likelihood[idx];
        columns[c][s] = idx;
        continue;
      }

      if (p.likelihood) {
        let sum = 0;
        for (let i = 0; i < p.card; i++) {
          const v = p.table[offset + i] * p.likelihood[i];
          scratch[i] = v;
          sum += v;
        }
        w *= sum;
        columns[c][s] = sum > 0 ? drawIndex(scratch, 0, p.card, sum, rng()) : 0;
      } else {
        // CPT rows sum to 1 (up to rounding); use the actual row sum for safety.
        let sum = 0;
        for (let i = 0; i < p.card; i++) sum += p.table[offset + i];
        columns[c][s] = sum > 0 ? drawIndex(p.table, offset, p.card, sum, rng()) : 0;
      }
      if (w === 0) break; // dead sample; remaining columns stay 0
    }
    weights[s] = w;
    totalWeight += w;
  }

  return { variables: order, n, columns, weights, totalWeight };
}

/**
 * Ancestral (prior) sampling: `n` independent samples from the joint
 * distribution. All weights are 1.
 */
export function forwardSample(
  variables: readonly Variable[],
  cpts: readonly CPT[],
  n: number,
  opts?: SamplingOptions,
): SampleResult {
  return runSampler(variables, cpts, n, opts);
}

/**
 * Likelihood weighting: `n` weighted samples consistent with hard evidence.
 * Likelihood (soft) evidence multiplies the weights. Posterior expectations
 * are weighted averages: E[f] ≈ Σ w_s f(x_s) / Σ w_s.
 */
export function likelihoodWeighting(
  variables: readonly Variable[],
  cpts: readonly CPT[],
  evidence: Evidence | undefined,
  likelihoodEvidence: LikelihoodEvidence | undefined,
  n: number,
  opts?: SamplingOptions,
): SampleResult {
  return runSampler(variables, cpts, n, opts, evidence, likelihoodEvidence);
}

/** Resolve a variable reference (object or name) to its column index. */
export function sampleColumnIndex(result: SampleResult, variable: Variable | string): number {
  const idx = typeof variable === 'string'
    ? result.variables.findIndex(v => v.name === variable)
    : result.variables.indexOf(variable);
  if (idx < 0) {
    const name = typeof variable === 'string' ? variable : variable.name;
    throw new Error(`Variable ${name} is not in the sample result`);
  }
  return idx;
}

function marginalOfColumn(result: SampleResult, col: number): Distribution {
  const v = result.variables[col];
  const counts = new Float64Array(v.outcomes.length);
  const column = result.columns[col];
  const weights = result.weights;
  for (let s = 0; s < result.n; s++) counts[column[s]] += weights[s];
  const dist = new Map<string, number>();
  const total = result.totalWeight;
  for (let i = 0; i < v.outcomes.length; i++) {
    dist.set(v.outcomes[i], total > 0 ? counts[i] / total : 0);
  }
  return dist;
}

/**
 * Weighted empirical marginal(s) from a sample result.
 * With a `variable`, returns its Distribution; without, one per variable.
 */
export function sampledMarginals(result: SampleResult, variable: Variable | string): Distribution;
export function sampledMarginals(result: SampleResult): Map<Variable, Distribution>;
export function sampledMarginals(
  result: SampleResult,
  variable?: Variable | string,
): Distribution | Map<Variable, Distribution> {
  if (variable !== undefined) {
    return marginalOfColumn(result, sampleColumnIndex(result, variable));
  }
  const all = new Map<Variable, Distribution>();
  for (let c = 0; c < result.variables.length; c++) {
    all.set(result.variables[c], marginalOfColumn(result, c));
  }
  return all;
}
