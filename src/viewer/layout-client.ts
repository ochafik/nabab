/**
 * Layout entry for the viewer: runs dagre in a Web Worker when available,
 * on the main thread otherwise (MCP App single-file build, no Worker support,
 * or a worker failure).
 */
import type { LayoutInput, LayoutResult } from './layout-core.js';

declare const __MCP_APP__: boolean | undefined;
const IN_MCP_APP = typeof __MCP_APP__ !== 'undefined' && __MCP_APP__;

let worker: Worker | null = null;
let workerBroken = false;
let nextId = 1;
const waiting = new Map<number, { ok: (r: LayoutResult) => void; fail: (e: Error) => void }>();

async function getWorker(): Promise<Worker | null> {
  if (IN_MCP_APP || typeof Worker === 'undefined' || workerBroken) return null;
  if (worker) return worker;
  try {
    const { createLayoutWorker } = await import('./layout-worker-factory.js');
    const w = createLayoutWorker();
    const fail = (msg: string) => {
      workerBroken = true; worker = null;
      for (const [, p] of waiting) p.fail(new Error(msg));
      waiting.clear();
    };
    w.onmessage = (e: MessageEvent<{ id: number; result?: LayoutResult; error?: string }>) => {
      const p = waiting.get(e.data.id);
      if (!p) return;
      waiting.delete(e.data.id);
      if (e.data.result) p.ok(e.data.result); else p.fail(new Error(e.data.error ?? 'layout failed'));
    };
    w.onerror = (ev) => fail(ev.message || 'layout worker error');
    worker = w;
    return w;
  } catch {
    workerBroken = true;
    return null;
  }
}

async function onMainThread(input: LayoutInput): Promise<LayoutResult> {
  const { computeLayout } = await import('./layout-core.js');
  return computeLayout(input);
}

export async function runLayout(input: LayoutInput): Promise<LayoutResult> {
  const w = await getWorker();
  if (!w) return onMainThread(input);
  try {
    return await new Promise<LayoutResult>((ok, fail) => {
      const id = nextId++;
      waiting.set(id, { ok, fail });
      w.postMessage({ id, input });
    });
  } catch {
    return onMainThread(input); // worker died: never leave the page without a layout
  }
}
