/**
 * Graph operations for junction tree construction.
 * Uses simple adjacency-map representations with Variable references.
 */
import type { Variable } from './types.js';

// ─── Directed graph ──────────────────────────────────────────────────

export interface DirectedGraph {
  readonly vertices: Variable[];
  readonly children: Map<Variable, Set<Variable>>; // parent -> children
  readonly parents: Map<Variable, Set<Variable>>;  // child -> parents
}

export function buildDirectedGraph(
  vertices: Variable[],
  edges: Array<[Variable, Variable]>,
): DirectedGraph {
  const children = new Map<Variable, Set<Variable>>();
  const parents = new Map<Variable, Set<Variable>>();
  for (const v of vertices) {
    children.set(v, new Set());
    parents.set(v, new Set());
  }
  for (const [from, to] of edges) {
    children.get(from)!.add(to);
    parents.get(to)!.add(from);
  }
  return { vertices, children, parents };
}

// ─── Undirected graph ────────────────────────────────────────────────

export interface UndirectedGraph {
  readonly vertices: Variable[];
  readonly neighbors: Map<Variable, Set<Variable>>;
}

function addUndirectedEdge(neighbors: Map<Variable, Set<Variable>>, a: Variable, b: Variable) {
  if (a === b) return;
  neighbors.get(a)!.add(b);
  neighbors.get(b)!.add(a);
}

// ─── Moralization ────────────────────────────────────────────────────

/** Convert a directed graph to undirected, marrying co-parents. */
export function moralize(dag: DirectedGraph): UndirectedGraph {
  const neighbors = new Map<Variable, Set<Variable>>();
  for (const v of dag.vertices) neighbors.set(v, new Set());

  // Copy all directed edges as undirected
  for (const [parent, kids] of dag.children) {
    for (const child of kids) {
      addUndirectedEdge(neighbors, parent, child);
    }
  }

  // Marry co-parents
  for (const [, pars] of dag.parents) {
    const parArray = [...pars];
    for (let i = 0; i < parArray.length; i++) {
      for (let j = i + 1; j < parArray.length; j++) {
        addUndirectedEdge(neighbors, parArray[i], parArray[j]);
      }
    }
  }

  return { vertices: dag.vertices, neighbors };
}

// ─── Triangulation ───────────────────────────────────────────────────

/**
 * Triangulate an undirected graph using minimum-degree elimination ordering.
 * This produces a chordal graph with much smaller cliques than the naive
 * "connect all neighbors" approach.
 */
export function triangulate(graph: UndirectedGraph): UndirectedGraph {
  // Work on a mutable copy of the adjacency structure
  const elimNeighbors = new Map<Variable, Set<Variable>>();
  for (const [v, ns] of graph.neighbors) elimNeighbors.set(v, new Set(ns));

  // Collect fill-in edges
  const fillEdges: Array<[Variable, Variable]> = [];
  const remaining = new Set(graph.vertices);

  while (remaining.size > 0) {
    // Pick vertex with minimum degree among remaining
    let minDeg = Infinity;
    let minV: Variable | null = null;
    for (const v of remaining) {
      let deg = 0;
      for (const n of elimNeighbors.get(v)!) {
        if (remaining.has(n)) deg++;
      }
      if (deg < minDeg) { minDeg = deg; minV = v; }
    }
    if (!minV) break;

    // Connect all remaining neighbors of minV (fill-in)
    const ns = [...elimNeighbors.get(minV)!].filter(n => remaining.has(n));
    for (let i = 0; i < ns.length; i++) {
      for (let j = i + 1; j < ns.length; j++) {
        if (!elimNeighbors.get(ns[i])!.has(ns[j])) {
          fillEdges.push([ns[i], ns[j]]);
          elimNeighbors.get(ns[i])!.add(ns[j]);
          elimNeighbors.get(ns[j])!.add(ns[i]);
        }
      }
    }

    // Eliminate vertex
    remaining.delete(minV);
  }

  // Build result: original graph + fill-in edges
  const neighbors = new Map<Variable, Set<Variable>>();
  for (const [v, ns] of graph.neighbors) neighbors.set(v, new Set(ns));
  for (const [a, b] of fillEdges) {
    addUndirectedEdge(neighbors, a, b);
  }

  return { vertices: graph.vertices, neighbors };
}

