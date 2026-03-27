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
