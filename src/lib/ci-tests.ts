/**
 * Native conditional independence tests for discrete/categorical data.
 * Dependency-free: implements chi-squared CDF via regularized incomplete gamma.
 */
import type { DataColumn } from './structure-learning.js';

export interface CITestResult { statistic: number; pValue: number; df: number }

// ---- Chi-squared CDF via regularized incomplete gamma ----
function lnGamma(x: number): number {
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  x -= 1;
  let a = c[0];
  for (let i = 1; i < 9; i++) a += c[i] / (x + i);
  const t = x + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

function gammainc(a: number, x: number): number {
  if (x <= 0) return 0;
  if (x > a + 200) return 1;
  let sum = 1, term = 1;
  for (let n = 1; n < 300; n++) {
    term *= x / (a + n); sum += term;
    if (Math.abs(term) < 1e-14 * Math.abs(sum)) break;
  }
  return Math.exp(a * Math.log(x) - x - lnGamma(a + 1)) * sum;
}

function chi2pval(x: number, df: number): number {
  return (df <= 0 || x <= 0) ? 1 : 1 - gammainc(df / 2, x / 2);
}

// ---- Contingency tables ----
interface CT { counts: Map<string, number>; xL: string[]; yL: string[]; total: number }

function buildCTs(data: DataColumn[], x: string, y: string, given: string[]): CT[] {
  const col = new Map<string, DataColumn>();
  for (const c of data) col.set(c.name, c);
  const xC = col.get(x)!, yC = col.get(y)!, gC = given.map(g => col.get(g)!);
  const groups = new Map<string, number[]>();
  for (let i = 0; i < xC.values.length; i++) {
    const k = gC.map(c => c.values[i]).join('\x00');
    let a = groups.get(k); if (!a) { a = []; groups.set(k, a); } a.push(i);
  }
  const res: CT[] = [];
  for (const [, idx] of groups) {
    const xS = new Set<string>(), yS = new Set<string>(), counts = new Map<string, number>();
    for (const i of idx) {
      xS.add(xC.values[i]); yS.add(yC.values[i]);
      const k = xC.values[i] + '\x00' + yC.values[i];
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    res.push({ counts, xL: [...xS].sort(), yL: [...yS].sort(), total: idx.length });
  }
  return res;
}

function margins(ct: CT) {
  const xM = new Map<string, number>(), yM = new Map<string, number>();
  for (const xv of ct.xL) { xM.set(xv, 0); }
  for (const yv of ct.yL) { yM.set(yv, 0); }
  for (const xv of ct.xL) for (const yv of ct.yL) {
    const o = ct.counts.get(xv + '\x00' + yv) ?? 0;
    xM.set(xv, xM.get(xv)! + o); yM.set(yv, yM.get(yv)! + o);
  }
  return { xM, yM };
}

/** Chi-squared test for conditional independence. */
export function chiSquaredTest(data: DataColumn[], x: string, y: string, given: string[]): CITestResult {
  let stat = 0, df = 0;
  for (const ct of buildCTs(data, x, y, given)) {
    if (!ct.total) continue;
    const { xM, yM } = margins(ct);
    for (const xv of ct.xL) for (const yv of ct.yL) {
      const o = ct.counts.get(xv + '\x00' + yv) ?? 0;
      const e = (xM.get(xv)! * yM.get(yv)!) / ct.total;
      if (e > 0) stat += ((o - e) ** 2) / e;
    }
    df += (ct.xL.length - 1) * (ct.yL.length - 1);
  }
  return { statistic: stat, pValue: chi2pval(stat, df), df };
}

/** G-test (log-likelihood ratio) for conditional independence. */
export function gSquaredTest(data: DataColumn[], x: string, y: string, given: string[]): CITestResult {
  let stat = 0, df = 0;
  for (const ct of buildCTs(data, x, y, given)) {
    if (!ct.total) continue;
    const { xM, yM } = margins(ct);
    for (const xv of ct.xL) for (const yv of ct.yL) {
      const o = ct.counts.get(xv + '\x00' + yv) ?? 0;
      const e = (xM.get(xv)! * yM.get(yv)!) / ct.total;
      if (o > 0 && e > 0) stat += 2 * o * Math.log(o / e);
    }
    df += (ct.xL.length - 1) * (ct.yL.length - 1);
  }
  return { statistic: stat, pValue: chi2pval(stat, df), df };
}

/** Mutual information between two variables (optionally conditional). */
export function mutualInformation(data: DataColumn[], x: string, y: string, given?: string[]): number {
  const cts = buildCTs(data, x, y, given ?? []);
  const N = data[0].values.length;
  let mi = 0;
  for (const ct of cts) {
    if (!ct.total) continue;
    const w = ct.total / N, { xM, yM } = margins(ct);
    for (const xv of ct.xL) for (const yv of ct.yL) {
      const o = ct.counts.get(xv + '\x00' + yv) ?? 0;
      if (!o) continue;
      const px = xM.get(xv)! / ct.total, py = yM.get(yv)! / ct.total;
      if (px > 0 && py > 0) mi += w * (o / ct.total) * Math.log((o / ct.total) / (px * py));
    }
  }
  return mi;
}
