/**
 * Factor operations for probabilistic inference.
 *
 * A Factor is a function from variable assignments to real numbers,
 * stored as a flat table in row-major order (first variable outermost).
 *
 * Hot-path operations (multiplyFactors, marginalize) are optimized for
 * large factor tables using:
 * - Int32Array for stride mappings (cache-friendly typed arrays)
 * - Incremental index updates instead of per-element dot products
 * - Fast paths for subset relationships and trailing-variable marginalization
 * - Specialized 2-variable factor paths
 */
import type { Variable } from './types.js';

export interface Factor {
  readonly variables: readonly Variable[];
  readonly values: Float64Array;
  readonly strides: Int32Array;
}

/** Compute strides for a list of variables. */
function computeStrides(variables: readonly Variable[]): Int32Array {
  const n = variables.length;
  const strides = new Int32Array(n);
  let stride = 1;
  for (let i = n - 1; i >= 0; i--) {
    strides[i] = stride;
    stride *= variables[i].outcomes.length;
  }
  return strides;
}

/** Compute total table size for a list of variables. */
export function tableSize(variables: readonly Variable[]): number {
  let size = 1;
  for (const v of variables) size *= v.outcomes.length;
  return size;
}

/** Create a factor from variables and values. */
export function createFactor(variables: readonly Variable[], values: Float64Array): Factor {
  return { variables, values, strides: computeStrides(variables) };
}

/** Create a constant factor (no variables). */
export function constantFactor(value: number): Factor {
  return { variables: [], values: new Float64Array([value]), strides: [] };
}

/** Create a factor from a CPT. Variables order: [...parents, variable]. */
export function cptToFactor(
  variable: Variable,
  parents: readonly Variable[],
  table: Float64Array,
): Factor {
  const variables = [...parents, variable];
  return createFactor(variables, new Float64Array(table));
}

/**
 * Compute a flat index into a factor's value array given variable assignments.
 * `assignment` maps each variable to its outcome index (0-based).
 */
function factorIndex(factor: Factor, assignment: Map<Variable, number>): number {
  let index = 0;
  for (let i = 0; i < factor.variables.length; i++) {
    index += (assignment.get(factor.variables[i]) ?? 0) * factor.strides[i];
  }
  return index;
}

/** Evaluate a factor at a given assignment. */
export function evaluateFactor(factor: Factor, assignment: Map<Variable, number>): number {
  return factor.values[factorIndex(factor, assignment)];
}

/**
 * Multiply two factors, producing a factor over the union of their variables.
 * This is the core operation for combining CPTs and clique potentials.
 */
export function multiplyFactors(f1: Factor, f2: Factor): Factor {
  // --- Constant factor fast paths ---
  if (f1.variables.length === 0) {
    const result = new Float64Array(f2.values.length);
    const c = f1.values[0];
    for (let i = 0; i < result.length; i++) result[i] = f2.values[i] * c;
    return createFactor(f2.variables, result);
  }
  if (f2.variables.length === 0) {
    const result = new Float64Array(f1.values.length);
    const c = f2.values[0];
    for (let i = 0; i < result.length; i++) result[i] = f1.values[i] * c;
    return createFactor(f1.variables, result);
  }

  // --- Check for subset relationship (very common in BN inference) ---
  // If f2's variables are a subset of f1's variables (or equal), no union needed.
  // This avoids the union-building overhead and uses a simpler indexing scheme.
  const f2IsSubset = f2.variables.length <= f1.variables.length &&
    f2.variables.every(v => f1.variables.includes(v));
  if (f2IsSubset) {
    return multiplySubset(f1, f2);
  }

  const f1IsSubset = f1.variables.length <= f2.variables.length &&
    f1.variables.every(v => f2.variables.includes(v));
  if (f1IsSubset) {
    return multiplySubset(f2, f1);
  }

  // --- General case: build union of variables ---
  return multiplyGeneral(f1, f2);
}

/**
 * Fast path: multiply when `sub`'s variables are a subset of `sup`'s variables.
 * Result has sup's variables. We iterate over sup's table and look up sub's value
 * using incremental index tracking.
 */
function multiplySubset(sup: Factor, sub: Factor): Factor {
  const size = sup.values.length;
  const values = new Float64Array(size);
  const nVars = sup.variables.length;

  // For each variable in sup, compute the corresponding stride in sub (0 if not present).
  const subStrides = new Int32Array(nVars);
  for (let i = 0; i < nVars; i++) {
    const idx = sub.variables.indexOf(sup.variables[i]);
    subStrides[i] = idx >= 0 ? sub.strides[idx] : 0;
  }

  // Cardinalities for the odometer
  const cards = new Int32Array(nVars);
  for (let i = 0; i < nVars; i++) {
    cards[i] = sup.variables[i].outcomes.length;
  }

  // Use incremental index update: maintain subIdx and update it as the
  // odometer ticks, rather than recomputing from scratch each iteration.
  const indices = new Int32Array(nVars);
  let subIdx = 0;

  for (let i = 0; i < size; i++) {
    values[i] = sup.values[i] * sub.values[subIdx];

    // Increment odometer and update subIdx incrementally
    for (let j = nVars - 1; j >= 0; j--) {
      indices[j]++;
      subIdx += subStrides[j];
      if (indices[j] < cards[j]) break;
      // This dimension wrapped: subtract the total we added for it
      subIdx -= cards[j] * subStrides[j];
      indices[j] = 0;
    }
  }

  return createFactor(sup.variables, values);
}

