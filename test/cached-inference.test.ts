/**
 * Tests for CachedInferenceEngine.
 *
 * Verifies that:
 * 1. Cached results match non-cached results exactly.
 * 2. The second call is faster than the first (junction tree reused).
 * 3. Multiple evidence scenarios on the same cached engine produce correct results.
 * 4. Likelihood evidence works identically to non-cached.
 */
import { describe, it, expect } from 'vitest';
import { BayesianNetwork } from '../src/lib/network.js';
import { CachedInferenceEngine } from '../src/lib/cached-inference.js';
import type { Variable, CPT } from '../src/lib/types.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const dogProblemXml = readFileSync(
  resolve(__dirname, '../src/example.xmlbif'),
  'utf-8',
);

function loadNet() {
  return BayesianNetwork.fromXmlBif(dogProblemXml);
}

/**
 * Compare two posterior Maps for approximate equality.
 */
function assertPosteriorsMatch(
  actual: Map<Variable, Map<string, number>>,
  expected: Map<Variable, Map<string, number>>,
  tolerance = 10, // decimal places for toBeCloseTo
) {
  expect(actual.size).toBe(expected.size);
  for (const [v, expectedDist] of expected) {
    const actualDist = actual.get(v);
    expect(actualDist, `Missing variable ${v.name} in actual posteriors`).toBeDefined();
    for (const [outcome, expectedProb] of expectedDist!) {
      const actualProb = actualDist!.get(outcome);
      expect(actualProb, `Missing outcome ${outcome} for ${v.name}`).toBeDefined();
      expect(actualProb).toBeCloseTo(expectedProb, tolerance);
    }
  }
}

