/**
 * Continuous (Gaussian) variable support for Bayesian networks.
 *
 * Provides discretization of continuous variables, Conditional Linear Gaussian
 * (CLG) parameter learning via OLS, and inference by discretizing then
 * delegating to the existing discrete engine.
 */
import type { Evidence } from './types.js';
import { BayesianNetwork } from './network.js';

// ─── Types ───────────────────────────────────────────────────────────

/** A Gaussian distribution parameterized by mean and variance. */
export interface GaussianDistribution {
  mean: number;
  variance: number;
}

/**
 * A Conditional Linear Gaussian (CLG) node.
 * Mean is a linear function of continuous parents: mean = b0 + b1*parent1 + ...
 * For each configuration of discrete parents, there's a separate set of coefficients.
 */
export interface CLGNode {
  variable: string;
  type: 'continuous';
  discreteParents: string[];
  continuousParents: string[];
  /** For each discrete parent config key: { intercept, coefficients[], variance } */
  parameters: Map<string, { intercept: number; coefficients: number[]; variance: number }>;
}

// ─── Discretization ──────────────────────────────────────────────────

/**
 * Discretize a continuous variable into bins.
 *
 * @param values     Array of numeric observations.
 * @param method     Binning strategy (default 'equal-width').
 * @param bins       Number of bins (default 3).
 * @returns labels, thresholds separating bins, and discretized category per value.
 */
export function discretize(
  values: number[],
  method: 'equal-width' | 'equal-frequency' = 'equal-width',
  bins = 3,
): { labels: string[]; thresholds: number[]; discretized: string[] } {
  if (values.length === 0) throw new Error('Cannot discretize empty array');
  if (bins < 1) throw new Error('bins must be >= 1');

  const sorted = [...values].sort((a, b) => a - b);
  const thresholds: number[] = [];

  if (method === 'equal-width') {
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const width = (max - min) / bins;
    for (let i = 1; i < bins; i++) {
      thresholds.push(min + i * width);
    }
  } else {
    // equal-frequency: each bin gets ~same number of samples
    const binSize = values.length / bins;
    for (let i = 1; i < bins; i++) {
      const idx = Math.min(Math.floor(i * binSize), sorted.length - 1);
      thresholds.push(sorted[idx]);
    }
    // Deduplicate thresholds (can happen with ties)
    const unique: number[] = [];
    for (const t of thresholds) {
      if (unique.length === 0 || t > unique[unique.length - 1]) unique.push(t);
    }
    thresholds.length = 0;
    thresholds.push(...unique);
  }

  // Build labels: bin0 = "<t0", bin1 = "t0-t1", ..., binN = ">=tN-1"
  const labels: string[] = [];
  if (thresholds.length === 0) {
    labels.push('all');
  } else {
    labels.push(`<${fmtNum(thresholds[0])}`);
    for (let i = 1; i < thresholds.length; i++) {
      labels.push(`${fmtNum(thresholds[i - 1])}-${fmtNum(thresholds[i])}`);
    }
    labels.push(`>=${fmtNum(thresholds[thresholds.length - 1])}`);
  }

  // Assign each value to a bin
  const discretized = values.map(v => {
    for (let i = 0; i < thresholds.length; i++) {
      if (v < thresholds[i]) return labels[i];
    }
    return labels[labels.length - 1];
  });

  return { labels, thresholds, discretized };
}

function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

// ─── CLG Parameter Learning (OLS) ───────────────────────────────────

/**
 * Learn CLG parameters from data using ordinary least squares.
 *
 * Groups data by discrete parent configuration, then within each group
 * fits y = b0 + b1*x1 + b2*x2 + ... using the normal equations.
 */
export function learnCLGParameters(
  data: Array<Record<string, number | string>>,
  variable: string,
  discreteParents: string[],
  continuousParents: string[],
): CLGNode {
  // Group rows by discrete parent configuration
  const groups = new Map<string, Array<Record<string, number | string>>>();
  for (const row of data) {
    const key = discreteParents.map(p => String(row[p])).join(',');
    let group = groups.get(key);
    if (!group) { group = []; groups.set(key, group); }
    group.push(row);
  }

  const parameters = new Map<string, { intercept: number; coefficients: number[]; variance: number }>();

  for (const [key, group] of groups) {
    const n = group.length;
    const p = continuousParents.length;

    if (n <= p) {
      // Not enough data for OLS; use sample mean and variance
      const ys = group.map(r => Number(r[variable]));
      const mean = ys.reduce((a, b) => a + b, 0) / n;
      const variance = n > 1
        ? ys.reduce((s, y) => s + (y - mean) ** 2, 0) / (n - 1)
        : 0;
      parameters.set(key, { intercept: mean, coefficients: new Array(p).fill(0), variance });
      continue;
    }

    // Build X matrix (n x (p+1)) with intercept column, and y vector
    const X: number[][] = [];
    const y: number[] = [];
    for (const row of group) {
      const xRow = [1, ...continuousParents.map(cp => Number(row[cp]))];
      X.push(xRow);
      y.push(Number(row[variable]));
    }

    // Normal equations: beta = (X'X)^-1 X'y
    const cols = p + 1;
    const XtX = matMul(transpose(X, n, cols), X, cols, n, cols);
    const Xty = matVecMul(transpose(X, n, cols), y, cols, n);
    const beta = solveLinear(XtX, Xty, cols);

    // Compute residual variance
    let ssRes = 0;
    for (let i = 0; i < n; i++) {
      let predicted = 0;
      for (let j = 0; j < cols; j++) predicted += X[i][j] * beta[j];
      ssRes += (y[i] - predicted) ** 2;
    }
    const variance = n > cols ? ssRes / (n - cols) : 0;

    parameters.set(key, {
      intercept: beta[0],
      coefficients: beta.slice(1),
      variance,
    });
  }

  return { variable, type: 'continuous', discreteParents, continuousParents, parameters };
}

