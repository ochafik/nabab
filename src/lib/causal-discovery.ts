/**
 * Causal discovery wrapper around @kanaries/causal for nabab.
 *
 * Bridges nabab's categorical DataColumn format with @kanaries/causal's
 * numeric matrix API. Supports PC, GES, GRaSP, and FCI algorithms.
 *
 * @kanaries/causal provides both discrete-appropriate tests (chi-squared, G-squared,
 * BDeu score) and continuous tests (Fisher's z, Gaussian BIC). This wrapper
 * defaults to discrete-appropriate methods since nabab works with categorical data.
 */
import {
  pc,
  ges,
  grasp,
  fci,
  DenseMatrix,
  ChiSquareTest,
  GSquareTest,
  BDeuScore,
  type GraphShape,
  type EdgeDescriptor,
} from '@kanaries/causal';
import type { Variable, CPT } from './types.js';
import type { ParsedNetwork } from './xmlbif-parser.js';
import type { DataColumn } from './structure-learning.js';

export type CausalAlgorithm = 'pc' | 'ges' | 'grasp' | 'fci';

export type CiTestType = 'chi-square' | 'g-square';

export interface CausalDiscoveryOptions {
  /** Algorithm to use (default 'pc'). */
  algorithm?: CausalAlgorithm;
  /** Significance level for conditional independence tests (PC/FCI). Default 0.05. */
  alpha?: number;
  /**
   * Conditional independence test for PC/FCI (default 'chi-square').
   * Both chi-square and G-square are appropriate for discrete/categorical data.
   */
  ciTest?: CiTestType;
  /** Maximum depth for GRaSP search (default: undefined = library default). */
  depth?: number;
  /** Maximum number of parents per node for GES/GRaSP (default: undefined = library default). */
  maxParents?: number;
  /** BDeu structure prior (default 1.0). */
  structurePrior?: number;
  /** BDeu sample prior (default 1.0). */
  samplePrior?: number;
}

/**
 * Encode categorical DataColumn[] into a column-oriented numeric matrix.
 *
 * Each unique string outcome for a variable is mapped to a consecutive integer
 * (0, 1, 2, ...). Returns the DenseMatrix plus the Variables metadata (names and
 * outcome lists in the order they were encountered).
 */
function encodeData(data: DataColumn[]): {
  matrix: DenseMatrix;
  variables: Variable[];
} {
  const numRows = data[0].values.length;
  const variables: Variable[] = [];
  const columns: number[][] = [];

  for (const col of data) {
    const outcomes: string[] = [];
    const outcomeMap = new Map<string, number>();

    for (const val of col.values) {
      if (!outcomeMap.has(val)) {
        outcomeMap.set(val, outcomes.length);
        outcomes.push(val);
      }
    }

    const encoded = col.values.map(v => outcomeMap.get(v)!);
    columns.push(encoded);
    variables.push({ name: col.name, outcomes });
  }

  // DenseMatrix.fromColumns expects column arrays
  const matrix = DenseMatrix.fromColumns(columns);

  return { matrix, variables };
}

/**
 * Build state cardinalities map for BDeu score (variable index -> number of outcomes).
 */
function buildCardinalities(variables: Variable[]): Record<number, number> {
  const cardinalities: Record<number, number> = {};
  for (let i = 0; i < variables.length; i++) {
    cardinalities[i] = variables[i].outcomes.length;
  }
  return cardinalities;
}

/**
 * Convert a @kanaries/causal GraphShape into a nabab adjacency matrix.
 * Returns adj[i][j] = true if there is a directed edge from i to j.
 *
 * Handles directed edges (tail -> arrow), undirected edges (by choosing
 * an arbitrary direction that does not create a cycle), and ignores
 * bidirected/circle edges (which arise from FCI and indicate latent confounders).
 */
