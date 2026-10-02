/**
 * Deterministic work counters for the performance regression gate
 * (see bench/perf). Disabled by default: each instrumented kernel pays one
 * boolean test per call (a call walks a whole table, so the cost is
 * unmeasurable), and nothing is counted unless `workCounters.enabled` is set.
 */
export const workCounters = {
  enabled: false,
  /** Junction-tree messages sent (`CalibratedTree._send`). */
  messages: 0,
  /** Table entries read by `sumInto` (clique-to-separator marginalisation, marginal reads). */
  sumEntries: 0,
  /** Table entries written by `multiplyInto` (message absorption, CPT products, likelihoods). */
  multiplyEntries: 0,
  /** Separator entries touched by the Hugin ratio loop. */
  ratioEntries: 0,
};

export function resetWorkCounters(): void {
  workCounters.messages = 0;
  workCounters.sumEntries = 0;
  workCounters.multiplyEntries = 0;
  workCounters.ratioEntries = 0;
}

/** Snapshot of the counts, plus their sum as a single "entries touched" figure. */
export function readWorkCounters(): { messages: number; entries: number } {
  const c = workCounters;
  return { messages: c.messages, entries: c.sumEntries + c.multiplyEntries + c.ratioEntries };
}
