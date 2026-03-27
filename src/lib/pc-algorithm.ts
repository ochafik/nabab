/**
 * PC algorithm for causal discovery from observational discrete data.
 * Dependency-free implementation using native CI tests.
 */
import type { Variable, CPT } from './types.js';
import type { ParsedNetwork } from './xmlbif-parser.js';
import type { DataColumn } from './structure-learning.js';
import { chiSquaredTest, gSquaredTest } from './ci-tests.js';

export interface PCOptions {
  /** Significance level (default 0.05). */
  alpha?: number;
  /** CI test to use (default 'chi-squared'). */
  ciTest?: 'chi-squared' | 'g-squared';
  /** Maximum conditioning set size (default: unlimited). */
  maxConditioningSize?: number;
}

/**
 * PC algorithm: learns a CPDAG from data, then orients into a DAG.
 */
export function pcAlgorithm(
  data: DataColumn[],
  options?: PCOptions,
): ParsedNetwork {
  const alpha = options?.alpha ?? 0.05;
  const ciTestFn = options?.ciTest === 'g-squared' ? gSquaredTest : chiSquaredTest;
  const maxCond = options?.maxConditioningSize ?? Infinity;
  const names = data.map(c => c.name);
  const n = names.length;

  // Adjacency (undirected skeleton)
  const adj: boolean[][] = Array.from({ length: n }, () => new Array(n).fill(false));
  // Start fully connected
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) { adj[i][j] = true; adj[j][i] = true; }

  // Separation sets
  const sepSet: Map<string, Set<string>> = new Map();
  const sepKey = (a: number, b: number) => `${Math.min(a, b)},${Math.max(a, b)}`;

  // Step 1: Skeleton discovery
  let condSize = 0;
  while (condSize <= Math.min(maxCond, n - 2)) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (!adj[i][j]) continue;

        // Neighbors of i (excluding j) and neighbors of j (excluding i)
        const neighborsI: number[] = [];
        const neighborsJ: number[] = [];
        for (let k = 0; k < n; k++) {
          if (k !== j && adj[i][k]) neighborsI.push(k);
          if (k !== i && adj[j][k]) neighborsJ.push(k);
        }

        // Test subsets of neighbors of both i and j
        let separated = false;
        for (const neighbors of [neighborsI, neighborsJ]) {
          if (neighbors.length < condSize) continue;
          for (const subset of combinations(neighbors, condSize)) {
            const given = subset.map(k => names[k]);
            const result = ciTestFn(data, names[i], names[j], given);
            if (result.pValue > alpha) {
              adj[i][j] = false;
              adj[j][i] = false;
              sepSet.set(sepKey(i, j), new Set(given));
              separated = true;
              changed = true;
              break;
            }
          }
          if (separated) break;
        }
      }
    }
    if (!changed && condSize > 0) break;
    condSize++;
  }

  // Directed adjacency for orientation
  const directed: boolean[][] = Array.from({ length: n }, () => new Array(n).fill(false));
  // Track undirected edges
  const undirected: boolean[][] = Array.from({ length: n }, () => new Array(n).fill(false));
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      if (adj[i][j]) { undirected[i][j] = true; undirected[j][i] = true; }

  // Step 2: Orient v-structures (colliders): X - Z - Y where X,Y not adjacent, Z not in sep(X,Y)
  for (let z = 0; z < n; z++) {
    const neighbors: number[] = [];
    for (let k = 0; k < n; k++) if (adj[z][k]) neighbors.push(k);

    for (let ai = 0; ai < neighbors.length; ai++) {
      for (let bi = ai + 1; bi < neighbors.length; bi++) {
        const x = neighbors[ai];
        const y = neighbors[bi];
        if (adj[x][y]) continue; // x and y are adjacent, skip
        const sep = sepSet.get(sepKey(x, y));
        if (sep && sep.has(names[z])) continue; // z in separation set, skip
        // Orient as x -> z <- y
        directed[x][z] = true;
        directed[y][z] = true;
        undirected[x][z] = false; undirected[z][x] = false;
        undirected[y][z] = false; undirected[z][y] = false;
      }
    }
  }

  // Step 3: Meek's rules (iterate until no changes)
  let meekChanged = true;
  while (meekChanged) {
    meekChanged = false;

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (!undirected[i][j]) continue;

        // Rule 1: If k -> i - j and k not adjacent to j, orient i -> j
        for (let k = 0; k < n; k++) {
          if (directed[k][i] && !adj[k][j]) {
            orient(i, j); meekChanged = true; break;
          }
        }
        if (!undirected[i][j]) continue;

        // Rule 2: If i -> k -> j and i - j, orient i -> j
        for (let k = 0; k < n; k++) {
          if (directed[i][k] && directed[k][j]) {
            orient(i, j); meekChanged = true; break;
          }
        }
        if (!undirected[i][j]) continue;

        // Rule 3: If i - k1 -> j and i - k2 -> j and k1 not adj to k2, orient i -> j
        const ks: number[] = [];
        for (let k = 0; k < n; k++) {
          if (undirected[i][k] && directed[k][j]) ks.push(k);
        }
        for (let a = 0; a < ks.length && undirected[i][j]; a++) {
          for (let b = a + 1; b < ks.length; b++) {
            if (!adj[ks[a]][ks[b]]) {
              orient(i, j); meekChanged = true; break;
            }
          }
          if (!undirected[i][j]) break;
        }
      }
    }
  }

  function orient(from: number, to: number) {
    directed[from][to] = true;
    undirected[from][to] = false;
    undirected[to][from] = false;
  }

  // Remaining undirected edges: orient lower index -> higher index (acyclic heuristic)
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      if (undirected[i][j]) directed[i][j] = true;

  // Ensure acyclicity
  ensureAcyclic(directed, n);

  // Build variables and CPTs
  const variables: Variable[] = data.map(col => {
    const outcomes = [...new Set(col.values)].sort();
    return { name: col.name, outcomes };
  });

  const cpts = buildCPTs(directed, data, variables);
  return { name: 'learned', variables, cpts };
}

