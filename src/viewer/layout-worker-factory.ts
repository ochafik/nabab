/** Isolated so the MCP App build (single file, no worker chunks) can leave it out entirely. */
export function createLayoutWorker(): Worker {
  return new Worker(new URL('./layout-worker.ts', import.meta.url), { type: 'module' });
}