// ─── Maximal cliques ─────────────────────────────────────────────────

export type Clique = Variable[];

/**
 * Find all maximal cliques via greedy growth from each vertex.
 * Returns deduplicated cliques sorted by variable name.
 */
export function findMaximalCliques(graph: UndirectedGraph): Clique[] {
  const cliques = new Set<string>(); // canonical keys for dedup
  const result: Clique[] = [];

  function growClique(current: Set<Variable>, candidates: Variable[]): void {
    let isMaximal = true;
    for (const c of candidates) {
      // Check if c is connected to every vertex in current
      const ns = graph.neighbors.get(c)!;
      if ([...current].every(v => ns.has(v))) {
        isMaximal = false;
        // Only grow if c is "greater" than all current (avoid duplicates)
        if ([...current].every(v => v.name < c.name)) {
          const next = new Set(current);
          next.add(c);
          const nextCandidates = candidates.filter(
            x => x !== c && graph.neighbors.get(x)!.has(c),
          );
          growClique(next, nextCandidates);
        }
      }
    }
    if (isMaximal && current.size > 0) {
      const sorted = [...current].sort((a, b) => a.name.localeCompare(b.name));
      const key = sorted.map(v => v.name).join(',');
      if (!cliques.has(key)) {
        cliques.add(key);
        result.push(sorted);
      }
    }
  }

  for (const v of graph.vertices) {
    const ns = [...graph.neighbors.get(v)!];
    growClique(new Set([v]), ns);
  }

  return result;
}

// ─── Junction tree ───────────────────────────────────────────────────

export interface JunctionTree {
  readonly cliques: Clique[];
  /** Maps clique index -> set of neighbor clique indices */
  readonly neighbors: Map<number, Set<number>>;
}

/** Build a junction tree from a directed Bayesian network graph. */
export function buildJunctionTree(dag: DirectedGraph): JunctionTree {
  const moral = moralize(dag);
  const triangulated = triangulate(moral);
  const cliques = findMaximalCliques(triangulated);

  if (cliques.length === 0) {
    return { cliques: [], neighbors: new Map() };
  }
  if (cliques.length === 1) {
    return { cliques, neighbors: new Map([[0, new Set()]]) };
  }

  // Build junction graph: connect cliques that share variables
  interface WeightedEdge {
    i: number;
    j: number;
    weight: number; // size of separator (intersection)
  }

  const edges: WeightedEdge[] = [];
  for (let i = 0; i < cliques.length; i++) {
    const setI = new Set(cliques[i]);
    for (let j = i + 1; j < cliques.length; j++) {
      const intersection = cliques[j].filter(v => setI.has(v));
      if (intersection.length > 0) {
        edges.push({ i, j, weight: intersection.length });
      }
    }
  }

  // Kruskal's MST (maximum weight = largest separators first)
  edges.sort((a, b) => b.weight - a.weight);

  // Union-Find
  const parent = cliques.map((_, i) => i);
  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }
  function union(a: number, b: number): boolean {
    const ra = find(a), rb = find(b);
    if (ra === rb) return false;
    parent[ra] = rb;
    return true;
  }

  const treeNeighbors = new Map<number, Set<number>>();
  for (let i = 0; i < cliques.length; i++) treeNeighbors.set(i, new Set());

  for (const edge of edges) {
    if (union(edge.i, edge.j)) {
      treeNeighbors.get(edge.i)!.add(edge.j);
      treeNeighbors.get(edge.j)!.add(edge.i);
    }
  }

  return { cliques, neighbors: treeNeighbors };
}
