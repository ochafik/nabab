/** Continuous (Gaussian) variable support for Bayesian networks. */
import type { Evidence } from './types.js';
import { BayesianNetwork } from './network.js';

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

/** Learn CLG parameters from data using OLS, grouped by discrete parent config. */
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

    const cols = p + 1;
    const beta = olsSolve(X, y, n, cols);

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

// ─── Linear Algebra Helpers (OLS via normal equations) ───────────────

/** Solve (X'X) beta = X'y via Gaussian elimination with partial pivoting. */
function olsSolve(X: number[][], y: number[], n: number, p: number): number[] {
  // Compute X'X (p x p) and X'y (p x 1) in one pass
  const XtX: number[][] = Array.from({ length: p }, () => new Array(p).fill(0));
  const Xty: number[] = new Array(p).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < p; j++) {
      Xty[j] += X[i][j] * y[i];
      for (let k = j; k < p; k++) XtX[j][k] += X[i][j] * X[i][k];
    }
  }
  // Symmetrize
  for (let j = 0; j < p; j++)
    for (let k = 0; k < j; k++) XtX[j][k] = XtX[k][j];

  // Gaussian elimination with partial pivoting on augmented [XtX | Xty]
  const M = XtX.map((row, i) => [...row, Xty[i]]);
  for (let col = 0; col < p; col++) {
    let maxVal = Math.abs(M[col][col]), maxRow = col;
    for (let row = col + 1; row < p; row++) {
      if (Math.abs(M[row][col]) > maxVal) { maxVal = Math.abs(M[row][col]); maxRow = row; }
    }
    [M[col], M[maxRow]] = [M[maxRow], M[col]];
    const pivot = M[col][col];
    if (Math.abs(pivot) < 1e-12) continue;
    for (let row = col + 1; row < p; row++) {
      const f = M[row][col] / pivot;
      for (let j = col; j <= p; j++) M[row][j] -= f * M[col][j];
    }
  }
  // Back substitution
  const x = new Array(p).fill(0);
  for (let i = p - 1; i >= 0; i--) {
    if (Math.abs(M[i][i]) < 1e-12) continue;
    let s = M[i][p];
    for (let j = i + 1; j < p; j++) s -= M[i][j] * x[j];
    x[i] = s / M[i][i];
  }
  return x;
}

// ─── Inference (discretize-and-delegate) ─────────────────────────────

/**
 * Infer the posterior of a continuous variable given discrete and continuous
 * evidence, using CLG parameters (mean = linear function of continuous parents).
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
