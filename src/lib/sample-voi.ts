/**
 * Sample-based value-of-information estimates.
 *
 * Exact VOI (see `voi.ts`) needs one inference run per (candidate, outcome).
 * Given a `SampleResult` (from `forwardSample` or `likelihoodWeighting`) the
 * same quantities can be estimated from weighted counts in O(n × candidates)
 * with no inference at all:
 *
 * - `sampledMutualInformation`: I(A; B₁..Bₘ) in bits — for a single target
 *   this is exactly VOI(A → target) = H(target) − E[H(target | A)].
 * - `sampledInformationGainRanking`: candidates ranked by I(candidate; targets).
 * - `sampledCriticality`: how much P(target = outcome) drops when a
 *   candidate takes its null outcome ("what kills the outcome if it doesn't
 *   happen").
 */
import type { Variable } from './types.js';
import { type SampleResult, sampleColumnIndex } from './sampling.js';

type VarRef = Variable | string;

/** Mixed-radix joint index of columns `cols` in sample `s`; null if it would overflow 2^53. */
function jointIndexer(result: SampleResult, cols: readonly number[]): ((s: number) => number) | null {
  let radix = 1;
  const strides: number[] = [];
  for (let i = cols.length - 1; i >= 0; i--) {
    strides[i] = radix;
    radix *= result.variables[cols[i]].outcomes.length;
    if (radix > Number.MAX_SAFE_INTEGER) return null;
  }
  return (s: number) => {
    let idx = 0;
    for (let i = 0; i < cols.length; i++) idx += result.columns[cols[i]][s] * strides[i];
    return idx;
  };
}

function jointKeyer(result: SampleResult, cols: readonly number[]): (s: number) => number | string {
  const numeric = jointIndexer(result, cols);
  if (numeric) return numeric;
  return (s: number) => cols.map(c => result.columns[c][s]).join(',');
}

function log2(x: number): number {
  return Math.log(x) / Math.LN2;
}

/**
 * Mutual information I(A; B) in bits, where B is the joint of `varsB`,
 * estimated from weighted sample counts. Returns 0 when the samples carry
 * no weight.
 */
export function sampledMutualInformation(
  result: SampleResult,
  varA: VarRef,
  varsB: readonly VarRef[],
): number {
  const total = result.totalWeight;
  if (total <= 0 || result.n === 0 || varsB.length === 0) return 0;
  const colA = sampleColumnIndex(result, varA);
  const colsB = varsB.map(v => sampleColumnIndex(result, v));
  const keyB = jointKeyer(result, colsB);
  const cardA = result.variables[colA].outcomes.length;

  const countsA = new Float64Array(cardA);
  const countsB = new Map<number | string, number>();
  const countsAB = new Map<number | string, Float64Array>();
  const colAData = result.columns[colA];
  const weights = result.weights;

  for (let s = 0; s < result.n; s++) {
    const w = weights[s];
    if (w === 0) continue;
    const a = colAData[s];
    const b = keyB(s);
    countsA[a] += w;
    countsB.set(b, (countsB.get(b) ?? 0) + w);
    let ab = countsAB.get(b);
    if (!ab) {
      ab = new Float64Array(cardA);
      countsAB.set(b, ab);
    }
    ab[a] += w;
  }

  let mi = 0;
  for (const [b, ab] of countsAB) {
    const pB = countsB.get(b)! / total;
    for (let a = 0; a < cardA; a++) {
      const pAB = ab[a] / total;
      if (pAB <= 0) continue;
      const pA = countsA[a] / total;
      mi += pAB * log2(pAB / (pA * pB));
    }
  }
  return Math.max(0, mi);
}

export interface InformationGainEntry {
  readonly variable: string;
  /** I(candidate; joint of targets) in bits. */
  readonly bits: number;
}

/**
 * Rank candidates by how much observing each would reduce uncertainty about
 * the joint of `targets` (sample-estimated mutual information, bits, descending).
 * Candidates that are themselves targets are skipped.
 */
export function sampledInformationGainRanking(
  result: SampleResult,
  candidates: readonly VarRef[],
  targets: readonly VarRef[],
): InformationGainEntry[] {
  const targetNames = new Set(targets.map(t => (typeof t === 'string' ? t : t.name)));
  const entries: InformationGainEntry[] = [];
  for (const c of candidates) {
    const name = typeof c === 'string' ? c : c.name;
    if (targetNames.has(name)) continue;
    entries.push({ variable: name, bits: sampledMutualInformation(result, c, targets) });
  }
  entries.sort((a, b) => b.bits - a.bits);
  return entries;
}

export interface CriticalityEntry {
  readonly variable: string;
  /** Null outcome used for this candidate. */
  readonly nullOutcome: string;
  /** P(target = targetOutcome) over all samples. */
  readonly pBase: number;
  /** P(target = targetOutcome | candidate = nullOutcome); NaN if never observed. */
  readonly pGivenNull: number;
  /** pBase − pGivenNull (positive ⇒ the candidate's null outcome hurts the target). */
  readonly drop: number;
}

/**
 * For each candidate, the drop in P(target = targetOutcome) when the
 * candidate takes its null outcome, estimated from the samples. Sorted by
 * descending drop. Candidates whose null outcome never occurs in the
 * samples get `drop = 0` and `pGivenNull = NaN`.
 */
export function sampledCriticality(
  result: SampleResult,
  candidates: readonly VarRef[],
  target: VarRef,
  targetOutcome: string,
  candidateNullOutcome?: (variable: Variable) => string,
): CriticalityEntry[] {
  const total = result.totalWeight;
  const colT = sampleColumnIndex(result, target);
  const tVar = result.variables[colT];
  const tIdx = tVar.outcomes.indexOf(targetOutcome);
  if (tIdx < 0) throw new Error(`"${targetOutcome}" is not an outcome of ${tVar.name}`);
  const tData = result.columns[colT];
  const weights = result.weights;

  let hit = 0;
  for (let s = 0; s < result.n; s++) if (tData[s] === tIdx) hit += weights[s];
  const pBase = total > 0 ? hit / total : 0;

  const entries: CriticalityEntry[] = [];
  for (const c of candidates) {
    const col = sampleColumnIndex(result, c);
    if (col === colT) continue;
    const v = result.variables[col];
    const nullOutcome = candidateNullOutcome ? candidateNullOutcome(v) : v.outcomes[0];
    const nullIdx = v.outcomes.indexOf(nullOutcome);
    if (nullIdx < 0) throw new Error(`"${nullOutcome}" is not an outcome of ${v.name}`);
    const data = result.columns[col];
    let wNull = 0, wNullHit = 0;
    for (let s = 0; s < result.n; s++) {
      if (data[s] !== nullIdx) continue;
      const w = weights[s];
      wNull += w;
      if (tData[s] === tIdx) wNullHit += w;
    }
    const pGivenNull = wNull > 0 ? wNullHit / wNull : NaN;
    entries.push({
      variable: v.name,
      nullOutcome,
      pBase,
      pGivenNull,
      drop: wNull > 0 ? pBase - pGivenNull : 0,
    });
  }
  entries.sort((a, b) => b.drop - a.drop);
  return entries;
}
