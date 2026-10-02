import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { BayesianNetwork } from '../src/lib/network.js';
import { CachedInferenceEngine } from '../src/lib/cached-inference.js';
import { workCounters, resetWorkCounters, readWorkCounters } from '../src/lib/work-counters.js';

const net = () => BayesianNetwork.parse(readFileSync('bench/models/asia.bif', 'utf-8'));

describe('work counters (perf gate instrumentation)', () => {
  it('count nothing unless enabled', () => {
    resetWorkCounters();
    new CachedInferenceEngine(net()).infer();
    expect(readWorkCounters()).toEqual({ messages: 0, entries: 0 });
  });

  it('are deterministic and nonzero when enabled', () => {
    const run = () => {
      workCounters.enabled = true;
      try {
        resetWorkCounters();
        const engine = new CachedInferenceEngine(net());
        engine.infer();
        const priors = readWorkCounters();
        resetWorkCounters();
        engine.infer(new Map([['dysp', 'yes']]));
        return { priors, evidence: readWorkCounters() };
      } finally {
        workCounters.enabled = false;
      }
    };
    const a = run();
    expect(a.priors.messages).toBeGreaterThan(0);
    expect(a.evidence.entries).toBeGreaterThan(0);
    expect(run()).toEqual(a);
  });
});
