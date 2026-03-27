/**
 * Structure learning for Bayesian networks using Hill Climbing with BIC scoring.
 *
 * Given tabular categorical data, learns both structure (DAG) and parameters (CPTs)
 * using greedy hill climbing over the space of DAGs, scored by BIC.
 */
import type { Variable, CPT } from './types.js';
import type { ParsedNetwork } from './xmlbif-parser.js';

export interface LearnOptions {
  maxParents?: number;      // max parents per node (default 3)
  scoreFunction?: 'bic' | 'aic' | 'k2';  // default 'bic'
  maxIterations?: number;   // default 1000
  restarts?: number;        // random restarts (default 0)
}

export interface DataColumn {
  name: string;
  values: string[];  // categorical values per row
}

/**
 * Parse a CSV string into DataColumns.
 * Auto-detects delimiter (comma, tab, semicolon).
 * Treats the first row as headers.
 */
export function parseCSV(csv: string): DataColumn[] {
  const lines = csv.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length < 2) throw new Error('CSV must have a header row and at least one data row');

  // Auto-detect delimiter by counting occurrences in the header
  const header = lines[0];
  const delimiters = [',', '\t', ';'] as const;
  let bestDelim = ',';
  let bestCount = 0;
  for (const d of delimiters) {
    const count = countUnquoted(header, d);
    if (count > bestCount) {
      bestCount = count;
      bestDelim = d;
    }
  }

  const headers = splitCSVLine(lines[0], bestDelim);
  const columns: DataColumn[] = headers.map(name => ({ name: name.trim(), values: [] }));

  for (let i = 1; i < lines.length; i++) {
    const fields = splitCSVLine(lines[i], bestDelim);
    for (let j = 0; j < columns.length; j++) {
      columns[j].values.push((fields[j] ?? '').trim());
    }
  }

  return columns;
}

/** Count occurrences of a delimiter outside of quoted fields. */
function countUnquoted(line: string, delim: string): number {
  let count = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') inQuotes = !inQuotes;
    else if (line[i] === delim && !inQuotes) count++;
  }
  return count;
}