/**
 * General multiply: variables of f1 and f2 partially overlap or are disjoint.
 * Uses incremental index updates for both f1 and f2 indices.
 */
function multiplyGeneral(f1: Factor, f2: Factor): Factor {
  // Build union of variables (preserving order from f1, then new from f2)
  const varSet = new Set<Variable>(f1.variables);
  const variables: Variable[] = [...f1.variables];
  for (const v of f2.variables) {
    if (!varSet.has(v)) {
      variables.push(v);
    }
  }
  const nVars = variables.length;

  const size = tableSize(variables);
  const values = new Float64Array(size);
  const strides = computeStrides(variables);

  // Pre-compute stride mappings as Int32Array for cache-friendly access
  const f1Strides = new Int32Array(nVars);
  const f2Strides = new Int32Array(nVars);
  const cards = new Int32Array(nVars);
  for (let i = 0; i < nVars; i++) {
    const v = variables[i];
    const idx1 = f1.variables.indexOf(v);
    f1Strides[i] = idx1 >= 0 ? f1.strides[idx1] : 0;
    const idx2 = f2.variables.indexOf(v);
    f2Strides[i] = idx2 >= 0 ? f2.strides[idx2] : 0;
    cards[i] = v.outcomes.length;
  }

  // Enumerate with incremental index updates
  const indices = new Int32Array(nVars);
  let idx1 = 0, idx2 = 0;

  for (let i = 0; i < size; i++) {
    values[i] = f1.values[idx1] * f2.values[idx2];

    // Increment odometer and update idx1, idx2 incrementally
    for (let j = nVars - 1; j >= 0; j--) {
      indices[j]++;
      idx1 += f1Strides[j];
      idx2 += f2Strides[j];
      if (indices[j] < cards[j]) break;
      // Dimension wrapped: undo the total added for this dimension
      idx1 -= cards[j] * f1Strides[j];
      idx2 -= cards[j] * f2Strides[j];
      indices[j] = 0;
    }
  }

  return { variables, values, strides };
}

/**
 * Marginalize out the given variables by summing over them.
 */
export function marginalize(factor: Factor, varsToRemove: readonly Variable[]): Factor {
  if (varsToRemove.length === 0) return factor;

  const removeSet = new Set(varsToRemove);
  const remaining = factor.variables.filter(v => !removeSet.has(v));

  if (remaining.length === 0) {
    // Sum everything
    let total = 0;
    const vals = factor.values;
    for (let i = 0; i < vals.length; i++) total += vals[i];
    return constantFactor(total);
  }

  // --- Fast path: check if all removed variables are trailing (last) ---
  // This is common when marginalizing out the child variable from a CPT.
  // In this case we can do a simple contiguous-block sum.
  const nSrc = factor.variables.length;
  const nKeep = remaining.length;
  let allTrailing = true;
  for (let i = 0; i < nKeep; i++) {
    if (factor.variables[i] !== remaining[i]) {
      allTrailing = false;
      break;
    }
  }

  if (allTrailing) {
    return marginalizeTrailing(factor, remaining);
  }

  // --- Fast path: check if all removed variables are leading (first) ---
  // When marginalizing out leading variables, the result values repeat
  // in contiguous blocks at the end of the source array.
  const nRemove = nSrc - nKeep;
  let allLeading = true;
  for (let i = 0; i < nKeep; i++) {
    if (factor.variables[nRemove + i] !== remaining[i]) {
      allLeading = false;
      break;
    }
  }

  if (allLeading) {
    return marginalizeLeading(factor, remaining);
  }

  // --- General case: incremental index updates ---
  return marginalizeGeneral(factor, remaining);
}

/**
 * Fast path: marginalize trailing variables.
 * When removed variables are all at the end, each contiguous block of
 * `blockSize` values in the source maps to one result entry.
 */
function marginalizeTrailing(factor: Factor, remaining: readonly Variable[]): Factor {
  const size = tableSize(remaining);
  const values = new Float64Array(size);
  let blockSize = 1;
  for (let i = remaining.length; i < factor.variables.length; i++) {
    blockSize *= factor.variables[i].outcomes.length;
  }

  const srcValues = factor.values;
  let srcOffset = 0;
  for (let i = 0; i < size; i++) {
    let sum = 0;
    const end = srcOffset + blockSize;
    for (let j = srcOffset; j < end; j++) {
      sum += srcValues[j];
    }
    values[i] = sum;
    srcOffset = end;
  }

  return createFactor(remaining, values);
}

/**
 * Fast path: marginalize leading variables.
 * When removed variables are all at the start, each result entry is the sum
 * of values spaced `resultSize` apart in the source.
 */
