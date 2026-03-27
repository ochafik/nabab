/**
 * Tests for WorkerInferenceEngine.
 *
 * Verifies that:
 * 1. Inference with no evidence matches the non-worker CachedInferenceEngine.
 * 2. Inference with evidence matches.
 * 3. Concurrent queries produce correct results.
 * 4. The engine terminates cleanly.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { BayesianNetwork } from '../src/lib/network.js';
import { CachedInferenceEngine } from '../src/lib/cached-inference.js';
import { WorkerInferenceEngine } from '../src/lib/worker-inference.js';
import type { WorkerInferenceResult } from '../src/lib/worker-inference.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const dogProblemXml = readFileSync(
  resolve(__dirname, '../src/example.xmlbif'),
  'utf-8',
);

/** Get a reference result from the synchronous CachedInferenceEngine, keyed by variable name. */
function referenceInfer(
  xmlbif: string,
  evidence?: Map<string, string>,
  likelihoodEvidence?: Map<string, Map<string, number>>,
): Map<string, Map<string, number>> {
  const network = BayesianNetwork.fromXmlBif(xmlbif);
  const engine = new CachedInferenceEngine(network);
  const result = engine.infer(evidence, likelihoodEvidence);
  const posteriors = new Map<string, Map<string, number>>();
  for (const [variable, dist] of result.posteriors) {
    posteriors.set(variable.name, dist);
  }
  return posteriors;
}

function assertPosteriorsMatch(
  actual: Map<string, Map<string, number>>,
  expected: Map<string, Map<string, number>>,
  tolerance = 6,
) {
  expect(actual.size).toBe(expected.size);
  for (const [varName, expectedDist] of expected) {
    const actualDist = actual.get(varName);
    expect(actualDist, `Missing variable ${varName} in actual posteriors`).toBeDefined();
    for (const [outcome, expectedProb] of expectedDist!) {
      const actualProb = actualDist!.get(outcome);
      expect(actualProb, `Missing outcome ${outcome} for ${varName}`).toBeDefined();
      expect(actualProb).toBeCloseTo(expectedProb, tolerance);
    }
  }
}

describe('WorkerInferenceEngine', () => {
  let engine: WorkerInferenceEngine | null = null;

  afterEach(() => {
    if (engine) {
      engine.terminate();
      engine = null;
    }
  });

  it('runs inference with no evidence and matches reference', async () => {
    engine = new WorkerInferenceEngine(dogProblemXml);
    const result = await engine.infer();
    const expected = referenceInfer(dogProblemXml);
    assertPosteriorsMatch(result.posteriors, expected);
  });

  it('runs inference with hard evidence and matches reference', async () => {
    engine = new WorkerInferenceEngine(dogProblemXml);
    const evidence = new Map([['hear-bark', 'true']]);
    const result = await engine.infer(evidence);
    const expected = referenceInfer(dogProblemXml, evidence);
    assertPosteriorsMatch(result.posteriors, expected);
  });

  it('runs inference with multiple evidence variables', async () => {
    engine = new WorkerInferenceEngine(dogProblemXml);
    const evidence = new Map([['hear-bark', 'true'], ['light-on', 'true']]);
    const result = await engine.infer(evidence);
    const expected = referenceInfer(dogProblemXml, evidence);
    assertPosteriorsMatch(result.posteriors, expected);
  });

  it('runs inference with likelihood evidence', async () => {
    engine = new WorkerInferenceEngine(dogProblemXml);
    const likelihoodEvidence = new Map([
      ['hear-bark', new Map([['true', 0.8], ['false', 0.2]])],
    ]);
    const result = await engine.infer(undefined, likelihoodEvidence);
    const expected = referenceInfer(dogProblemXml, undefined, likelihoodEvidence);
    assertPosteriorsMatch(result.posteriors, expected);
  });

  it('handles concurrent queries correctly', async () => {
    engine = new WorkerInferenceEngine(dogProblemXml);

    const evidenceSets: Array<Map<string, string> | undefined> = [
      undefined,
      new Map([['hear-bark', 'true']]),
      new Map([['dog-out', 'false']]),
      new Map([['family-out', 'true']]),
      new Map([['hear-bark', 'true'], ['light-on', 'true']]),
    ];

    // Launch all queries concurrently
    const promises = evidenceSets.map(ev => engine!.infer(ev));
    const results = await Promise.all(promises);

    // Verify each result matches reference
    for (let i = 0; i < evidenceSets.length; i++) {
      const expected = referenceInfer(dogProblemXml, evidenceSets[i]);
      assertPosteriorsMatch(results[i].posteriors, expected);
    }
  });

  it('terminates cleanly', async () => {
    engine = new WorkerInferenceEngine(dogProblemXml);

    // Run one query to ensure the worker is alive
    const result = await engine.infer();
    expect(result.posteriors.size).toBeGreaterThan(0);

    // Terminate
    engine.terminate();

    // Subsequent queries should reject
    await expect(engine.infer()).rejects.toThrow('terminated');

    // Prevent afterEach from double-terminating
    engine = null;
  });

  it('rejects pending queries when terminated', async () => {
    engine = new WorkerInferenceEngine(dogProblemXml);

    // Wait for init to finish so the worker is ready
    await engine.infer();

    // Launch a query but terminate before it resolves
    const promise = engine.infer(new Map([['hear-bark', 'true']]));

    // Small delay then terminate
    engine.terminate();

    // The pending query should have been rejected or resolved already
    // If it resolved before terminate, that's fine; if not, it should reject
    try {
      await promise;
      // If it resolved, that's OK (it was fast enough)
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toMatch(/terminat/i);
    }

    engine = null;
  });
});
