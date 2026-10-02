/** Pure dagre layout (runs in a Web Worker, or on the main thread as a fallback). */
import dagre from '@dagrejs/dagre';

export interface LayoutInput {
  /** Node sizes, in variable order. */
  w: number[];
  h: number[];
  names: string[];
  /** Edges as [parentIndex, childIndex]. */
  edges: Array<[number, number]>;
}
export interface LayoutResult {
  width: number;
  height: number;
  /** Node centres, in the same order as the input. */
  x: number[];
  y: number[];
}

export function computeLayout(input: LayoutInput): LayoutResult {
  const n = input.names.length;
  const g = new dagre.graphlib.Graph();
  // network-simplex ranking is superlinear (14 s on link, 724 nodes); tight-tree gives the same layout ~25x faster.
  g.setGraph({ rankdir: 'TB', nodesep: 50, ranksep: 70, marginx: 30, marginy: 30, ranker: n > 150 ? 'tight-tree' : 'network-simplex' });
  g.setDefaultEdgeLabel(() => ({}));
  for (let i = 0; i < n; i++) g.setNode(input.names[i], { width: input.w[i], height: input.h[i] });
  for (const [p, c] of input.edges) g.setEdge(input.names[p], input.names[c]);
  dagre.layout(g);
  const x: number[] = [], y: number[] = [];
  for (let i = 0; i < n; i++) { const nd = g.node(input.names[i]); x.push(nd.x); y.push(nd.y); }
  return { width: g.graph().width ?? 0, height: g.graph().height ?? 0, x, y };
}