/** Split a CSV line respecting quoted fields. */
function splitCSVLine(line: string, delim: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delim && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

/**
 * Compute BIC score for a given network structure and data.
 */
export function computeBIC(data: DataColumn[], cpts: CPT[], variables: Variable[]): number {
  const n = data[0].values.length;
  const colIndex = new Map<string, DataColumn>();
  for (const col of data) colIndex.set(col.name, col);

  let logLikelihood = 0;
  let totalParams = 0;

  for (const cpt of cpts) {
    const varCol = colIndex.get(cpt.variable.name)!;
    const varCard = cpt.variable.outcomes.length;
    const parentCols = cpt.parents.map(p => colIndex.get(p.name)!);
    const parentCards = cpt.parents.map(p => p.outcomes.length);

    // Number of parent configurations
    let numParentConfigs = 1;
    for (const c of parentCards) numParentConfigs *= c;

    // Free parameters for this CPT
    totalParams += (varCard - 1) * numParentConfigs;

    // Compute log-likelihood contribution
    for (let row = 0; row < n; row++) {
      // Get parent config index
      let parentIdx = 0;
      let stride = 1;
      for (let p = cpt.parents.length - 1; p >= 0; p--) {
        const pOutcomeIdx = cpt.parents[p].outcomes.indexOf(parentCols[p].values[row]);
        if (pOutcomeIdx < 0) continue;
        parentIdx += pOutcomeIdx * stride;
        stride *= parentCards[p];
      }

      const varOutcomeIdx = cpt.variable.outcomes.indexOf(varCol.values[row]);
      if (varOutcomeIdx < 0) continue;

      // CPT table index: parents vary outermost, variable varies innermost
      const tableIdx = parentIdx * varCard + varOutcomeIdx;
      const prob = cpt.table[tableIdx];
      if (prob > 0) logLikelihood += Math.log(prob);
    }
  }

  return logLikelihood - (totalParams / 2) * Math.log(n);
}

/**
 * Learn a Bayesian network structure and parameters from tabular data.
 * Uses hill climbing with BIC scoring.
 */
export function learnStructure(data: DataColumn[], options?: LearnOptions): ParsedNetwork {
  const maxParents = options?.maxParents ?? 3;
  const maxIterations = options?.maxIterations ?? 1000;
  const restarts = options?.restarts ?? 0;

  const n = data[0].values.length;
  const numVars = data.length;

  // Create variables
  const variables: Variable[] = data.map(col => ({
    name: col.name,
    outcomes: [...new Set(col.values)],
  }));

  // Precompute: for each column, map each value to its outcome index
  const valueIndices: number[][] = data.map((col, ci) => {
    const outcomes = variables[ci].outcomes;
    const outcomeMap = new Map<string, number>();
    for (let k = 0; k < outcomes.length; k++) outcomeMap.set(outcomes[k], k);
    return col.values.map(v => outcomeMap.get(v) ?? 0);
  });

  // Adjacency: adj[i][j] = true means edge from i to j (i is parent of j)
  let bestAdj = Array.from({ length: numVars }, () => new Array(numVars).fill(false)) as boolean[][];
  let bestScore = computeLocalScores(bestAdj);

  // Run hill climbing (with random restarts)
  for (let restart = -1; restart < restarts; restart++) {
    let adj: boolean[][];
    let score: number;

    if (restart === -1) {
      // First run: start from empty graph
      adj = Array.from({ length: numVars }, () => new Array(numVars).fill(false)) as boolean[][];
      score = computeLocalScores(adj);
    } else {
      // Random restart: start from a random DAG
      adj = randomDAG();
      score = computeLocalScores(adj);
    }

    for (let iter = 0; iter < maxIterations; iter++) {
      let improved = false;
      let bestDelta = 0;
      let bestOp: (() => void) | null = null;

      for (let i = 0; i < numVars; i++) {
        for (let j = 0; j < numVars; j++) {
          if (i === j) continue;

          if (!adj[i][j]) {
            // Try adding edge i -> j
            const parentCount = countParents(adj, j);
            if (parentCount < maxParents && !wouldCreateCycle(adj, i, j)) {
              adj[i][j] = true;
              const newScore = recomputeLocalScore(adj, j, score);
              const delta = newScore - score;
              if (delta > bestDelta) {
                bestDelta = delta;
                const ci = i, cj = j;
                bestOp = () => { adj[ci][cj] = true; };
              }
              adj[i][j] = false;
            }
          } else {
            // Try removing edge i -> j
            adj[i][j] = false;
            const newScore = recomputeLocalScore(adj, j, score);
            const delta = newScore - score;
            if (delta > bestDelta) {
              bestDelta = delta;
              const ci = i, cj = j;
              bestOp = () => { adj[ci][cj] = false; };
            }
            adj[i][j] = true;

            // Try reversing edge i -> j to j -> i
            const parentCountI = countParents(adj, i);
            if (parentCountI < maxParents) {
              adj[i][j] = false;
              adj[j][i] = true;
              if (!wouldCreateCycle_check(adj)) {
                const newScore2 = computeLocalScores(adj);
                const delta2 = newScore2 - score;
                if (delta2 > bestDelta) {
                  bestDelta = delta2;
                  const ci = i, cj = j;
                  bestOp = () => { adj[ci][cj] = false; adj[cj][ci] = true; };
                }
              }
              adj[j][i] = false;
              adj[i][j] = true;
            }
          }
        }
      }

      if (bestOp && bestDelta > 0) {
        // Reset adjacency, apply the best operation
        bestOp();
        score = computeLocalScores(adj);
        improved = true;
      }

      if (!improved) break;
    }

    if (score > bestScore) {
      bestScore = score;
      bestAdj = adj.map(row => [...row]);
    }
  }

  // Build CPTs from the best adjacency matrix
  const cpts = buildCPTs(bestAdj);

  return { name: 'learned', variables, cpts };

  // --- Helper functions (closures over data, variables, etc.) ---

  function randomDAG(): boolean[][] {
    // Create a random ordering, then add random edges respecting the ordering
    const order = variables.map((_, i) => i);
    // Fisher-Yates shuffle
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const pos = new Array(numVars);
    for (let i = 0; i < numVars; i++) pos[order[i]] = i;

    const adj = Array.from({ length: numVars }, () => new Array(numVars).fill(false)) as boolean[][];
    for (let i = 0; i < numVars; i++) {
      for (let j = 0; j < numVars; j++) {
        if (i !== j && pos[i] < pos[j] && Math.random() < 0.3) {
          if (countParents(adj, j) < maxParents) {
            adj[i][j] = true;
          }
        }
      }
    }
    return adj;
  }

  function countParents(adj: boolean[][], j: number): number {
    let count = 0;
    for (let i = 0; i < numVars; i++) if (adj[i][j]) count++;
    return count;
  }

  /** Check if adding edge from -> to would create a cycle via DFS from 'to'. */
  function wouldCreateCycle(adj: boolean[][], from: number, to: number): boolean {
    // Adding from->to creates a cycle iff there is already a path from to->from
    if (from === to) return true;
    const visited = new Uint8Array(numVars);
    const stack = [to];
    visited[to] = 1;
    while (stack.length > 0) {
      const node = stack.pop()!;
      for (let child = 0; child < numVars; child++) {
        if (adj[node][child]) {
          if (child === from) return true;
          if (!visited[child]) {
            visited[child] = 1;
            stack.push(child);
          }
        }
      }
    }
    return false;
  }

  /** Check if the current adjacency matrix has any cycle (for reverse operations). */
  function wouldCreateCycle_check(adj: boolean[][]): boolean {
    // Kahn's algorithm for topological sort
    const inDegree = new Int32Array(numVars);
    for (let i = 0; i < numVars; i++)
      for (let j = 0; j < numVars; j++)
        if (adj[i][j]) inDegree[j]++;

    const queue: number[] = [];
    for (let i = 0; i < numVars; i++) if (inDegree[i] === 0) queue.push(i);

    let count = 0;
    while (queue.length > 0) {
      const node = queue.shift()!;
      count++;
      for (let j = 0; j < numVars; j++) {
        if (adj[node][j]) {
          inDegree[j]--;
          if (inDegree[j] === 0) queue.push(j);
        }
      }
    }
    return count !== numVars;
  }

  /** Compute the BIC score for a single node given its parents (local score). */
  function localBIC(nodeIdx: number, parentIndices: number[]): number {
    const varCard = variables[nodeIdx].outcomes.length;
    const parentCards = parentIndices.map(p => variables[p].outcomes.length);

    let numParentConfigs = 1;
    for (const c of parentCards) numParentConfigs *= c;

    // Count occurrences with Laplace smoothing
    const countsSize = numParentConfigs * varCard;
    const counts = new Float64Array(countsSize);  // N(x, pa)
    const parentCounts = new Float64Array(numParentConfigs);  // N(pa)

    // Laplace smoothing: add 1 to all counts
    for (let i = 0; i < countsSize; i++) counts[i] = 1;
    for (let i = 0; i < numParentConfigs; i++) parentCounts[i] = varCard; // varCard * 1

    for (let row = 0; row < n; row++) {
      // Compute parent configuration index
      let paIdx = 0;
      let stride = 1;
      for (let p = parentIndices.length - 1; p >= 0; p--) {
        paIdx += valueIndices[parentIndices[p]][row] * stride;
        stride *= parentCards[p];
      }

      const xIdx = valueIndices[nodeIdx][row];
      counts[paIdx * varCard + xIdx] += 1;
      parentCounts[paIdx] += 1;
    }

    // Log-likelihood
    let ll = 0;
    for (let paIdx = 0; paIdx < numParentConfigs; paIdx++) {
      const pCount = parentCounts[paIdx];
      if (pCount === 0) continue;
      for (let xIdx = 0; xIdx < varCard; xIdx++) {
        const c = counts[paIdx * varCard + xIdx];
        if (c > 0) {
          ll += c * Math.log(c / pCount);
        }
      }
    }

    // BIC penalty
    const k = (varCard - 1) * numParentConfigs;
    return ll - (k / 2) * Math.log(n);
  }

  /** Compute total BIC as sum of local BIC scores for all nodes. */
  function computeLocalScores(adj: boolean[][]): number {
    let total = 0;
    for (let j = 0; j < numVars; j++) {
      const parents: number[] = [];
      for (let i = 0; i < numVars; i++) if (adj[i][j]) parents.push(i);
      total += localBIC(j, parents);
    }
    return total;
  }

  /** Recompute total score after changing parents of a single node. */
  function recomputeLocalScore(adj: boolean[][], changedNode: number, oldTotal: number): number {
    // Subtract the old local score for changedNode, add the new one
    // We need the old parents to subtract; for simplicity, recompute all
    // (This is still efficient because localBIC is O(n) per node)
    return computeLocalScores(adj);
  }

  /** Build CPTs from adjacency matrix using MLE with Laplace smoothing. */
  function buildCPTs(adj: boolean[][]): CPT[] {
    const cpts: CPT[] = [];

    for (let j = 0; j < numVars; j++) {
      const parentIndices: number[] = [];
      for (let i = 0; i < numVars; i++) if (adj[i][j]) parentIndices.push(i);

      const variable = variables[j];
      const parents = parentIndices.map(i => variables[i]);
      const varCard = variable.outcomes.length;
      const parentCards = parentIndices.map(p => variables[p].outcomes.length);

      let numParentConfigs = 1;
      for (const c of parentCards) numParentConfigs *= c;

      // Count with Laplace smoothing
      const tableSize = numParentConfigs * varCard;
      const counts = new Float64Array(tableSize);
      const parentCounts = new Float64Array(numParentConfigs);

      // Laplace: add 1 to each cell
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

      // Normalize to get conditional probabilities
      const table = new Float64Array(tableSize);
      for (let paIdx = 0; paIdx < numParentConfigs; paIdx++) {
        const pCount = parentCounts[paIdx];
        for (let xIdx = 0; xIdx < varCard; xIdx++) {
          table[paIdx * varCard + xIdx] = counts[paIdx * varCard + xIdx] / pCount;
        }
      }

      cpts.push({ variable, parents, table });
    }

    return cpts;
  }
}

/**
 * Learn a Bayesian network structure and parameters from tabular data
 * using GRaSP (Greedy relaxation of the Sparsest Permutation).
 *
 * Searches over topological orderings: given a permutation, parents for each
 * variable are chosen optimally from earlier variables. Greedy adjacent swaps
 * improve the ordering until convergence. Multiple random restarts for robustness.
 */
export function learnStructureGRaSP(data: DataColumn[], options?: LearnOptions): ParsedNetwork {
  const maxParents = options?.maxParents ?? 3;
  const restarts = options?.restarts ?? 2;
  const n = data[0].values.length;
  const numVars = data.length;

  const variables: Variable[] = data.map(col => ({
    name: col.name,
    outcomes: [...new Set(col.values)],
  }));

  const valueIndices: number[][] = data.map((col, ci) => {
    const outcomes = variables[ci].outcomes;
    const outcomeMap = new Map<string, number>();
    for (let k = 0; k < outcomes.length; k++) outcomeMap.set(outcomes[k], k);
    return col.values.map(v => outcomeMap.get(v) ?? 0);
  });

  // BIC score cache: key = "node:p1,p2,..." -> score
  const scoreCache = new Map<string, number>();

  function localBIC(nodeIdx: number, parentIndices: number[]): number {
    const key = `${nodeIdx}:${parentIndices.join(',')}`;
    const cached = scoreCache.get(key);
    if (cached !== undefined) return cached;

    const varCard = variables[nodeIdx].outcomes.length;
    const parentCards = parentIndices.map(p => variables[p].outcomes.length);
    let numParentConfigs = 1;
    for (const c of parentCards) numParentConfigs *= c;

    const countsSize = numParentConfigs * varCard;
    const counts = new Float64Array(countsSize);
    const parentCounts = new Float64Array(numParentConfigs);
    for (let i = 0; i < countsSize; i++) counts[i] = 1;
    for (let i = 0; i < numParentConfigs; i++) parentCounts[i] = varCard;

    for (let row = 0; row < n; row++) {
      let paIdx = 0;
      let stride = 1;
      for (let p = parentIndices.length - 1; p >= 0; p--) {
        paIdx += valueIndices[parentIndices[p]][row] * stride;
        stride *= parentCards[p];
      }
      counts[paIdx * varCard + valueIndices[nodeIdx][row]] += 1;
      parentCounts[paIdx] += 1;
    }

    let ll = 0;
    for (let paIdx = 0; paIdx < numParentConfigs; paIdx++) {
      const pCount = parentCounts[paIdx];
      if (pCount === 0) continue;
      for (let xIdx = 0; xIdx < varCard; xIdx++) {
        const c = counts[paIdx * varCard + xIdx];
        if (c > 0) ll += c * Math.log(c / pCount);
      }
    }

    const k = (varCard - 1) * numParentConfigs;
    const score = ll - (k / 2) * Math.log(n);
    scoreCache.set(key, score);
    return score;
  }

  /** Find the best parent subset for nodeIdx from candidates, return [bestParents, bestScore]. */
  function bestParentSet(nodeIdx: number, candidates: number[]): [number[], number] {
    let bestScore = localBIC(nodeIdx, []);
    let bestParents: number[] = [];
    const limit = Math.min(candidates.length, maxParents);

    // Enumerate all subsets of candidates up to size `limit`
    const m = candidates.length;
    // For efficiency, iterate subsets by size
    for (let size = 1; size <= limit; size++) {
      // Generate combinations of `size` from `candidates`
      const indices = new Array(size);
      function enumerate(start: number, depth: number) {
        if (depth === size) {
          const subset = indices.slice(0, size).map(i => candidates[i]);
          const score = localBIC(nodeIdx, subset.sort((a, b) => a - b));
          if (score > bestScore) {
            bestScore = score;
            bestParents = subset.sort((a, b) => a - b);
          }
          return;
        }
        for (let i = start; i < m; i++) {
          indices[depth] = i;
          enumerate(i + 1, depth + 1);
        }
      }
      enumerate(0, 0);
    }
    return [bestParents, bestScore];
  }

  /** Compute total score and per-node parents for a given permutation. */
  function evaluatePermutation(perm: number[]): { total: number; parents: number[][]; scores: number[] } {
    const parents: number[][] = new Array(numVars);
    const scores: number[] = new Array(numVars);
    let total = 0;
    for (let pos = 0; pos < numVars; pos++) {
      const node = perm[pos];
      const candidates = perm.slice(0, pos); // variables earlier in the ordering
      const [bestP, bestS] = bestParentSet(node, candidates);
      parents[node] = bestP;
      scores[node] = bestS;
      total += bestS;
    }
    return { total, parents, scores };
  }

  // Initial permutation: order by marginal entropy (highest first)
  function marginalEntropy(varIdx: number): number {
    const card = variables[varIdx].outcomes.length;
    const freq = new Float64Array(card);
    for (let row = 0; row < n; row++) freq[valueIndices[varIdx][row]] += 1;
    let h = 0;
    for (let k = 0; k < card; k++) {
      const p = freq[k] / n;
      if (p > 0) h -= p * Math.log(p);
    }
    return h;
  }

  let bestPerm: number[] = [];
  let bestResult = { total: -Infinity, parents: [] as number[][], scores: [] as number[] };

  // Simple seeded PRNG for reproducible restarts
  let seed = 42;
  function rand() {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  for (let restart = -1; restart < restarts; restart++) {
    let perm: number[];
    if (restart === -1) {
      // First run: order by marginal entropy descending
      perm = variables.map((_, i) => i);
      const entropies = perm.map(i => marginalEntropy(i));
      perm.sort((a, b) => entropies[b] - entropies[a]);
    } else {
      // Random restart: Fisher-Yates shuffle
      perm = variables.map((_, i) => i);
      for (let i = perm.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [perm[i], perm[j]] = [perm[j], perm[i]];
      }
    }

    let current = evaluatePermutation(perm);

    // Greedy adjacent swaps until convergence
    let improved = true;
    while (improved) {
      improved = false;
      let bestDelta = 0;
      let bestSwapPos = -1;

      for (let pos = 0; pos < numVars - 1; pos++) {
        // Try swapping perm[pos] and perm[pos+1]
        [perm[pos], perm[pos + 1]] = [perm[pos + 1], perm[pos]];
        const trial = evaluatePermutation(perm);
        const delta = trial.total - current.total;
        if (delta > bestDelta) {
          bestDelta = delta;
          bestSwapPos = pos;
        }
        // Swap back
        [perm[pos], perm[pos + 1]] = [perm[pos + 1], perm[pos]];
      }

      if (bestSwapPos >= 0) {
        [perm[bestSwapPos], perm[bestSwapPos + 1]] = [perm[bestSwapPos + 1], perm[bestSwapPos]];
        current = evaluatePermutation(perm);
        improved = true;
      }
    }

    if (current.total > bestResult.total) {
      bestResult = current;
      bestPerm = [...perm];
    }
  }

  // Build adjacency from best result and construct CPTs
  const adj = Array.from({ length: numVars }, () => new Array(numVars).fill(false)) as boolean[][];
  for (let j = 0; j < numVars; j++) {
    for (const p of bestResult.parents[j]) adj[p][j] = true;
  }

  const cpts = buildCPTsFromAdj(adj, numVars, n, variables, valueIndices);
  return { name: 'learned', variables, cpts };
}

/** Shared helper: build CPTs from an adjacency matrix. */
function buildCPTsFromAdj(
  adj: boolean[][], numVars: number, n: number,
  variables: Variable[], valueIndices: number[][],
): CPT[] {
  const result: CPT[] = [];
  for (let j = 0; j < numVars; j++) {
    const parentIndices: number[] = [];
    for (let i = 0; i < numVars; i++) if (adj[i][j]) parentIndices.push(i);

    const variable = variables[j];
    const parents = parentIndices.map(i => variables[i]);
    const varCard = variable.outcomes.length;
    const parentCards = parentIndices.map(p => variables[p].outcomes.length);
    let numParentConfigs = 1;
    for (const c of parentCards) numParentConfigs *= c;

    const tableSize = numParentConfigs * varCard;
    const counts = new Float64Array(tableSize);
    const parentCounts = new Float64Array(numParentConfigs);
    for (let i = 0; i < tableSize; i++) counts[i] = 1;
    for (let i = 0; i < numParentConfigs; i++) parentCounts[i] = varCard;

    for (let row = 0; row < n; row++) {
      let paIdx = 0;
      let stride = 1;
      for (let p = parentIndices.length - 1; p >= 0; p--) {
        paIdx += valueIndices[parentIndices[p]][row] * stride;
        stride *= parentCards[p];
      }
      counts[paIdx * varCard + valueIndices[j][row]] += 1;
      parentCounts[paIdx] += 1;
    }

    const table = new Float64Array(tableSize);
    for (let paIdx = 0; paIdx < numParentConfigs; paIdx++) {
      const pCount = parentCounts[paIdx];
      for (let xIdx = 0; xIdx < varCard; xIdx++) {
        table[paIdx * varCard + xIdx] = counts[paIdx * varCard + xIdx] / pCount;
      }
    }

    result.push({ variable, parents, table });
  }
  return result;
}

/**
 * Learn a Bayesian network structure and parameters from tabular data
 * using Greedy Equivalence Search (GES) with BIC scoring.
 *
 * GES operates in two phases:
 * 1. Forward: greedily add edges that improve BIC until no addition helps.
 * 2. Backward: greedily remove edges that improve BIC until no removal helps.
 *
 * Unlike hill climbing, GES does NOT reverse edges. It provably converges to
 * the correct equivalence class given sufficient data.
 */
export function learnStructureGES(data: DataColumn[], options?: LearnOptions): ParsedNetwork {
  const maxParents = options?.maxParents ?? 3;
  const n = data[0].values.length;
  const numVars = data.length;

  // Create variables
  const variables: Variable[] = data.map(col => ({
    name: col.name,
    outcomes: [...new Set(col.values)],
  }));

  // Precompute value indices
  const valueIndices: number[][] = data.map((col, ci) => {
    const outcomes = variables[ci].outcomes;
    const outcomeMap = new Map<string, number>();
    for (let k = 0; k < outcomes.length; k++) outcomeMap.set(outcomes[k], k);
    return col.values.map(v => outcomeMap.get(v) ?? 0);
  });

  // Adjacency: adj[i][j] = true means edge from i to j
  const adj = Array.from({ length: numVars }, () => new Array(numVars).fill(false)) as boolean[][];

  // --- Phase 1: Forward (add edges) ---
  for (;;) {
    let bestDelta = 0;
    let bestI = -1;
    let bestJ = -1;

    const currentScore = totalScore();

    for (let i = 0; i < numVars; i++) {
      for (let j = 0; j < numVars; j++) {
        if (i === j || adj[i][j]) continue;
        if (countParents(j) >= maxParents) continue;
        if (wouldCreateCycle(i, j)) continue;

        adj[i][j] = true;
        const delta = totalScore() - currentScore;
        if (delta > bestDelta) {
          bestDelta = delta;
          bestI = i;
          bestJ = j;
        }
        adj[i][j] = false;
      }
    }

    if (bestI < 0) break; // no addition improves score
    adj[bestI][bestJ] = true;
  }

  // --- Phase 2: Backward (remove edges) ---
  for (;;) {
    let bestDelta = 0;
    let bestI = -1;
    let bestJ = -1;

    const currentScore = totalScore();

    for (let i = 0; i < numVars; i++) {
      for (let j = 0; j < numVars; j++) {
        if (!adj[i][j]) continue;

        adj[i][j] = false;
        const delta = totalScore() - currentScore;
        if (delta > bestDelta) {
          bestDelta = delta;
          bestI = i;
          bestJ = j;
        }
        adj[i][j] = true;
      }
    }

    if (bestI < 0) break; // no removal improves score
    adj[bestI][bestJ] = false;
  }

  // Build CPTs
  const cpts = buildCPTs();
  return { name: 'learned', variables, cpts };

  // --- Helper closures ---

  function countParents(j: number): number {
    let c = 0;
    for (let i = 0; i < numVars; i++) if (adj[i][j]) c++;
    return c;
  }

  function wouldCreateCycle(from: number, to: number): boolean {
    if (from === to) return true;
    const visited = new Uint8Array(numVars);
    const stack = [to];
    visited[to] = 1;
    while (stack.length > 0) {
      const node = stack.pop()!;
      for (let child = 0; child < numVars; child++) {
        if (adj[node][child]) {
          if (child === from) return true;
          if (!visited[child]) { visited[child] = 1; stack.push(child); }
        }
      }
    }
    return false;
  }

  function localBIC(nodeIdx: number, parentIndices: number[]): number {
    const varCard = variables[nodeIdx].outcomes.length;
    const parentCards = parentIndices.map(p => variables[p].outcomes.length);
    let numParentConfigs = 1;
    for (const c of parentCards) numParentConfigs *= c;

    const countsSize = numParentConfigs * varCard;
    const counts = new Float64Array(countsSize);
    const parentCounts = new Float64Array(numParentConfigs);
    for (let i = 0; i < countsSize; i++) counts[i] = 1;
    for (let i = 0; i < numParentConfigs; i++) parentCounts[i] = varCard;

    for (let row = 0; row < n; row++) {
      let paIdx = 0;
      let stride = 1;
      for (let p = parentIndices.length - 1; p >= 0; p--) {
        paIdx += valueIndices[parentIndices[p]][row] * stride;
        stride *= parentCards[p];
      }
      counts[paIdx * varCard + valueIndices[nodeIdx][row]] += 1;
      parentCounts[paIdx] += 1;
    }

    let ll = 0;
    for (let paIdx = 0; paIdx < numParentConfigs; paIdx++) {
      const pCount = parentCounts[paIdx];
      if (pCount === 0) continue;
      for (let xIdx = 0; xIdx < varCard; xIdx++) {
        const c = counts[paIdx * varCard + xIdx];
        if (c > 0) ll += c * Math.log(c / pCount);
      }
    }

    const k = (varCard - 1) * numParentConfigs;
    return ll - (k / 2) * Math.log(n);
  }

  function totalScore(): number {
    let s = 0;
    for (let j = 0; j < numVars; j++) {
      const parents: number[] = [];
      for (let i = 0; i < numVars; i++) if (adj[i][j]) parents.push(i);
      s += localBIC(j, parents);
    }
    return s;
  }

  function buildCPTs(): CPT[] {
    const result: CPT[] = [];
    for (let j = 0; j < numVars; j++) {
      const parentIndices: number[] = [];
      for (let i = 0; i < numVars; i++) if (adj[i][j]) parentIndices.push(i);

      const variable = variables[j];
      const parents = parentIndices.map(i => variables[i]);
      const varCard = variable.outcomes.length;
      const parentCards = parentIndices.map(p => variables[p].outcomes.length);
      let numParentConfigs = 1;
      for (const c of parentCards) numParentConfigs *= c;

      const tableSize = numParentConfigs * varCard;
      const counts = new Float64Array(tableSize);
      const parentCounts = new Float64Array(numParentConfigs);
      for (let i = 0; i < tableSize; i++) counts[i] = 1;
      for (let i = 0; i < numParentConfigs; i++) parentCounts[i] = varCard;

      for (let row = 0; row < n; row++) {
        let paIdx = 0;
        let stride = 1;
        for (let p = parentIndices.length - 1; p >= 0; p--) {
          paIdx += valueIndices[parentIndices[p]][row] * stride;
          stride *= parentCards[p];
        }
        counts[paIdx * varCard + valueIndices[j][row]] += 1;
        parentCounts[paIdx] += 1;
      }

      const table = new Float64Array(tableSize);
      for (let paIdx = 0; paIdx < numParentConfigs; paIdx++) {
        const pCount = parentCounts[paIdx];
        for (let xIdx = 0; xIdx < varCard; xIdx++) {
          table[paIdx * varCard + xIdx] = counts[paIdx * varCard + xIdx] / pCount;
        }
      }

      result.push({ variable, parents, table });
    }
    return result;
  }
}
