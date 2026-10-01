/** Node selection. */
import { S } from './state.js';
import { rerender } from './render-bus.js';

export function selectNode(name: string, additive: boolean): void {
  // In sensitivity mode, single-click sets the query target
  if (S.sensitivityMode && !additive) {
    S.sensitivityQuery = name;
    S.selectedNodes.clear();
    S.selectedNodes.add(name);
    rerender();
    return;
  }
  if (additive) {
    if (S.selectedNodes.has(name)) S.selectedNodes.delete(name);
    else S.selectedNodes.add(name);
  } else {
    if (S.selectedNodes.has(name) && S.selectedNodes.size === 1) S.selectedNodes.clear();
    else { S.selectedNodes.clear(); S.selectedNodes.add(name); }
  }
  rerender();
}

export function clearSelection(): void {
  if (S.selectedNodes.size > 0) { S.selectedNodes.clear(); rerender(); }
}
