/** Web Worker entry: dagre layout off the main thread. */
import { computeLayout, type LayoutInput } from './layout-core.js';

self.onmessage = (e: MessageEvent<{ id: number; input: LayoutInput }>) => {
  try {
    (self as unknown as Worker).postMessage({ id: e.data.id, result: computeLayout(e.data.input) });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id: e.data.id, error: err instanceof Error ? err.message : String(err) });
  }
};
