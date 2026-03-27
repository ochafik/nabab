/**
 * Web Worker script for running Bayesian network inference off the main thread.
 *
 * Supports both browser Web Workers and Node.js worker_threads.
 * Uses CachedInferenceEngine internally for fast repeated queries.
 */
import { BayesianNetwork } from './network.js';
import { CachedInferenceEngine } from './cached-inference.js';
import type { Evidence, LikelihoodEvidence } from './types.js';

// ---- Message types ----

interface InitMessage {
  type: 'init';
  xmlbif: string;
}

interface InferMessage {
  type: 'infer';
  id: number;
  evidence?: Record<string, string>;
  likelihoodEvidence?: Record<string, Record<string, number>>;
}

type WorkerIncoming = InitMessage | InferMessage;

interface ResultMessage {
  type: 'result';
  id: number;
  posteriors: Record<string, Record<string, number>>;
}

interface ErrorMessage {
  type: 'error';
  id: number;
  message: string;
}

type WorkerOutgoing = ResultMessage | ErrorMessage;

// ---- Worker state ----

let engine: CachedInferenceEngine | null = null;

function handleMessage(data: WorkerIncoming): WorkerOutgoing | null {
  if (data.type === 'init') {
    try {
      const network = BayesianNetwork.fromXmlBif(data.xmlbif);
      engine = new CachedInferenceEngine(network);
      return null; // no response needed for init
    } catch (err: unknown) {
      return {
        type: 'error',
        id: -1,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  if (data.type === 'infer') {
    const id = data.id;
    try {
      if (!engine) {
        return { type: 'error', id, message: 'Worker not initialized. Send an init message first.' };
      }

      // Deserialize evidence from plain objects to Maps
      let evidence: Evidence | undefined;
      if (data.evidence) {
        evidence = new Map(Object.entries(data.evidence));
      }

      let likelihoodEvidence: LikelihoodEvidence | undefined;
      if (data.likelihoodEvidence) {
        likelihoodEvidence = new Map(
          Object.entries(data.likelihoodEvidence).map(
            ([k, v]) => [k, new Map(Object.entries(v))] as [string, Map<string, number>],
          ),
        );
      }

      const result = engine.infer(evidence, likelihoodEvidence);

      // Serialize posteriors from Maps to plain objects
      const posteriors: Record<string, Record<string, number>> = {};
      for (const [variable, dist] of result.posteriors) {
        const distObj: Record<string, number> = {};
        for (const [outcome, prob] of dist) {
          distObj[outcome] = prob;
        }
        posteriors[variable.name] = distObj;
      }

      return { type: 'result', id, posteriors };
    } catch (err: unknown) {
      return {
        type: 'error',
        id,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return null;
}

// ---- Detect environment and wire up messaging ----

function setupWorker(): void {
  // Node.js worker_threads
  if (typeof globalThis.process !== 'undefined' && globalThis.process.versions?.node) {
    // Dynamic import to avoid bundler issues in browser builds
    import('node:worker_threads').then(({ parentPort }) => {
      if (!parentPort) return;
      parentPort.on('message', (data: WorkerIncoming) => {
        const response = handleMessage(data);
        if (response) {
          parentPort.postMessage(response);
        }
      });
    });
    return;
  }

  // Browser Web Worker
  if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
    self.onmessage = (event: MessageEvent<WorkerIncoming>) => {
      const response = handleMessage(event.data);
      if (response) {
        self.postMessage(response);
      }
    };
  }
}

setupWorker();
