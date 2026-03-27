/**
 * Worker-based inference engine for Bayesian networks.
 *
 * Runs inference in a Web Worker (browser) or worker_threads (Node.js) to keep
 * the main thread responsive. Uses CachedInferenceEngine internally within the
 * worker for fast repeated queries.
 *
 * Falls back to synchronous inference on the main thread when workers are not
 * available.
 */
import type { Evidence, LikelihoodEvidence } from './types.js';
import { BayesianNetwork } from './network.js';
import { CachedInferenceEngine } from './cached-inference.js';

// ---- Worker message types (shared with inference-worker.ts) ----

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

type WorkerResponse = ResultMessage | ErrorMessage;

// ---- Pending request tracking ----

interface PendingRequest {
  resolve: (value: WorkerInferenceResult) => void;
  reject: (reason: Error) => void;
}

/** Simplified result returned by WorkerInferenceEngine (no Factor references since those cannot cross the worker boundary). */
export interface WorkerInferenceResult {
  /** Posterior distributions keyed by variable name -> outcome -> probability. */
  posteriors: Map<string, Map<string, number>>;
}

// ---- Helpers for serialization ----

function evidenceToObj(evidence?: Evidence): Record<string, string> | undefined {
  if (!evidence || evidence.size === 0) return undefined;
  return Object.fromEntries(evidence);
}

function likelihoodEvidenceToObj(
  likelihoodEvidence?: LikelihoodEvidence,
): Record<string, Record<string, number>> | undefined {
  if (!likelihoodEvidence || likelihoodEvidence.size === 0) return undefined;
  const result: Record<string, Record<string, number>> = {};
  for (const [k, v] of likelihoodEvidence) {
    result[k] = Object.fromEntries(v);
  }
  return result;
}

function deserializePosteriors(
  obj: Record<string, Record<string, number>>,
): Map<string, Map<string, number>> {
  const map = new Map<string, Map<string, number>>();
  for (const [varName, distObj] of Object.entries(obj)) {
    map.set(varName, new Map(Object.entries(distObj)));
  }
  return map;
}

// ---- Worker abstraction ----

interface WorkerLike {
  postMessage(data: unknown): void;
  on?(event: string, listener: (data: unknown) => void): void;
  addEventListener?(event: string, listener: (event: { data: unknown }) => void): void;
  terminate(): void | Promise<number>;
}

// ---- Main class ----

export class WorkerInferenceEngine {
  private _worker: WorkerLike | null = null;
  private _initPromise: Promise<void>;
  private _nextId = 0;
  private _pending = new Map<number, PendingRequest>();
  private _terminated = false;

  // Fallback state (when workers are unavailable)
  private _fallbackEngine: CachedInferenceEngine | null = null;
  private _fallbackNetwork: BayesianNetwork | null = null;
  private _useFallback = false;

  /**
   * Create a new WorkerInferenceEngine.
   *
   * @param networkXmlbif XMLBIF string defining the Bayesian network.
   */
  constructor(networkXmlbif: string) {
    this._initPromise = this._init(networkXmlbif);
  }

  private async _init(xmlbif: string): Promise<void> {
    try {
      const worker = await this._createWorker();
      this._worker = worker;

      // Wire up message handling
      if (worker.on) {
        // Node.js worker_threads
        worker.on('message', (data: unknown) => this._onMessage(data as WorkerResponse));
        worker.on('error', (err: unknown) => this._onError(err));
      } else if (worker.addEventListener) {
        // Browser Web Worker
        worker.addEventListener('message', (event: { data: unknown }) =>
          this._onMessage(event.data as WorkerResponse),
        );
        worker.addEventListener('error', (event: { data: unknown }) =>
          this._onError(event.data),
        );
      }

      // Send init message
      worker.postMessage({ type: 'init', xmlbif });
    } catch {
      // Worker creation failed; fall back to synchronous inference
      this._useFallback = true;
      this._fallbackNetwork = BayesianNetwork.fromXmlBif(xmlbif);
      this._fallbackEngine = new CachedInferenceEngine(this._fallbackNetwork);
    }
  }

