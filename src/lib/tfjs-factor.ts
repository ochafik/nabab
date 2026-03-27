/**
 * GPU-accelerated factor operations using TensorFlow.js.
 *
 * This is a prototype that expresses nabab Factor operations as tensor ops,
 * enabling GPU acceleration via WebGPU (in browsers) or WASM backends.
 * For testing we use the CPU backend.
 *
 * Key insight: a Factor with variables [A(2), B(3), C(2)] maps to a
 * tf.Tensor of shape [2, 3, 2]. Multiply factors becomes reshape +
 * broadcast + element-wise mul. Marginalize becomes tf.sum over axes.
 */
import * as tf from '@tensorflow/tfjs-core';
import type { Variable } from './types.js';
import { createFactor, tableSize, type Factor } from './factor.js';

let backendInitialized = false;

/**
 * Ensure a tfjs backend is registered and ready.
 * Call this once before using any tfjs factor operations.
 */
export async function ensureBackend(): Promise<void> {
  if (backendInitialized) return;
  // Dynamically import the CPU backend so it self-registers.
  await import('@tensorflow/tfjs-backend-cpu');
  await tf.setBackend('cpu');
  await tf.ready();
  backendInitialized = true;
}

// ---------------------------------------------------------------------------
// Conversion helpers
// ---------------------------------------------------------------------------

/**
 * Convert a nabab Factor into a tf.Tensor shaped by variable cardinalities.
 *
 * A Factor with variables [A(2), B(3)] and values [v0..v5] becomes a
 * tensor of shape [2, 3]. The value layout is already row-major
 * (first variable outermost), which matches tf's default memory order.
 */
export function factorToTensor(f: Factor): { tensor: tf.Tensor; variables: Variable[] } {
  if (f.variables.length === 0) {
    // Scalar factor
    return { tensor: tf.scalar(f.values[0]), variables: [] };
  }
  const shape = f.variables.map(v => v.outcomes.length);
  // Float64Array -> tf.tensor (tfjs will use float32 internally)
  const tensor = tf.tensor(Array.from(f.values), shape);
  return { tensor, variables: [...f.variables] };
}

/**
 * Convert a tf.Tensor back into a nabab Factor.
 */
export function tensorToFactor(tensor: tf.Tensor, variables: Variable[]): Factor {
  const data = tensor.dataSync(); // Float32Array from tfjs
  const values = new Float64Array(data.length);
  for (let i = 0; i < data.length; i++) values[i] = data[i];
  return createFactor(variables, values);
}

// ---------------------------------------------------------------------------
// Core operations
// ---------------------------------------------------------------------------

/**
 * GPU-accelerated factor multiplication.
 *
 * Strategy:
 * 1. Compute the union of variables from both factors (f1 order first,
 *    then new variables from f2) -- matching the native implementation.
 * 2. Reshape each factor's tensor so it broadcasts correctly over the
 *    union dimensions (size-1 axes for variables not in that factor).
 * 3. tf.mul with automatic broadcasting.
 * 4. Convert back to Factor.
 */