function marginalizeLeading(factor: Factor, remaining: readonly Variable[]): Factor {
  const resultSize = tableSize(remaining);
  const values = new Float64Array(resultSize);
  const srcValues = factor.values;
  const srcSize = srcValues.length;

  // Sum all blocks of size resultSize
  for (let i = 0; i < srcSize; i++) {
    values[i % resultSize] += srcValues[i];
  }

  return createFactor(remaining, values);
}

/**
 * General marginalization with incremental index updates.
 */
function marginalizeGeneral(factor: Factor, remaining: readonly Variable[]): Factor {
  const size = tableSize(remaining);
  const values = new Float64Array(size);
  const resultStrides = computeStrides(remaining);
  const nSrc = factor.variables.length;

  // Map from source variable index to result stride (0 if marginalized out)
  // Use Int32Array for cache-friendly access in the hot loop
  const resultMap = new Int32Array(nSrc);
  for (let i = 0; i < nSrc; i++) {
    const idx = remaining.indexOf(factor.variables[i]);
    resultMap[i] = idx >= 0 ? resultStrides[idx] : 0;
  }

  // Cardinalities for the odometer
  const cards = new Int32Array(nSrc);
  for (let i = 0; i < nSrc; i++) {
    cards[i] = factor.variables[i].outcomes.length;
  }

  // Enumerate all source assignments with incremental result index
  const indices = new Int32Array(nSrc);
  const srcSize = factor.values.length;
  const srcValues = factor.values;
  let resultIdx = 0;

  for (let i = 0; i < srcSize; i++) {
    values[resultIdx] += srcValues[i];

    // Increment odometer and update resultIdx incrementally
    for (let j = nSrc - 1; j >= 0; j--) {
      indices[j]++;
      resultIdx += resultMap[j];
      if (indices[j] < cards[j]) break;
      resultIdx -= cards[j] * resultMap[j];
      indices[j] = 0;
    }
  }

  return createFactor(remaining, values);
}

/**
 * Compute the inverse of a factor (1/f). Returns 0 for zero values.
 */
export function invertFactor(factor: Factor): Factor {
  const values = new Float64Array(factor.values.length);
  for (let i = 0; i < values.length; i++) {
    const v = factor.values[i];
    values[i] = v === 0 || !isFinite(v) ? 0 : 1 / v;
  }
  return createFactor(factor.variables, values);
}

/**
 * Normalize a factor so all its values sum to a given norm (default 1).
 */
export function normalizeFactor(factor: Factor, norm = 1): Factor {
  let sum = 0;
  for (let i = 0; i < factor.values.length; i++) sum += factor.values[i];
  if (sum === 0 || sum === norm) return factor;

  const scale = norm / sum;
  const values = new Float64Array(factor.values.length);
  for (let i = 0; i < values.length; i++) values[i] = factor.values[i] * scale;
  return createFactor(factor.variables, values);
}

/**
 * Apply hard evidence to a factor: set all entries inconsistent with
 * the observation to 0.
 */
export function applyEvidence(factor: Factor, variable: Variable, outcomeIndex: number): Factor {
  const weights = new Float64Array(variable.outcomes.length);
  weights[outcomeIndex] = 1;
  return applyLikelihood(factor, variable, weights);
}

/**
 * Apply soft/likelihood evidence to a factor: multiply each entry by
 * the likelihood weight for the corresponding outcome of the variable.
 * Weights are non-negative reals (not necessarily summing to 1).
 * Hard evidence is the special case where one weight is 1 and rest are 0.
 */
export function applyLikelihood(factor: Factor, variable: Variable, weights: Float64Array): Factor {
  const varIdx = factor.variables.indexOf(variable);
  if (varIdx < 0) return factor;

  const values = new Float64Array(factor.values.length);
  const stride = factor.strides[varIdx];
  const card = variable.outcomes.length;
  const srcValues = factor.values;
  const totalSize = srcValues.length;

  // The variable at varIdx cycles through its outcomes with a period of
  // stride * card. Within each period, each outcome occupies `stride`
  // consecutive positions. Use this structure for efficient iteration.
  const blockSize = stride * card; // full cycle length

  for (let blockStart = 0; blockStart < totalSize; blockStart += blockSize) {
    for (let outcomeIdx = 0; outcomeIdx < card; outcomeIdx++) {
      const w = weights[outcomeIdx];
      const offset = blockStart + outcomeIdx * stride;
      const end = offset + stride;
      for (let i = offset; i < end; i++) {
        values[i] = srcValues[i] * w;
      }
    }
  }

  return createFactor(factor.variables, values);
}

/**
 * Extract a marginal distribution for a single variable from a factor.
 */
export function extractDistribution(factor: Factor, variable: Variable): Map<string, number> {
  const othersToRemove = factor.variables.filter(v => v !== variable);
  const marginal = marginalize(factor, othersToRemove);
  const normalized = normalizeFactor(marginal);
  const dist = new Map<string, number>();
  for (let i = 0; i < variable.outcomes.length; i++) {
    dist.set(variable.outcomes[i], normalized.values[i]);
  }
  return dist;
}