function graphShapeToAdjacency(
  graph: GraphShape,
  nodeLabels: string[],
): boolean[][] {
  const n = nodeLabels.length;
  const labelToIndex = new Map<string, number>();
  for (let i = 0; i < n; i++) labelToIndex.set(nodeLabels[i], i);

  const adj: boolean[][] = Array.from({ length: n }, () =>
    new Array(n).fill(false),
  );

  for (const edge of graph.edges) {
    const i = labelToIndex.get(edge.node1);
    const j = labelToIndex.get(edge.node2);
    if (i === undefined || j === undefined) continue;

    if (edge.endpoint1 === 'tail' && edge.endpoint2 === 'arrow') {
      // Directed edge: node1 -> node2
      adj[i][j] = true;
    } else if (edge.endpoint1 === 'arrow' && edge.endpoint2 === 'tail') {
      // Directed edge: node2 -> node1
      adj[j][i] = true;
    } else if (edge.endpoint1 === 'tail' && edge.endpoint2 === 'tail') {
      // Undirected edge: orient as i -> j (lower index -> higher index)
      // to avoid cycles in simple cases
      if (i < j) {
        adj[i][j] = true;
      } else {
        adj[j][i] = true;
      }
    }
    // Bidirected (arrow-arrow), circle edges, etc. are skipped -- they
    // indicate latent confounders or uncertain orientation (FCI output).
  }

  // Ensure acyclicity: remove any back-edges using topological ordering
  ensureAcyclic(adj, n);

  return adj;
}

/**
 * Remove edges to ensure the adjacency matrix is acyclic.
 * Uses Kahn's algorithm to find a topological order; any edges
 * that violate it are removed.
 */
function ensureAcyclic(adj: boolean[][], n: number): void {
  // Compute in-degrees
  const inDegree = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (adj[i][j]) inDegree[j]++;
    }
  }

  // Kahn's algorithm
  const queue: number[] = [];
  for (let i = 0; i < n; i++) {
    if (inDegree[i] === 0) queue.push(i);
  }

  const order: number[] = [];
  const tempInDegree = [...inDegree];
  while (queue.length > 0) {
    const node = queue.shift()!;
    order.push(node);
    for (let j = 0; j < n; j++) {
      if (adj[node][j]) {
        tempInDegree[j]--;
        if (tempInDegree[j] === 0) queue.push(j);
      }
    }
  }

  if (order.length === n) return; // Already acyclic

  // There is a cycle. Build a valid topological order by removing back-edges.
  // Use DFS post-order to establish an ordering, then remove violating edges.
  const visited = new Uint8Array(n); // 0=unvisited, 1=in-stack, 2=done
  const finished: number[] = [];

  function dfs(u: number): void {
    visited[u] = 1;
    for (let v = 0; v < n; v++) {
      if (adj[u][v]) {
        if (visited[v] === 0) {
          dfs(v);
        }
        // If visited[v] === 1, it's a back-edge (cycle) -- we'll handle below
      }
    }
    visited[u] = 2;
    finished.push(u);
  }

  for (let i = 0; i < n; i++) {
    if (visited[i] === 0) dfs(i);
  }

  // Reverse of finish order gives a valid topological order (ignoring back-edges)
  const topoOrder = finished.reverse();
  const position = new Array(n);
  for (let i = 0; i < n; i++) position[topoOrder[i]] = i;

  // Remove edges that go against the topological order
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (adj[i][j] && position[i] > position[j]) {
        adj[i][j] = false;
      }
    }
  }
}

/**
 * Build CPTs from an adjacency matrix and data using MLE with Laplace smoothing.
 * This is the same parameter learning approach used by nabab's structure-learning.ts.
 */
function buildCPTs(
  adj: boolean[][],
  data: DataColumn[],
  variables: Variable[],
): CPT[] {
  const n = data[0].values.length;
  const numVars = variables.length;

  // Precompute value indices
  const valueIndices: number[][] = data.map((col, ci) => {
    const outcomes = variables[ci].outcomes;
    const outcomeMap = new Map<string, number>();
    for (let k = 0; k < outcomes.length; k++) outcomeMap.set(outcomes[k], k);
    return col.values.map(v => outcomeMap.get(v) ?? 0);
  });

  const cpts: CPT[] = [];

  for (let j = 0; j < numVars; j++) {
    const parentIndices: number[] = [];
    for (let i = 0; i < numVars; i++) {
      if (adj[i][j]) parentIndices.push(i);
    }

    const variable = variables[j];
    const parents = parentIndices.map(i => variables[i]);
    const varCard = variable.outcomes.length;
    const parentCards = parentIndices.map(p => variables[p].outcomes.length);

    let numParentConfigs = 1;
    for (const c of parentCards) numParentConfigs *= c;

    const tableSize = numParentConfigs * varCard;
    const counts = new Float64Array(tableSize);
    const parentCounts = new Float64Array(numParentConfigs);

    // Laplace smoothing: add 1 to each cell
    for (let i = 0; i < tableSize; i++) counts[i] = 1;
    for (let i = 0; i < numParentConfigs; i++) parentCounts[i] = varCard;

    for (let row = 0; row < n; row++) {
      let paIdx = 0;
      let stride = 1;
      for (let p = parentIndices.length - 1; p >= 0; p--) {
        paIdx += valueIndices[parentIndices[p]][row] * stride;
        stride *= parentCards[p];
      }

      const xIdx = valueIndices[j][row];
      counts[paIdx * varCard + xIdx] += 1;
      parentCounts[paIdx] += 1;
    }

    const table = new Float64Array(tableSize);
    for (let paIdx = 0; paIdx < numParentConfigs; paIdx++) {
      const pCount = parentCounts[paIdx];
      for (let xIdx = 0; xIdx < varCard; xIdx++) {
        table[paIdx * varCard + xIdx] =
          counts[paIdx * varCard + xIdx] / pCount;
      }
    }

    cpts.push({ variable, parents, table });
  }

  return cpts;
}