export function tfjsMultiplyFactors(f1: Factor, f2: Factor): Factor {
  // Handle scalar/constant factors
  if (f1.variables.length === 0) {
    const c = f1.values[0];
    const values = new Float64Array(f2.values.length);
    for (let i = 0; i < values.length; i++) values[i] = f2.values[i] * c;
    return createFactor(f2.variables, values);
  }
  if (f2.variables.length === 0) {
    const c = f2.values[0];
    const values = new Float64Array(f1.values.length);
    for (let i = 0; i < values.length; i++) values[i] = f1.values[i] * c;
    return createFactor(f1.variables, values);
  }

  // Build union of variables (preserving order from f1, then new from f2)
  const varSet = new Set<Variable>(f1.variables);
  const unionVars: Variable[] = [...f1.variables];
  for (const v of f2.variables) {
    if (!varSet.has(v)) {
      unionVars.push(v);
      varSet.add(v);
    }
  }

  const unionShape = unionVars.map(v => v.outcomes.length);

  // Build reshape specs: for each factor, the shape in the union
  // dimensionality is the variable's cardinality if present, else 1.
  const shape1 = unionVars.map(v => (f1.variables.includes(v) ? v.outcomes.length : 1));
  const shape2 = unionVars.map(v => (f2.variables.includes(v) ? v.outcomes.length : 1));

  // We need to rearrange the factor data into the union order.
  // factorToTensor gives us a tensor in the factor's own variable order.
  // We must transpose it to align with the union, then reshape to add
  // size-1 dimensions for missing variables.

  return tf.tidy(() => {
    const t1src = factorToTensor(f1).tensor;
    const t2src = factorToTensor(f2).tensor;

    // For f1: its axes correspond to f1.variables. We need to find,
    // for each union var that IS in f1, which axis of t1src it sits at.
    // Then we'll transpose t1src so its axes match the union sub-order,
    // and reshape to insert size-1 dims for missing variables.
    const t1 = alignTensor(t1src, f1.variables, unionVars, shape1);
    const t2 = alignTensor(t2src, f2.variables, unionVars, shape2);

    const product = tf.mul(t1, t2);
    // product has shape = unionShape (after broadcast)
    const result = tf.reshape(product, unionShape);
    return tensorToFactor(result, unionVars);
  });
}

/**
 * Align a tensor from its factor variable order into the union variable order,
 * inserting size-1 dimensions for variables not present in the factor.
 *
 * Example: factor has vars [B, C], union has [A, B, C].
 * 1. Factor tensor shape: [|B|, |C|]
 * 2. We need union order [A, B, C] with shape [1, |B|, |C|] for this factor.
 * 3. The factor variables in union order are at positions [1, 2], so we first
 *    figure out the permutation of factor axes to match the union sub-order,
 *    transpose, then reshape to insert size-1 dims.
 */
function alignTensor(
  tensor: tf.Tensor,
  factorVars: readonly Variable[],
  unionVars: Variable[],
  targetShape: number[],
): tf.Tensor {
  // Determine the order of factor variables as they appear in unionVars.
  // For each factor var (in its original order), find its index in unionVars.
  const factorVarUnionIndices = factorVars.map(v => unionVars.indexOf(v));

  // We need the factor axes sorted by their union position.
  // perm[i] = the factor axis that should become the i-th factor axis in union order.
  const sortedAxes = factorVars
    .map((_, i) => i)
    .sort((a, b) => factorVarUnionIndices[a] - factorVarUnionIndices[b]);

  // Check if a transpose is actually needed (if sortedAxes != [0,1,2,...])
  let needsTranspose = false;
  for (let i = 0; i < sortedAxes.length; i++) {
    if (sortedAxes[i] !== i) { needsTranspose = true; break; }
  }

  let aligned = needsTranspose ? tf.transpose(tensor, sortedAxes) : tensor;

  // Now reshape to insert size-1 dimensions for missing variables.
  aligned = tf.reshape(aligned, targetShape);
  return aligned;
}

/**
 * GPU-accelerated marginalization (summing out variables).
 *
 * Strategy: convert to tensor, tf.sum over the axes corresponding to
 * varsToRemove, convert back.
 */
export function tfjsMarginalize(factor: Factor, varsToRemove: readonly Variable[]): Factor {
  if (varsToRemove.length === 0) return factor;

  const removeSet = new Set(varsToRemove);
  const remaining = factor.variables.filter(v => !removeSet.has(v));

  if (remaining.length === 0) {
    // Sum everything
    return tf.tidy(() => {
      const t = factorToTensor(factor).tensor;
      const total = tf.sum(t);
      const val = total.dataSync()[0];
      return createFactor([], new Float64Array([val]));
    });
  }

  // Find axes to sum over
  const axesToSum = factor.variables
    .map((v, i) => removeSet.has(v) ? i : -1)
    .filter(i => i >= 0);

  return tf.tidy(() => {
    const t = factorToTensor(factor).tensor;
    const summed = tf.sum(t, axesToSum);
    return tensorToFactor(summed, remaining);
  });
}