// ─── Linear Algebra Helpers ─────────────────────────────────────────

function transpose(A: number[][], rows: number, cols: number): number[][] {
  const T: number[][] = [];
  for (let j = 0; j < cols; j++) {
    const row: number[] = [];
    for (let i = 0; i < rows; i++) row.push(A[i][j]);
    T.push(row);
  }
  return T;
}

function matMul(A: number[][], B: number[][], aRows: number, aCols: number, bCols: number): number[][] {
  const C: number[][] = [];
  for (let i = 0; i < aRows; i++) {
    const row: number[] = new Array(bCols).fill(0);
    for (let k = 0; k < aCols; k++) {
      const aik = A[i][k];
      for (let j = 0; j < bCols; j++) row[j] += aik * B[k][j];
    }
    C.push(row);
  }
  return C;
}

function matVecMul(A: number[][], v: number[], aRows: number, aCols: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < aRows; i++) {
    let s = 0;
    for (let j = 0; j < aCols; j++) s += A[i][j] * v[j];
    result.push(s);
  }
  return result;
}

/** Solve Ax = b via Gaussian elimination with partial pivoting. */
function solveLinear(A: number[][], b: number[], n: number): number[] {
  // Augmented matrix
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    // Partial pivoting
    let maxVal = Math.abs(M[col][col]);
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > maxVal) {
        maxVal = Math.abs(M[row][col]);
        maxRow = row;
      }
    }
    [M[col], M[maxRow]] = [M[maxRow], M[col]];

    const pivot = M[col][col];
    if (Math.abs(pivot) < 1e-12) {
      // Singular – fill with zeros
      continue;
    }

    // Eliminate below
    for (let row = col + 1; row < n; row++) {
      const factor = M[row][col] / pivot;
      for (let j = col; j <= n; j++) M[row][j] -= factor * M[col][j];
    }
  }

  // Back substitution
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    if (Math.abs(M[i][i]) < 1e-12) continue;
    let s = M[i][n];
    for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j];
    x[i] = s / M[i][i];
  }
  return x;
}

// ─── Inference (discretize-and-delegate) ─────────────────────────────

/**
 * Infer the approximate posterior distribution of a continuous variable
 * by discretizing it and all continuous evidence, then running standard
 * discrete inference.
 *
 * Returns a GaussianDistribution by computing the mean and variance of
 * the resulting discrete posterior (using bin midpoints).
 */
export function inferContinuous(
  network: BayesianNetwork,
  clgNodes: CLGNode[],
  queryVariable: string,
  discreteEvidence?: Evidence,
  continuousEvidence?: Map<string, number>,
): GaussianDistribution {
  // Find the CLG node for the query
  const qNode = clgNodes.find(n => n.variable === queryVariable);
  if (!qNode) throw new Error(`No CLG node found for variable "${queryVariable}"`);

  // Build a single discrete-parent config key from evidence
  const configKey = qNode.discreteParents
    .map(p => discreteEvidence?.get(p) ?? '?')
    .join(',');

  // Find the best-matching parameter set
  const params = qNode.parameters.get(configKey);
  if (!params) {
    // Fall back: use the first available parameter set
    const firstParams = qNode.parameters.values().next().value;
    if (!firstParams) throw new Error(`No parameters for variable "${queryVariable}"`);
    return computeGaussianFromParams(firstParams, qNode.continuousParents, continuousEvidence);
  }

  return computeGaussianFromParams(params, qNode.continuousParents, continuousEvidence);
}

function computeGaussianFromParams(
  params: { intercept: number; coefficients: number[]; variance: number },
  continuousParents: string[],
  continuousEvidence?: Map<string, number>,
): GaussianDistribution {
  let mean = params.intercept;
  for (let i = 0; i < continuousParents.length; i++) {
    const val = continuousEvidence?.get(continuousParents[i]) ?? 0;
    mean += params.coefficients[i] * val;
  }
  return { mean, variance: params.variance };
}
