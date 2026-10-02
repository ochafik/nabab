/**
 * Pure helpers for the what-if hover preview: cache keys, an LRU cache, the
 * delta / total-variation computation between two sets of posteriors, and
 * display formatting. No DOM and no shared viewer state.
 */
import type { Evidence, LikelihoodEvidence, Distribution } from '../lib/types.js';

export type PosteriorsByName = Map<string, Distribution>;

/** Canonical, order-independent key for a (hard, likelihood) evidence pair. */
export function evidenceKey(he?: Evidence, se?: LikelihoodEvidence): string {
  const hard = [...(he ?? [])].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`).join(',');
  const soft = [...(se ?? [])].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, w]) => `${k}:` + [...w].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([o, x]) => `${o}~${Number(x.toPrecision(6))}`).join('/')).join(',');
  return `h[${hard}]s[${soft}]`;
}

/** Key for a preview result: the evidence it was computed under, in a given engine context. */
export function previewKey(context: string, he?: Evidence, se?: LikelihoodEvidence): string {
  return `${context}|${evidenceKey(he, se)}`;
}

/** Minimal LRU cache (Map insertion order). */
export class LruCache<K, V> {
  private map = new Map<K, V>();
  constructor(private readonly capacity: number) {}
  get size(): number { return this.map.size; }
  has(key: K): boolean { return this.map.has(key); }
  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined;
    const v = this.map.get(key)!;
    this.map.delete(key);
    this.map.set(key, v);
    return v;
  }
  set(key: K, value: V): void {
    this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.capacity) this.map.delete(this.map.keys().next().value as K);
  }
  clear(): void { this.map.clear(); }
}

export interface NodeDelta {
  name: string;
  /** Total variation distance between before and after: 0.5 * sum |Δ|. */
  tvd: number;
  /** Signed change per outcome (after - before). */
  deltas: Map<string, number>;
  /** Outcome with the largest absolute change. */
  maxOutcome: string;
  maxDelta: number;
}

/** Total variation distance between two distributions over the same outcomes. */
export function totalVariation(before: Distribution, after: Distribution): number {
  let s = 0;
  for (const [o, p] of before) s += Math.abs((after.get(o) ?? 0) - p);
  for (const [o, q] of after) if (!before.has(o)) s += Math.abs(q);
  return s / 2;
}

/** Change threshold below which a node counts as unaffected (d-separated or negligible). */
export const CALM_TVD = 0.005;

/**
 * Compare two sets of posteriors. Variables in `skip` (observed, or the
 * hovered node itself) and variables missing on either side are omitted.
 */
export function computeDeltas(before: PosteriorsByName, after: PosteriorsByName, skip?: ReadonlySet<string>): Map<string, NodeDelta> {
  const out = new Map<string, NodeDelta>();
  for (const [name, b] of before) {
    if (skip?.has(name)) continue;
    const a = after.get(name);
    if (!a) continue;
    const deltas = new Map<string, number>();
    let maxOutcome = '';
    let maxDelta = 0;
    for (const [o, p] of b) {
      const d = (a.get(o) ?? 0) - p;
      deltas.set(o, d);
      if (Math.abs(d) > Math.abs(maxDelta)) { maxDelta = d; maxOutcome = o; }
    }
    out.set(name, { name, tvd: totalVariation(b, a), deltas, maxOutcome, maxDelta });
  }
  return out;
}

/** Map a TVD to a 0..1 emphasis (perceptual: small shifts still visible, 25% saturates). */
export function haloStrength(tvd: number): number {
  if (!(tvd > CALM_TVD)) return 0;
  return Math.min(1, Math.sqrt(tvd / 0.25));
}

/** "+12%" / "-3%" / "<1%" style signed delta. */
export function formatDelta(d: number): string {
  const pct = d * 100;
  if (Math.abs(pct) < 0.5) return pct >= 0 ? '+<1%' : '-<1%';
  return `${pct > 0 ? '+' : '-'}${Math.round(Math.abs(pct))}%`;
}

/** Probability of evidence, compact: 0.42, 3.2e-4. */
export function formatProbabilityOfEvidence(p: number): string {
  if (!Number.isFinite(p)) return 'n/a';
  if (p === 0) return '0';
  if (p >= 0.01) return p.toFixed(p >= 0.1 ? 2 : 3);
  return p.toExponential(1);
}

/** Nearest already-computed snap index to `wanted`, or -1 if none. */
export function nearestAvailable(wanted: number, available: Iterable<number>): number {
  let best = -1;
  for (const i of available) if (best < 0 || Math.abs(i - wanted) < Math.abs(best - wanted)) best = i;
  return best;
}

/** Order in which to precompute the snaps of a hovered outcome: the target first, then outwards. */
export function snapPriority(wanted: number, count: number): number[] {
  return [...Array(count).keys()].sort((a, b) => Math.abs(a - wanted) - Math.abs(b - wanted) || a - b);
}

/**
 * Which top corner of the viewport the floating hint sits in: the one on the
 * opposite side of the pointer, with hysteresis (40%..60%) so it does not
 * flip back and forth while the pointer hovers near the middle.
 */
export function hintSide(pointerX: number, viewportW: number, prev: 'left' | 'right' | null): 'left' | 'right' {
  const f = viewportW > 0 ? pointerX / viewportW : 0.5;
  if (prev === 'right' && f < 0.6) return 'right'; // pointer still on the left-ish side
  if (prev === 'left' && f > 0.4) return 'left';
  return f < 0.5 ? 'right' : 'left';
}
