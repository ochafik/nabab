/**
 * Background computation + cache of what-if preview posteriors.
 *
 * Jobs are processed one per macrotask (so pointer events stay responsive),
 * can be re-prioritised or dropped when the pointer moves on, are
 * de-duplicated by evidence key, and every finished result is cached (even if
 * it was no longer wanted when it finished). The inference function is
 * injected: the viewer passes a main-thread engine for small networks and a
 * Web Worker engine for slow ones.
 */
import type { Evidence, LikelihoodEvidence } from '../lib/types.js';
import { LruCache, type PosteriorsByName } from './preview-logic.js';

export type InferFn = (he?: Evidence, se?: LikelihoodEvidence) => Promise<PosteriorsByName>;

export interface PreviewJob {
  key: string;
  he?: Evidence;
  se?: LikelihoodEvidence;
}

/** Cached outcome: posteriors, or null when the evidence is impossible / inference failed. */
export type PreviewResult = PosteriorsByName | null;

/** Yield to the event loop between jobs. MessageChannel avoids setTimeout's 4 ms clamp and background-tab throttling. */
const defaultYield = (): Promise<void> => {
  if (typeof MessageChannel === 'undefined') return new Promise(resolve => setTimeout(resolve, 0));
  return new Promise(resolve => {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => { ch.port1.close(); resolve(); };
    ch.port2.postMessage(null);
  });
};

export class PreviewComputer {
  private cache: LruCache<string, PreviewResult>;
  private queue: PreviewJob[] = [];
  private inflight = new Set<string>();
  private running = false;
  /** Exponential moving average of inference latency in ms. */
  avgMs = 0;
  /** Number of inferences actually executed (for tests / diagnostics). */
  executed = 0;

  constructor(
    private infer: InferFn,
    private onReady: (key: string) => void = () => {},
    capacity = 300,
    private yieldFn: () => Promise<void> = defaultYield,
    private now: () => number = () => performance.now(),
  ) {
    this.cache = new LruCache(capacity);
  }

  has(key: string): boolean { return this.cache.has(key); }
  get(key: string): PreviewResult | undefined { return this.cache.get(key); }
  isPending(key: string): boolean { return this.inflight.has(key) || this.queue.some(j => j.key === key); }

  /** Replace the queue (cancelling stale work). Earlier jobs have priority. */
  request(jobs: PreviewJob[]): void {
    const seen = new Set<string>();
    this.queue = jobs.filter(j => {
      if (seen.has(j.key) || this.cache.has(j.key) || this.inflight.has(j.key)) return false;
      seen.add(j.key);
      return true;
    });
    void this.pump();
  }

  /** Drop all queued work (an in-flight job still finishes and is cached). */
  cancel(): void {
    this.queue = [];
  }

  private async pump(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length > 0) {
        const job = this.queue.shift()!;
        if (this.cache.has(job.key) || this.inflight.has(job.key)) continue;
        this.inflight.add(job.key);
        const t0 = this.now();
        let result: PreviewResult;
        try {
          result = await this.infer(job.he, job.se);
        } catch {
          result = null;
        }
        const dt = this.now() - t0;
        this.avgMs = this.executed === 0 ? dt : this.avgMs * 0.7 + dt * 0.3;
        this.executed++;
        this.inflight.delete(job.key);
        this.cache.set(job.key, result);
        this.onReady(job.key);
        await this.yieldFn();
      }
    } finally {
      this.running = false;
    }
  }
}
