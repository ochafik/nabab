/**
 * Factor operations for probabilistic inference.
 *
 * A Factor is a function from variable assignments to real numbers,
 * stored as a flat table in row-major order (first variable outermost).
 */
import type { Variable } from './types.js';

export interface Factor {
  readonly variables: readonly Variable[];
  readonly values: Float64Array;
  readonly strides: readonly number[];
}

/** Compute strides for a list of variables. */
function computeStrides(variables: readonly Variable[]): number[] {
  const n = variables.length;
  const strides = new Array<number>(n);
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

  // Build union of variables (preserving order from f1, then new from f2)
  const varSet = new Set(f1.variables);
  const variables: Variable[] = [...f1.variables];
  for (const v of f2.variables) {
    if (!varSet.has(v)) {
      variables.push(v);
      varSet.add(v);
    }
  }

  const size = tableSize(variables);
  const values = new Float64Array(size);
  const strides = computeStrides(variables);

  // Precompute stride mappings from result to f1 and f2
  const f1Map = variables.map(v => {
    const idx = f1.variables.indexOf(v);
    return idx >= 0 ? f1.strides[idx] : 0;
  });
  const f2Map = variables.map(v => {
    const idx = f2.variables.indexOf(v);
    return idx >= 0 ? f2.strides[idx] : 0;
  });

  // Enumerate all assignments
  const indices = new Int32Array(variables.length);
  for (let i = 0; i < size; i++) {
    let idx1 = 0, idx2 = 0;
    for (let j = 0; j < variables.length; j++) {
      idx1 += indices[j] * f1Map[j];
      idx2 += indices[j] * f2Map[j];
    }
    values[i] = f1.values[idx1] * f2.values[idx2];

    // Increment indices (last variable fastest)
    for (let j = variables.length - 1; j >= 0; j--) {
      indices[j]++;
      if (indices[j] < variables[j].outcomes.length) break;
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
    for (let i = 0; i < factor.values.length; i++) total += factor.values[i];
    return constantFactor(total);
  }

  const size = tableSize(remaining);
  const values = new Float64Array(size);
  const resultStrides = computeStrides(remaining);

  // Map from source variable index to result stride (0 if marginalized out)
  const resultMap = factor.variables.map(v => {
    const idx = remaining.indexOf(v);
    return idx >= 0 ? resultStrides[idx] : 0;
  });

  // Enumerate all assignments of the source factor
  const indices = new Int32Array(factor.variables.length);
  const srcSize = factor.values.length;
  for (let i = 0; i < srcSize; i++) {
    let resultIdx = 0;
    for (let j = 0; j < factor.variables.length; j++) {
      resultIdx += indices[j] * resultMap[j];
    }
    values[resultIdx] += factor.values[i];

    // Increment indices
    for (let j = factor.variables.length - 1; j >= 0; j--) {
      indices[j]++;
      if (indices[j] < factor.variables[j].outcomes.length) break;
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
  const indices = new Int32Array(factor.variables.length);
  for (let i = 0; i < factor.values.length; i++) {
    values[i] = factor.values[i] * weights[indices[varIdx]];
    for (let j = factor.variables.length - 1; j >= 0; j--) {
      indices[j]++;
      if (indices[j] < factor.variables[j].outcomes.length) break;
      indices[j] = 0;
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