/** Generate all k-combinations of arr. */
function* combinations(arr: number[], k: number): Generator<number[]> {
  if (k === 0) { yield []; return; }
  if (k > arr.length) return;
  for (let i = 0; i <= arr.length - k; i++) {
    for (const rest of combinations(arr.slice(i + 1), k - 1)) {
      yield [arr[i], ...rest];
    }
  }
}

/** Remove back-edges to ensure acyclicity via DFS post-order. */
function ensureAcyclic(adj: boolean[][], n: number): void {
  const inDegree = new Array(n).fill(0);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) if (adj[i][j]) inDegree[j]++;

  const queue: number[] = [];
  for (let i = 0; i < n; i++) if (inDegree[i] === 0) queue.push(i);

  const order: number[] = [];
  const tmpIn = [...inDegree];
  while (queue.length > 0) {
    const node = queue.shift()!;
    order.push(node);
    for (let j = 0; j < n; j++) {
      if (adj[node][j]) { tmpIn[j]--; if (tmpIn[j] === 0) queue.push(j); }
    }
  }
  if (order.length === n) return;

  // Has cycle: use DFS to find topo order, remove violating edges
  const visited = new Uint8Array(n);
  const finished: number[] = [];
  function dfs(u: number): void {
    visited[u] = 1;
    for (let v = 0; v < n; v++) if (adj[u][v] && visited[v] === 0) dfs(v);
    visited[u] = 2;
    finished.push(u);
  }
  for (let i = 0; i < n; i++) if (visited[i] === 0) dfs(i);

  const pos = new Array(n);
  for (let i = 0; i < n; i++) pos[finished[n - 1 - i]] = i;

  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      if (adj[i][j] && pos[i] > pos[j]) adj[i][j] = false;
}

/** Build CPTs from adjacency + data using MLE with Laplace smoothing. */
function buildCPTs(adj: boolean[][], data: DataColumn[], variables: Variable[]): CPT[] {
  const nRows = data[0].values.length;
  const numVars = variables.length;

  const valueIndices: number[][] = data.map((col, ci) => {
    const om = new Map<string, number>();
    variables[ci].outcomes.forEach((o, k) => om.set(o, k));
    return col.values.map(v => om.get(v) ?? 0);
  });

  const cpts: CPT[] = [];
  for (let j = 0; j < numVars; j++) {
    const parentIdx: number[] = [];
    for (let i = 0; i < numVars; i++) if (adj[i][j]) parentIdx.push(i);

    const variable = variables[j];
    const parents = parentIdx.map(i => variables[i]);
    const varCard = variable.outcomes.length;
    const parentCards = parentIdx.map(p => variables[p].outcomes.length);

    let numPaCfg = 1;
    for (const c of parentCards) numPaCfg *= c;

    const tableSize = numPaCfg * varCard;
    const counts = new Float64Array(tableSize).fill(1); // Laplace
    const paCounts = new Float64Array(numPaCfg).fill(varCard);

    for (let row = 0; row < nRows; row++) {
      let paIdx = 0, stride = 1;
      for (let p = parentIdx.length - 1; p >= 0; p--) {
        paIdx += valueIndices[parentIdx[p]][row] * stride;
        stride *= parentCards[p];
      }
      counts[paIdx * varCard + valueIndices[j][row]] += 1;
      paCounts[paIdx] += 1;
    }

    const table = new Float64Array(tableSize);
    for (let pa = 0; pa < numPaCfg; pa++)
      for (let k = 0; k < varCard; k++)
        table[pa * varCard + k] = counts[pa * varCard + k] / paCounts[pa];

    cpts.push({ variable, parents, table });
  }
  return cpts;
}
