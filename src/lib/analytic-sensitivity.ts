/**
 * Analytic sensitivity analysis using rational function fitting.
 *
 * For a query P(q|e) and a CPT parameter θ, the posterior is exactly:
 *   P(q|e) = (aθ + b) / (cθ + 1)
 * (Chan & Darwiche, 2004). We fit a, b, c from 3 inference evaluations
 * at θ = 0, 0.5, 1, giving exact derivatives and full sensitivity curves.
 */
import type { Variable, CPT, Evidence } from './types.js';
import { BayesianNetwork } from './network.js';

export interface AnalyticSensitivityResult {
  variable: string;
  parentConfig: string;
  outcome: string;
  currentValue: number;
  /** Rational function coefficients: P(q|e) = (a·θ+b)/(c·θ+1) */
  a: number;
  b: number;
  c: number;
  /** Exact derivative at current θ: (a - b·c) / (c·θ + 1)² */
  derivative: number;
  /** Range of P(q|e) as θ goes from 0 to 1 */
  range: number;
}

// ─── Helpers ────────────────────────────────────────────────────────

function parentConfigLabel(parents: readonly Variable[], configIndex: number): string {
  if (parents.length === 0) return '(none)';
  const parts: string[] = [];
  let remaining = configIndex;
  for (let i = parents.length - 1; i >= 0; i--) {
    const nOutcomes = parents[i].outcomes.length;
    parts.unshift(`${parents[i].name}=${parents[i].outcomes[remaining % nOutcomes]}`);
    remaining = Math.floor(remaining / nOutcomes);
  }
  return parts.join(', ');
}

function cloneWithParam(
  network: BayesianNetwork, cptIndex: number,
  rowStart: number, rowLen: number, col: number, newValue: number,
): BayesianNetwork {
  const origCpt = network.cpts[cptIndex];
  const newTable = new Float64Array(origCpt.table);
  const clamped = Math.max(0, Math.min(1, newValue));
  const oldValue = newTable[rowStart + col];
  newTable[rowStart + col] = clamped;
  const sumOthers = 1 - oldValue;
  const targetOthers = 1 - clamped;
  for (let j = 0; j < rowLen; j++) {
    if (j === col) continue;
    newTable[rowStart + j] = sumOthers > 1e-15
      ? (origCpt.table[rowStart + j] / sumOthers) * targetOthers
      : targetOthers / (rowLen - 1);
  }
  const newCpts: CPT[] = network.cpts.map((c, i) =>
    i === cptIndex ? { variable: c.variable, parents: c.parents, table: newTable } : c,
  );
  return new BayesianNetwork({ name: network.name, variables: [...network.variables], cpts: newCpts });
}

function queryPosterior(net: BayesianNetwork, qVar: string, qOut: string, ev?: Evidence): number {
  return net.query(qVar, ev).get(qOut) ?? 0;
}

// ─── Core ───────────────────────────────────────────────────────────

/**
 * Fit rational function P(q|e) = (aθ+b)/(cθ+1) from 3 evaluations.
 */
function fitRational(p0: number, p05: number, p1: number): { a: number; b: number; c: number } {
  // θ=0 → P₀ = b/1 = b
  const b = p0;
  // θ=1 → P₁ = (a+b)/(c+1)
  // θ=0.5 → P₀₅ = (0.5a+b)/(0.5c+1)

  const denom = p1 - p05;
  if (Math.abs(denom) < 1e-15) {
    // Linear case (c ≈ 0): P = aθ + b
    return { a: p1 - p0, b, c: 0 };
  }

  const c = (2 * p05 - p0 - p1) / denom;
  const a = (p1 - b) * (c + 1) - b * c; // from p1 = (a+b)/(c+1) → a = p1*(c+1) - b

  return { a, b, c };
}

/**
 * Evaluate the sensitivity curve at a given θ.
 */
export function evalCurve(r: { a: number; b: number; c: number }, theta: number): number {
  return (r.a * theta + r.b) / (r.c * theta + 1);
}

/**
 * Exact derivative at θ: d/dθ [(aθ+b)/(cθ+1)] = (a - bc) / (cθ+1)²
 */
function exactDerivative(r: { a: number; b: number; c: number }, theta: number): number {
  const d = r.c * theta + 1;
  return (r.a - r.b * r.c) / (d * d);
}

/**
 * Analytic one-way sensitivity analysis.
 * For each CPT parameter, fits the exact rational function and computes
 * the derivative and range. 3 inference calls per parameter.
 */
export function analyticSensitivity(
  network: BayesianNetwork,
  queryVariable: string,
  queryOutcome: string,
  evidence?: Evidence,
): AnalyticSensitivityResult[] {
  const results: AnalyticSensitivityResult[] = [];

  for (let ci = 0; ci < network.cpts.length; ci++) {
    const cpt = network.cpts[ci];
    const v = cpt.variable;
    const nOut = v.outcomes.length;
    const nRows = cpt.table.length / nOut;

    for (let row = 0; row < nRows; row++) {
      const rowStart = row * nOut;
      const pConfig = parentConfigLabel(cpt.parents, row);

      for (let col = 0; col < nOut; col++) {
        const currentValue = cpt.table[rowStart + col];

        // Evaluate P(q|e) at θ = 0, 0.5, 1
        const net0 = cloneWithParam(network, ci, rowStart, nOut, col, 0);
        const net05 = cloneWithParam(network, ci, rowStart, nOut, col, 0.5);
        const net1 = cloneWithParam(network, ci, rowStart, nOut, col, 1);

        const p0 = queryPosterior(net0, queryVariable, queryOutcome, evidence);
        const p05 = queryPosterior(net05, queryVariable, queryOutcome, evidence);
        const p1 = queryPosterior(net1, queryVariable, queryOutcome, evidence);

        const coeffs = fitRational(p0, p05, p1);
        const derivative = exactDerivative(coeffs, currentValue);

        // Range: evaluate curve at endpoints and find extrema
        const v0 = evalCurve(coeffs, 0);
        const v1 = evalCurve(coeffs, 1);
        let minV = Math.min(v0, v1), maxV = Math.max(v0, v1);
        // Check if the rational function has an extremum in (0,1):
        // extremum at θ = -1/c (if c ≠ 0), but that's where denominator = 0 (asymptote, not extremum)
        // Actually for (aθ+b)/(cθ+1), the function is monotonic when ad-bc has constant sign.
        // No interior extrema; range is just |v1 - v0|.

        results.push({
          variable: v.name,
          parentConfig: pConfig,
          outcome: v.outcomes[col],
          currentValue,
          ...coeffs,
          derivative,
          range: maxV - minV,
        });
      }
    }
  }

  return results;
}

/**
 * Aggregate per-variable influence: max |derivative| across all parameters of each variable.
 */
export function variableInfluenceMap(
  results: AnalyticSensitivityResult[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of results) {
    const cur = map.get(r.variable) ?? 0;
    const v = Math.abs(r.derivative);
    if (v > cur) map.set(r.variable, v);
  }
  return map;
}

/**
 * Top-N most influential parameters, sorted by |derivative|.
 */
export function topInfluentialAnalytic(
  network: BayesianNetwork,
  queryVariable: string,
  queryOutcome: string,
  topN = 10,
  evidence?: Evidence,
): AnalyticSensitivityResult[] {
  const all = analyticSensitivity(network, queryVariable, queryOutcome, evidence);
  all.sort((a, b) => Math.abs(b.derivative) - Math.abs(a.derivative));
  return all.slice(0, topN);
}
