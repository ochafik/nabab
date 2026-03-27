/**
 * Native conditional independence tests for discrete/categorical data.
 * Dependency-free: implements chi-squared CDF via regularized incomplete gamma.
 */
import type { DataColumn } from './structure-learning.js';

/** Result of a conditional independence test. */
export interface CITestResult {
  statistic: number;
  pValue: number;
  df: number;
}

// ---- Chi-squared CDF via regularized incomplete gamma function ----

/** ln(Gamma(x)) using Stirling's approximation with Lanczos coefficients. */
function lnGamma(x: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  }
  x -= 1;
  let a = c[0];
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  const t = x + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Lower regularized incomplete gamma function P(a, x) via series expansion. */
function gammainc(a: number, x: number): number {
  if (x <= 0) return 0;
  if (x > a + 200) return 1; // asymptotic
  // Series expansion: P(a,x) = e^{-x} x^a sum_{n=0}^inf x^n / Gamma(a+n+1)
  const lna = a * Math.log(x) - x - lnGamma(a + 1);
  let sum = 1;
  let term = 1;
  for (let n = 1; n < 300; n++) {
    term *= x / (a + n);
    sum += term;
    if (Math.abs(term) < 1e-14 * Math.abs(sum)) break;
  }
  return Math.exp(lna) * sum;
}

/** P-value from chi-squared distribution: P(X > x) = 1 - P(df/2, x/2). */
function chiSquaredPValue(x: number, df: number): number {
  if (df <= 0 || x <= 0) return 1;
  return 1 - gammainc(df / 2, x / 2);
}

// ---- Contingency table building ----

interface ContingencyResult {
  counts: Map<string, number>;
  xLevels: string[];
  yLevels: string[];
  condKey: string;
  total: number;
}

function buildContingencyTables(
  data: DataColumn[],
  x: string,
  y: string,
  given: string[],
): ContingencyResult[] {
  const colMap = new Map<string, DataColumn>();
  for (const col of data) colMap.set(col.name, col);

  const xCol = colMap.get(x)!;
  const yCol = colMap.get(y)!;
  const givenCols = given.map(g => colMap.get(g)!);
  const n = xCol.values.length;

  // Group by conditioning set values
  const groups = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const key = givenCols.map(c => c.values[i]).join('\x00');
    let arr = groups.get(key);
    if (!arr) { arr = []; groups.set(key, arr); }
    arr.push(i);
  }

  const results: ContingencyResult[] = [];
  for (const [condKey, indices] of groups) {
    const xSet = new Set<string>();
    const ySet = new Set<string>();
    const counts = new Map<string, number>();

    for (const i of indices) {
      const xv = xCol.values[i];
      const yv = yCol.values[i];
      xSet.add(xv);
      ySet.add(yv);
      const key = xv + '\x00' + yv;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    results.push({
      counts,
      xLevels: [...xSet].sort(),
      yLevels: [...ySet].sort(),
      condKey,
      total: indices.length,
    });
  }

  return results;
}

/**
 * Chi-squared test for conditional independence of discrete variables.
 * Returns p-value. Variables are independent if p-value > alpha.
 */
export function chiSquaredTest(
  data: DataColumn[],
  x: string,
  y: string,
  given: string[],
): CITestResult {
  const tables = buildContingencyTables(data, x, y, given);
  let statistic = 0;
  let df = 0;

  for (const t of tables) {
    const { counts, xLevels, yLevels, total } = t;
    if (total === 0) continue;

    const xMargin = new Map<string, number>();
    const yMargin = new Map<string, number>();
    for (const xv of xLevels) xMargin.set(xv, 0);
    for (const yv of yLevels) yMargin.set(yv, 0);

    for (const xv of xLevels) {
      for (const yv of yLevels) {
        const obs = counts.get(xv + '\x00' + yv) ?? 0;
        xMargin.set(xv, xMargin.get(xv)! + obs);
        yMargin.set(yv, yMargin.get(yv)! + obs);
      }
    }

    for (const xv of xLevels) {
      for (const yv of yLevels) {
        const obs = counts.get(xv + '\x00' + yv) ?? 0;
        const exp = (xMargin.get(xv)! * yMargin.get(yv)!) / total;
        if (exp > 0) statistic += ((obs - exp) ** 2) / exp;
      }
    }

    df += (xLevels.length - 1) * (yLevels.length - 1);
  }

  const pValue = chiSquaredPValue(statistic, df);
  return { statistic, pValue, df };
}

/**
 * G-test (log-likelihood ratio test) for conditional independence.
 */
export function gSquaredTest(
  data: DataColumn[],
  x: string,
  y: string,
  given: string[],
): CITestResult {
  const tables = buildContingencyTables(data, x, y, given);
  let statistic = 0;
  let df = 0;

  for (const t of tables) {
    const { counts, xLevels, yLevels, total } = t;
    if (total === 0) continue;

    const xMargin = new Map<string, number>();
    const yMargin = new Map<string, number>();
    for (const xv of xLevels) xMargin.set(xv, 0);
    for (const yv of yLevels) yMargin.set(yv, 0);

    for (const xv of xLevels) {
      for (const yv of yLevels) {
        const obs = counts.get(xv + '\x00' + yv) ?? 0;
        xMargin.set(xv, xMargin.get(xv)! + obs);
        yMargin.set(yv, yMargin.get(yv)! + obs);
      }
    }

    for (const xv of xLevels) {
      for (const yv of yLevels) {
        const obs = counts.get(xv + '\x00' + yv) ?? 0;
        const exp = (xMargin.get(xv)! * yMargin.get(yv)!) / total;
        if (obs > 0 && exp > 0) statistic += 2 * obs * Math.log(obs / exp);
      }
    }

    df += (xLevels.length - 1) * (yLevels.length - 1);
  }

  const pValue = chiSquaredPValue(statistic, df);
  return { statistic, pValue, df };
}

/**
 * Mutual information between two variables (optionally conditional).
 */
export function mutualInformation(
  data: DataColumn[],
  x: string,
  y: string,
  given?: string[],
): number {
  const tables = buildContingencyTables(data, x, y, given ?? []);
  const totalAll = data[0].values.length;
  let mi = 0;

  for (const t of tables) {
    const { counts, xLevels, yLevels, total } = t;
    if (total === 0) continue;
    const weight = total / totalAll;

    const xMargin = new Map<string, number>();
    const yMargin = new Map<string, number>();
    for (const xv of xLevels) xMargin.set(xv, 0);
    for (const yv of yLevels) yMargin.set(yv, 0);

    for (const xv of xLevels) {
      for (const yv of yLevels) {
        const obs = counts.get(xv + '\x00' + yv) ?? 0;
        xMargin.set(xv, xMargin.get(xv)! + obs);
        yMargin.set(yv, yMargin.get(yv)! + obs);
      }
    }

    for (const xv of xLevels) {
      for (const yv of yLevels) {
        const obs = counts.get(xv + '\x00' + yv) ?? 0;
        if (obs === 0) continue;
        const pxy = obs / total;
        const px = xMargin.get(xv)! / total;
        const py = yMargin.get(yv)! / total;
        if (px > 0 && py > 0) mi += weight * pxy * Math.log(pxy / (px * py));
      }
    }
  }

  return mi;
}