/**
 * Learn network structure using causal discovery algorithms from @kanaries/causal.
 *
 * Handles the conversion between nabab's DataColumn format and the library's
 * numeric matrix format. Categorical string values are encoded as integers
 * (0, 1, 2, ...) before passing to the library.
 *
 * Uses discrete-appropriate statistical tests:
 * - PC/FCI: Chi-squared or G-squared conditional independence tests
 * - GES/GRaSP: BDeu (Bayesian Dirichlet equivalent uniform) score
 *
 * These are well-suited for categorical data, unlike Fisher's z or Gaussian BIC
 * which assume continuous Gaussian distributions.
 *
 * @param data - Array of DataColumn objects (categorical string values per variable)
 * @param options - Algorithm choice and hyperparameters
 * @returns A ParsedNetwork with learned structure and MLE parameters
 */
export function causalDiscovery(
  data: DataColumn[],
  options?: CausalDiscoveryOptions,
): ParsedNetwork {
  if (data.length === 0) {
    throw new Error('causalDiscovery: data must contain at least one column');
  }
  if (data[0].values.length === 0) {
    throw new Error('causalDiscovery: data must contain at least one row');
  }

  const algorithm = options?.algorithm ?? 'pc';
  const alpha = options?.alpha ?? 0.05;
  const ciTestType = options?.ciTest ?? 'chi-square';

  const { matrix, variables } = encodeData(data);
  const nodeLabels = variables.map(v => v.name);

  let graphShape: GraphShape;

  try {
    switch (algorithm) {
      case 'pc': {
        const ciTest =
          ciTestType === 'g-square'
            ? new GSquareTest(matrix)
            : new ChiSquareTest(matrix);
        const result = pc({ data: matrix, ciTest, alpha, nodeLabels });
        graphShape = result.graph;
        break;
      }

      case 'fci': {
        const ciTest =
          ciTestType === 'g-square'
            ? new GSquareTest(matrix)
            : new ChiSquareTest(matrix);
        const result = fci({ data: matrix, ciTest, alpha, nodeLabels });
        graphShape = result.graph;
        break;
      }

      case 'ges': {
        const cardinalities = buildCardinalities(variables);
        const score = new BDeuScore(matrix, {
          samplePrior: options?.samplePrior ?? 1.0,
          structurePrior: options?.structurePrior ?? 1.0,
          stateCardinalities: cardinalities,
        });
        const result = ges({
          data: matrix,
          score,
          nodeLabels,
          maxParents: options?.maxParents,
        });
        graphShape = result.dag;
        break;
      }

      case 'grasp': {
        const cardinalities = buildCardinalities(variables);
        const score = new BDeuScore(matrix, {
          samplePrior: options?.samplePrior ?? 1.0,
          structurePrior: options?.structurePrior ?? 1.0,
          stateCardinalities: cardinalities,
        });
        const result = grasp({
          data: matrix,
          score,
          nodeLabels,
          depth: options?.depth,
        });
        graphShape = result.dag;
        break;
      }

      default:
        throw new Error(`causalDiscovery: unknown algorithm '${algorithm}'`);
    }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : String(err);
    throw new Error(
      `causalDiscovery: ${algorithm} algorithm failed: ${message}`,
    );
  }

  // Convert the learned graph structure to an adjacency matrix
  const adj = graphShapeToAdjacency(graphShape, nodeLabels);

  // Learn parameters via MLE with Laplace smoothing
  const cpts = buildCPTs(adj, data, variables);

  return { name: 'learned', variables, cpts };
}
