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
 * Elimination-ordering heuristic used to triangulate the moral graph.
 * - 'min-fill'   : eliminate the vertex whose elimination adds the fewest
 *                  fill edges (default; best quality). Ties broken by
 *                  min-degree, then variable name for determinism.
 * - 'min-degree' : eliminate the lowest-degree live vertex (cheaper to compute).
 * - 'input-order': eliminate in the graph's vertex insertion order — no
 *                  heuristic; provided as a worst-case baseline for benchmarking.
 */
export type EliminationHeuristic = 'min-fill' | 'min-degree' | 'input-order';

export interface EliminationResult {
  /** The order in which vertices were eliminated. */
  readonly order: Variable[];
  /**
   * Fill-in edges added during elimination. The union of these with the
   * original graph's edges is a chordal (triangulated) graph.
   */
  readonly fillEdges: Array<[Variable, Variable]>;
  /**
   * Induced width of this ordering = (largest elimination clique size − 1).
   * This is the realized treewidth for this particular ordering.
   */
  readonly inducedWidth: number;
  /**
   * The elimination clique with the most table entries (product of member
   * cardinalities). Equals the largest maximal clique of the triangulated graph,
   * so this — and `maxCliqueEntries` below — are exact, computed WITHOUT
   * enumerating maximal cliques (which can blow up on high-treewidth graphs).
   */
  readonly largestClique: Variable[];
  /** Table entries of `largestClique` = product of member cardinalities. */
  readonly maxCliqueEntries: number;
  /** Sum of table entries over every elimination clique (a cost/work proxy). */
  readonly totalCliqueEntries: number;
}

/**
 * Run a correct greedy elimination on a *copy* of the graph, accumulating
 * fill-in edges. When a vertex is eliminated, all of its still-live neighbours
 * are connected pairwise; any missing edges become fill-in that persists and
 * influences later elimination steps (this is what makes it a valid
 * triangulation, unlike a single static "marry each vertex's neighbours" pass).
 *
 * Deterministic: the same input graph always yields the same ordering.
 */
export function eliminate(
  graph: UndirectedGraph,
  heuristic: EliminationHeuristic = 'min-fill',
): EliminationResult {
  // Mutable working adjacency (copy so the caller's graph is untouched).
  const adj = new Map<Variable, Set<Variable>>();
  for (const [v, ns] of graph.neighbors) adj.set(v, new Set(ns));

  const fillEdges: Array<[Variable, Variable]> = [];
  const order: Variable[] = [];
  const remaining = new Set(graph.vertices);
  let inducedWidth = 0;
  let largestClique: Variable[] = [];
  let maxCliqueEntries = 0;
  let totalCliqueEntries = 0;

  // Cursor for the 'input-order' baseline.
  const inputOrder = graph.vertices;
  let inputCursor = 0;

  while (remaining.size > 0) {
    let bestV: Variable | null = null;

    if (heuristic === 'input-order') {
      while (inputCursor < inputOrder.length && !remaining.has(inputOrder[inputCursor])) {
        inputCursor++;
      }
      bestV = inputOrder[inputCursor] ?? null;
    } else {
      let bestScore = Infinity;
      let bestDeg = Infinity;
      for (const v of remaining) {
        // Live neighbours of v
        const ns: Variable[] = [];
        for (const n of adj.get(v)!) {
          if (remaining.has(n)) ns.push(n);
        }
        const deg = ns.length;

        let score: number;
        if (heuristic === 'min-degree') {
          score = deg;
        } else {
          // min-fill: count neighbour pairs not yet connected
          let fill = 0;
          for (let i = 0; i < ns.length; i++) {
            const ai = adj.get(ns[i])!;
            for (let j = i + 1; j < ns.length; j++) {
              if (!ai.has(ns[j])) fill++;
            }
          }
          score = fill;
        }

        // Deterministic tie-break: score, then degree, then variable name.
        if (
          score < bestScore ||
          (score === bestScore && deg < bestDeg) ||
          (score === bestScore && deg === bestDeg && bestV !== null && v.name < bestV.name)
        ) {
          bestScore = score;
          bestDeg = deg;
          bestV = v;
        }
      }
    }

    if (!bestV) break;

    // Clique formed at this step = {bestV} ∪ live neighbours.
    const ns = [...adj.get(bestV)!].filter(n => remaining.has(n));
    if (ns.length > inducedWidth) inducedWidth = ns.length; // = clique size − 1

    // Track clique-table cost (product of member cardinalities).
    let entries = bestV.outcomes.length;
    for (const n of ns) entries *= n.outcomes.length;
    totalCliqueEntries += entries;
    if (entries > maxCliqueEntries) {
      maxCliqueEntries = entries;
      largestClique = [bestV, ...ns];
    }

    // Connect all live neighbours pairwise (persistent fill-in).
    for (let i = 0; i < ns.length; i++) {
      const ai = adj.get(ns[i])!;
      for (let j = i + 1; j < ns.length; j++) {
        if (!ai.has(ns[j])) {
          fillEdges.push([ns[i], ns[j]]);
          ai.add(ns[j]);
          adj.get(ns[j])!.add(ns[i]);
        }
      }
    }

    remaining.delete(bestV);
    order.push(bestV);
  }

  return { order, fillEdges, inducedWidth, largestClique, maxCliqueEntries, totalCliqueEntries };
}