  private async _createWorker(): Promise<WorkerLike> {
    // Node.js environment
    if (typeof globalThis.process !== 'undefined' && globalThis.process.versions?.node) {
      const { fileURLToPath, pathToFileURL } = await import('node:url');
      const { dirname, resolve: pathResolve } = await import('node:path');
      const { Worker } = await import('node:worker_threads');
      const { existsSync } = await import('node:fs');

      const thisFile = fileURLToPath(import.meta.url);
      const thisDir = dirname(thisFile);
      const workerPathTs = pathResolve(thisDir, 'inference-worker.ts');
      const workerPathJs = workerPathTs.replace(/\.ts$/, '.js');

      // If compiled .js exists, use it directly (production)
      if (existsSync(workerPathJs)) {
        const w = new Worker(pathToFileURL(workerPathJs));
        return w as unknown as WorkerLike;
      }

      // Dev/test: TypeScript source file needs tsx loader for .js extension resolution.
      // We use an inline ESM worker that registers tsx/esm via node:module register()
      // before dynamically importing the actual worker file.
      if (existsSync(workerPathTs)) {
        let tsxEsmUrl: string | undefined;
        try {
          const { createRequire } = await import('node:module');
          const req = createRequire(pathToFileURL(pathResolve(thisDir, 'package.json')));
          tsxEsmUrl = pathToFileURL(req.resolve('tsx/esm')).href;
        } catch {
          // tsx not available
        }

        if (tsxEsmUrl) {
          const workerFileUrl = pathToFileURL(workerPathTs).href;
          // Bootstrap: register tsx/esm loader then import the real worker
          const bootstrap = [
            `import { register } from 'node:module';`,
            `import { MessageChannel } from 'node:worker_threads';`,
            `const { port1, port2 } = new MessageChannel();`,
            `register('${tsxEsmUrl}', {`,
            `  parentURL: import.meta.url,`,
            `  data: { port: port2 },`,
            `  transferList: [port2],`,
            `});`,
            `await import('${workerFileUrl}');`,
          ].join('\n');

          const w = new Worker(bootstrap, { eval: true });
          return w as unknown as WorkerLike;
        }

        // Fallback: try loading .ts directly (Node.js native TS or other loader)
        const w = new Worker(pathToFileURL(workerPathTs));
        return w as unknown as WorkerLike;
      }

      throw new Error('Worker file not found: expected either inference-worker.js or inference-worker.ts');
    }

    // Browser environment
    if (typeof Worker !== 'undefined') {
      // Vite-compatible: use `new URL(..., import.meta.url)` pattern
      const w = new Worker(new URL('./inference-worker.ts', import.meta.url), {
        type: 'module',
      });
      return w as unknown as WorkerLike;
    }

    throw new Error('No Worker implementation available');
  }

  private _onMessage(data: WorkerResponse): void {
    if (data.type === 'error' && data.id === -1) {
      // Init error - reject all pending and mark as fallback
      for (const [, pending] of this._pending) {
        pending.reject(new Error(data.message));
      }
      this._pending.clear();
      return;
    }

    const pending = this._pending.get(data.id);
    if (!pending) return;
    this._pending.delete(data.id);

    if (data.type === 'error') {
      pending.reject(new Error(data.message));
    } else {
      pending.resolve({
        posteriors: deserializePosteriors(data.posteriors),
      });
    }
  }

  private _onError(err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    for (const [, pending] of this._pending) {
      pending.reject(new Error(`Worker error: ${message}`));
    }
    this._pending.clear();
  }

  /**
   * Run inference with optional evidence.
   *
   * Returns posteriors keyed by variable name (not Variable object, since
   * those cannot cross the worker boundary).
   */
  async infer(
    evidence?: Evidence,
    likelihoodEvidence?: LikelihoodEvidence,
  ): Promise<WorkerInferenceResult> {
    if (this._terminated) {
      throw new Error('WorkerInferenceEngine has been terminated');
    }

    await this._initPromise;

    // Re-check after async init (terminate() may have been called while we waited)
    if (this._terminated) {
      throw new Error('WorkerInferenceEngine has been terminated');
    }

    // Fallback path: synchronous on main thread
    if (this._useFallback && this._fallbackEngine) {
      const result = this._fallbackEngine.infer(evidence, likelihoodEvidence);
      const posteriors = new Map<string, Map<string, number>>();
      for (const [variable, dist] of result.posteriors) {
        posteriors.set(variable.name, dist);
      }
      return { posteriors };
    }

    // Worker path
    const id = this._nextId++;
    return new Promise<WorkerInferenceResult>((resolve, reject) => {
      this._pending.set(id, { resolve, reject });
      this._worker!.postMessage({
        type: 'infer',
        id,
        evidence: evidenceToObj(evidence),
        likelihoodEvidence: likelihoodEvidenceToObj(likelihoodEvidence),
      });
    });
  }

  /** Terminate the underlying worker. */
  terminate(): void {
    this._terminated = true;
    if (this._worker) {
      this._worker.terminate();
      this._worker = null;
    }
    // Reject any pending requests
    for (const [, pending] of this._pending) {
      pending.reject(new Error('Worker terminated'));
    }
    this._pending.clear();
  }
}