describe('CachedInferenceEngine', () => {
  describe('produces identical results to non-cached inference', () => {
    it('priors (no evidence)', () => {
      const net = loadNet();
      const cached = new CachedInferenceEngine(net);

      const expected = net.infer();
      const actual = cached.infer();

      assertPosteriorsMatch(actual.posteriors, expected.posteriors);
    });

    it('hard evidence: hear-bark=true', () => {
      const net = loadNet();
      const cached = new CachedInferenceEngine(net);
      const evidence = new Map([['hear-bark', 'true']]);

      const expected = net.infer(evidence);
      const actual = cached.infer(evidence);

      assertPosteriorsMatch(actual.posteriors, expected.posteriors);
    });

    it('hard evidence: dog-out=false', () => {
      const net = loadNet();
      const cached = new CachedInferenceEngine(net);
      const evidence = new Map([['dog-out', 'false']]);

      const expected = net.infer(evidence);
      const actual = cached.infer(evidence);

      assertPosteriorsMatch(actual.posteriors, expected.posteriors);
    });

    it('hard evidence: family-out=true', () => {
      const net = loadNet();
      const cached = new CachedInferenceEngine(net);
      const evidence = new Map([['family-out', 'true']]);

      const expected = net.infer(evidence);
      const actual = cached.infer(evidence);

      assertPosteriorsMatch(actual.posteriors, expected.posteriors);
    });

    it('multiple evidence variables', () => {
      const net = loadNet();
      const cached = new CachedInferenceEngine(net);
      const evidence = new Map([['hear-bark', 'true'], ['light-on', 'true']]);

      const expected = net.infer(evidence);
      const actual = cached.infer(evidence);

      assertPosteriorsMatch(actual.posteriors, expected.posteriors);
    });

    it('likelihood evidence', () => {
      const net = loadNet();
      const cached = new CachedInferenceEngine(net);
      const likelihoodEvidence = new Map([
        ['hear-bark', new Map([['true', 0.8], ['false', 0.2]])],
      ]);

      const expected = net.infer(undefined, likelihoodEvidence);
      const actual = cached.infer(undefined, likelihoodEvidence);

      assertPosteriorsMatch(actual.posteriors, expected.posteriors);
    });

    it('combined hard and likelihood evidence', () => {
      const net = loadNet();
      const cached = new CachedInferenceEngine(net);
      const evidence = new Map([['family-out', 'true']]);
      const likelihoodEvidence = new Map([
        ['hear-bark', new Map([['true', 0.7], ['false', 0.3]])],
      ]);

      const expected = net.infer(evidence, likelihoodEvidence);
      const actual = cached.infer(evidence, likelihoodEvidence);

      assertPosteriorsMatch(actual.posteriors, expected.posteriors);
    });
  });

  describe('caching behavior', () => {
    it('second call is faster than the first (junction tree reused)', () => {
      const net = loadNet();
      const cached = new CachedInferenceEngine(net);
      const evidence = new Map([['hear-bark', 'true']]);

      // Use many iterations to smooth out timing noise on a small network
      const iterations = 500;

      // Baseline: BayesianNetwork.infer() rebuilds the junction tree every call
      // Warm up the JIT first
      for (let i = 0; i < 20; i++) net.infer(evidence);

      const start1 = performance.now();
      for (let i = 0; i < iterations; i++) {
        net.infer(evidence);
      }
      const uncachedTime = performance.now() - start1;

      // Cached: warm up the cache, then time repeated calls
      cached.infer(evidence);
      // Also warm up the JIT for the cached path
      for (let i = 0; i < 20; i++) cached.infer(evidence);

      const start2 = performance.now();
      for (let i = 0; i < iterations; i++) {
        cached.infer(evidence);
      }
      const cachedTime = performance.now() - start2;

      // The cached version should be measurably faster since it skips
      // moralize + triangulate + findMaximalCliques + MST construction.
      // Use a generous threshold to avoid flakiness on CI.
      expect(cachedTime).toBeLessThan(uncachedTime * 0.95);
    });
  });

  describe('multiple evidence scenarios on same engine', () => {
    it('produces correct results for different evidence sets', () => {
      const net = loadNet();
      const cached = new CachedInferenceEngine(net);

      // Scenario 1: no evidence
      const result1 = cached.infer();
      const expected1 = net.infer();
      assertPosteriorsMatch(result1.posteriors, expected1.posteriors);

      // Scenario 2: hear-bark=true
      const evidence2 = new Map([['hear-bark', 'true']]);
      const result2 = cached.infer(evidence2);
      const expected2 = net.infer(evidence2);
      assertPosteriorsMatch(result2.posteriors, expected2.posteriors);

      // Scenario 3: dog-out=false
      const evidence3 = new Map([['dog-out', 'false']]);
      const result3 = cached.infer(evidence3);
      const expected3 = net.infer(evidence3);
      assertPosteriorsMatch(result3.posteriors, expected3.posteriors);

      // Scenario 4: family-out=true
      const evidence4 = new Map([['family-out', 'true']]);
      const result4 = cached.infer(evidence4);
      const expected4 = net.infer(evidence4);
      assertPosteriorsMatch(result4.posteriors, expected4.posteriors);

      // Scenario 5: back to no evidence (verifies cache is not corrupted)
      const result5 = cached.infer();
      assertPosteriorsMatch(result5.posteriors, expected1.posteriors);

      // Scenario 6: multiple evidence
      const evidence6 = new Map([['hear-bark', 'false'], ['bowel-problem', 'true']]);
      const result6 = cached.infer(evidence6);
      const expected6 = net.infer(evidence6);
      assertPosteriorsMatch(result6.posteriors, expected6.posteriors);
    });
  });

  describe('simple network correctness', () => {
    it('matches non-cached for a simple 2-node network', () => {
      const Rain: Variable = { name: 'Rain', outcomes: ['T', 'F'] };
      const Wet: Variable = { name: 'Wet', outcomes: ['T', 'F'] };

      const net = new BayesianNetwork({
        name: 'Test',
        variables: [Rain, Wet],
        cpts: [
          { variable: Rain, parents: [], table: new Float64Array([0.2, 0.8]) },
          { variable: Wet, parents: [Rain], table: new Float64Array([0.9, 0.1, 0.1, 0.9]) },
        ],
      });

      const cached = new CachedInferenceEngine(net);

      // Priors
      const priors = cached.infer();
      expect(priors.posteriors.get(Rain)!.get('T')).toBeCloseTo(0.2);
      expect(priors.posteriors.get(Wet)!.get('T')).toBeCloseTo(0.26);

      // With evidence
      const evidence = new Map([['Wet', 'T']]);
      const posterior = cached.infer(evidence);
      const expectedPosterior = net.infer(evidence);
      assertPosteriorsMatch(posterior.posteriors, expectedPosterior.posteriors);
    });

    it('matches non-cached for a v-structure', () => {
      const A: Variable = { name: 'A', outcomes: ['T', 'F'] };
      const B: Variable = { name: 'B', outcomes: ['T', 'F'] };
      const C: Variable = { name: 'C', outcomes: ['T', 'F'] };

      const net = new BayesianNetwork({
        name: 'VStructure',
        variables: [A, B, C],
        cpts: [
          { variable: A, parents: [], table: new Float64Array([0.5, 0.5]) },
          { variable: B, parents: [], table: new Float64Array([0.5, 0.5]) },
          {
            variable: C,
            parents: [A, B],
            table: new Float64Array([1.0, 0.0, 0.5, 0.5, 0.5, 0.5, 0.0, 1.0]),
          },
        ],
      });

      const cached = new CachedInferenceEngine(net);

      // Prior
      const prior = cached.infer();
      const expectedPrior = net.infer();
      assertPosteriorsMatch(prior.posteriors, expectedPrior.posteriors);

      // Evidence: C=T
      const evidence = new Map([['C', 'T']]);
      const posterior = cached.infer(evidence);
      const expectedPosterior = net.infer(evidence);
      assertPosteriorsMatch(posterior.posteriors, expectedPosterior.posteriors);
    });
  });

  describe('cache does not corrupt base potentials', () => {
    it('evidence from one call does not leak into the next', () => {
      const net = loadNet();
      const cached = new CachedInferenceEngine(net);

      // Call with heavy evidence
      cached.infer(new Map([['hear-bark', 'true'], ['dog-out', 'true'], ['family-out', 'false']]));

      // Call without evidence should still give priors
      const priors = cached.infer();
      const expectedPriors = net.infer();
      assertPosteriorsMatch(priors.posteriors, expectedPriors.posteriors);
    });
  });
});