/**
 * Triangulate (chordalize) an undirected graph via greedy elimination.
 * Returns the original graph plus all fill-in edges. The default heuristic is
 * min-fill, which tends to produce the smallest cliques / lowest treewidth.
 */
export function triangulate(
  graph: UndirectedGraph,
  heuristic: EliminationHeuristic = 'min-fill',
): UndirectedGraph {
  const { fillEdges } = eliminate(graph, heuristic);
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

export interface JunctionTreeOptions {
  /** Elimination heuristic used for triangulation (default 'min-fill'). */
  readonly heuristic?: EliminationHeuristic;
}

/** Build a junction tree from a directed Bayesian network graph. */
export function buildJunctionTree(dag: DirectedGraph, options?: JunctionTreeOptions): JunctionTree {
  const moral = moralize(dag);
  const triangulated = triangulate(moral, options?.heuristic ?? 'min-fill');
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

// ─── Cost estimation (structure-only; no inference / no allocation) ──

export interface CostEstimate {
  /** Realized treewidth = size of the largest clique − 1. */
  readonly treewidth: number;
  /** Number of variables in the largest clique. */
  readonly maxCliqueSize: number;
  /** Entries in the largest clique table = product of its members' cardinalities. */
  readonly maxCliqueEntries: number;
  /** Sum of clique-table entries over all cliques (proxy for total work/memory). */
  readonly totalCliqueEntries: number;
  /** The largest clique by table size (drives peak memory); handy for diagnostics. */
  readonly largestClique: Clique;
  /** Number of cliques in the junction tree. */
  readonly numCliques: number;
}

/** Number of table entries for a clique = product of its members' cardinalities. */
export function cliqueTableEntries(clique: Clique): number {
  let n = 1;
  for (const v of clique) n *= v.outcomes.length;
  return n;
}

/** Compute a cost estimate from an already-built junction tree. */
export function junctionTreeCost(jt: JunctionTree): CostEstimate {
  let maxCliqueSize = 0;
  let maxCliqueEntries = 0;
  let totalCliqueEntries = 0;
  let largestClique: Clique = [];
  for (const clique of jt.cliques) {
    const entries = cliqueTableEntries(clique);
    totalCliqueEntries += entries;
    if (entries > maxCliqueEntries) {
      maxCliqueEntries = entries;
      largestClique = clique;
    }
    if (clique.length > maxCliqueSize) maxCliqueSize = clique.length;
  }
  return {
    treewidth: Math.max(0, maxCliqueSize - 1),
    maxCliqueSize,
    maxCliqueEntries,
    totalCliqueEntries,
    largestClique,
    numCliques: jt.cliques.length,
  };
}

/**
 * Estimate junction-tree inference cost for a directed network *without*
 * running inference, allocating any clique tables, or even enumerating maximal
 * cliques (which can itself blow up on high-treewidth graphs). Computed directly
 * from the greedy elimination, so it stays fast even on intractable networks —
 * exactly what a downstream gate needs to reject them cheaply.
 *
 * `treewidth`, `maxCliqueSize`, `maxCliqueEntries` and `largestClique` are exact
 * (the largest elimination clique is the largest maximal clique). `numCliques`
 * counts elimination cliques (= variables) and `totalCliqueEntries` sums over
 * them, so both are proxies (upper bounds) rather than junction-tree-exact.
 */
export function estimateJunctionTreeCost(dag: DirectedGraph, options?: JunctionTreeOptions): CostEstimate {
  const moral = moralize(dag);
  const e = eliminate(moral, options?.heuristic ?? 'min-fill');
  return {
    treewidth: e.inducedWidth,
    maxCliqueSize: e.largestClique.length,
    maxCliqueEntries: e.maxCliqueEntries,
    totalCliqueEntries: e.totalCliqueEntries,
    largestClique: e.largestClique,
    numCliques: e.order.length,
  };
}
