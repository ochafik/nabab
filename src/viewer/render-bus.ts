/**
 * Late-bound render trigger.
 *
 * Leaf modules (evidence, panels) can request a re-render without importing
 * (and cycling with) the render orchestrator in graph-render.ts. main.ts
 * installs the real render function at boot.
 */
let _rerender: () => void = () => {};

export function setRerender(fn: () => void): void {
  _rerender = fn;
}

export function rerender(): void {
  _rerender();
}
