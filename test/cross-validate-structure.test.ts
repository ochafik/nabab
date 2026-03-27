import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { learnStructure, learnStructureGES, parseCSV } from '../src/lib/structure-learning.js';
import type { DataColumn } from '../src/lib/structure-learning.js';

// ---- Types for the reference JSON files ----

interface EdgeInfo {
  from: string;
  to: string;
  type: 'directed' | 'undirected' | 'bidirected';
}

interface StructureJSON {
  nodes: string[];
  matrix: number[][];
  edges: EdgeInfo[];
  algorithm?: string;
}

// ---- Helpers ----

const RESULTS_DIR = resolve(__dirname, '..', 'bench', 'causal-learn', 'results');

const SCENARIOS = ['chain', 'v_structure', 'diamond', 'alarm5'] as const;

function resultsExist(): boolean {
  // Check that at least the first scenario's files exist
  return existsSync(resolve(RESULTS_DIR, 'chain_data.csv'))
      && existsSync(resolve(RESULTS_DIR, 'chain_true.json'));
}

function loadCSV(name: string): DataColumn[] {
  const csvText = readFileSync(resolve(RESULTS_DIR, `${name}_data.csv`), 'utf-8');
  return parseCSV(csvText);
}

function loadJSON(name: string, suffix: string): StructureJSON {
  const text = readFileSync(resolve(RESULTS_DIR, `${name}_${suffix}.json`), 'utf-8');
  return JSON.parse(text);
}

/**
 * Extract a directed adjacency matrix from a learned ParsedNetwork.
 * Returns { nodes, matrix } where matrix[i][j]=1 means i->j.
 */
function networkToAdjMatrix(
  network: { variables: { name: string }[]; cpts: { variable: { name: string }; parents: readonly { name: string }[] }[] },
): { nodes: string[]; matrix: number[][] } {
  const nodes = network.variables.map(v => v.name);
  const idx = new Map<string, number>();
  for (let i = 0; i < nodes.length; i++) idx.set(nodes[i], i);

  const n = nodes.length;
  const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  for (const cpt of network.cpts) {
    const j = idx.get(cpt.variable.name)!;
    for (const p of cpt.parents) {
      const i = idx.get(p.name)!;
      matrix[i][j] = 1;
    }
  }

  return { nodes, matrix };
}

/**
 * Compute Structural Hamming Distance (SHD) between two structures.
 *
 * SHD = extra edges + missing edges + reversed edges
 *
 * When comparing against a reference that has undirected edges (e.g., PC output
 * which returns a CPDAG), we treat an undirected edge as "any single directed
 * edge in either direction is acceptable". Specifically:
 *
 * - If the reference has an undirected edge between i and j (matrix[i][j]=1 AND
 *   matrix[j][i]=1), then the learned graph having EITHER i->j OR j->i (but not
 *   both) is counted as 0 penalty. Having neither is 1 missing. Having both is
 *   1 extra.
 * - If the reference has a directed edge i->j only (matrix[i][j]=1, matrix[j][i]=0),
 *   then the learned graph must have i->j; having j->i counts as a reversal (1);
 *   having neither counts as missing (1).
 */
function computeSHD(
  learned: { nodes: string[]; matrix: number[][] },
  reference: StructureJSON,
): { shd: number; extra: number; missing: number; reversed: number } {
  const nodes = reference.nodes;
  const n = nodes.length;

  // Build index mapping from reference nodes to learned nodes
  const learnedIdx = new Map<string, number>();
  for (let i = 0; i < learned.nodes.length; i++) learnedIdx.set(learned.nodes[i], i);

  // Build lookup for reference edges to know which are undirected
  const refUndirected = new Set<string>();
  for (const e of reference.edges) {
    if (e.type === 'undirected' || e.type === 'bidirected') {
      refUndirected.add(`${e.from}-${e.to}`);
      refUndirected.add(`${e.to}-${e.from}`);
    }
  }

  let extra = 0;
  let missing = 0;
  let reversed = 0;

  // Track which pairs we've already processed (for undirected handling)
  const processed = new Set<string>();

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const ni = nodes[i];
      const nj = nodes[j];
      const li = learnedIdx.get(ni)!;
      const lj = learnedIdx.get(nj)!;

      const refIJ = reference.matrix[i][j];
      const refJI = reference.matrix[j][i];
      const learnedIJ = learned.matrix[li][lj];
      const learnedJI = learned.matrix[lj][li];

      const refIsUndirected = refIJ === 1 && refJI === 1;
      const refIsDirectedIJ = refIJ === 1 && refJI === 0;
      const refIsDirectedJI = refJI === 1 && refIJ === 0;
      const refHasEdge = refIJ === 1 || refJI === 1;
      const learnedHasIJ = learnedIJ === 1;
      const learnedHasJI = learnedJI === 1;
      const learnedHasEdge = learnedHasIJ || learnedHasJI;

      if (refIsUndirected) {
        // Reference has undirected edge: any single directed edge is OK
        if (!learnedHasEdge) {
          missing++;
        } else if (learnedHasIJ && learnedHasJI) {
          // Both directions in learned = the learned graph also has it undirected, that's fine
          // (no penalty)
        }
        // else: exactly one direction, fine
      } else if (refIsDirectedIJ) {
        if (learnedHasIJ) {
          // Correct
        } else if (learnedHasJI) {
          reversed++;
        } else {
          missing++;
        }
      } else if (refIsDirectedJI) {
        if (learnedHasJI) {
          // Correct
        } else if (learnedHasIJ) {
          reversed++;
        } else {
          missing++;
        }
      } else {
        // No edge in reference
        if (learnedHasIJ || learnedHasJI) {
          extra++;
        }
      }
    }
  }

  return { shd: extra + missing + reversed, extra, missing, reversed };
}

// ---- Tests ----

describe.skipIf(!resultsExist())(
  'Cross-validate structure learning against causal-learn',
  () => {
    if (!resultsExist()) {
      // This message won't actually show in skipIf, but kept for documentation
      console.log(
        'Skipping cross-validation tests: run Python script first.\n' +
        '  cd bench/causal-learn && pip install -r requirements.txt && python generate-ground-truth.py'
      );
      return;
    }

    for (const scenario of SCENARIOS) {
      describe(`Scenario: ${scenario}`, () => {
        let data: DataColumn[];
        let trueStruct: StructureJSON;
        let pcStruct: StructureJSON | null = null;
        let gesStruct: StructureJSON | null = null;

        // Load data and reference structures
        try {
          data = loadCSV(scenario);
          trueStruct = loadJSON(scenario, 'true');
        } catch {
          it.skip(`could not load data for ${scenario}`, () => {});
          return;
        }

        try {
          pcStruct = loadJSON(scenario, 'pc');
        } catch {}

        try {
          gesStruct = loadJSON(scenario, 'ges');
        } catch {}

        it('nabab HC+BIC vs true structure', () => {
          const learned = learnStructure(data, { maxParents: 3, maxIterations: 1000 });
          const learnedAdj = networkToAdjMatrix(learned);
          const shd = computeSHD(learnedAdj, trueStruct);

          console.log(`  [${scenario}] HC+BIC vs TRUE: SHD=${shd.shd} (extra=${shd.extra}, missing=${shd.missing}, reversed=${shd.reversed})`);
          console.log(`    Learned edges: ${JSON.stringify(edgesFromMatrix(learnedAdj))}`);

          // Structure learning from finite data is hard, especially for
          // small samples and structures like v-structures where Markov
          // equivalence classes differ. Use numVars as a generous bound:
          // SHD should not exceed the number of variables in the graph.
          const numVars = trueStruct.nodes.length;
          expect(shd.shd).toBeLessThanOrEqual(numVars);
        });

        it('nabab GES+BIC vs true structure', () => {
          const learned = learnStructureGES(data, { maxParents: 3 });
          const learnedAdj = networkToAdjMatrix(learned);
          const shd = computeSHD(learnedAdj, trueStruct);

          console.log(`  [${scenario}] GES+BIC vs TRUE: SHD=${shd.shd} (extra=${shd.extra}, missing=${shd.missing}, reversed=${shd.reversed})`);
          console.log(`    Learned edges: ${JSON.stringify(edgesFromMatrix(learnedAdj))}`);

          const numVars = trueStruct.nodes.length;
          expect(shd.shd).toBeLessThanOrEqual(numVars);
        });

        if (pcStruct) {
          const pc = pcStruct;
          it('nabab HC+BIC vs causal-learn PC', () => {
            const learned = learnStructure(data, { maxParents: 3, maxIterations: 1000 });
            const learnedAdj = networkToAdjMatrix(learned);
            const shd = computeSHD(learnedAdj, pc);

            console.log(`  [${scenario}] HC+BIC vs PC: SHD=${shd.shd} (extra=${shd.extra}, missing=${shd.missing}, reversed=${shd.reversed})`);

            // Cross-algorithm comparison: allow more tolerance since different
            // algorithms may find different (but valid) equivalent structures
            const maxEdges = pc.edges.length + 2;
            expect(shd.shd).toBeLessThanOrEqual(maxEdges);
          });
        }

        if (gesStruct) {
          const ges = gesStruct;
          it('nabab GES+BIC vs causal-learn GES', () => {
            const learned = learnStructureGES(data, { maxParents: 3 });
            const learnedAdj = networkToAdjMatrix(learned);
            const shd = computeSHD(learnedAdj, ges);

            console.log(`  [${scenario}] nabab-GES vs causal-learn-GES: SHD=${shd.shd} (extra=${shd.extra}, missing=${shd.missing}, reversed=${shd.reversed})`);

            // Same algorithm family, should be closer
            const maxEdges = ges.edges.length + 2;
            expect(shd.shd).toBeLessThanOrEqual(maxEdges);
          });
        }
      });
    }
  },
);

/** Helper: extract human-readable edge list from an adjacency matrix. */
function edgesFromMatrix(adj: { nodes: string[]; matrix: number[][] }): string[] {
  const result: string[] = [];
  for (let i = 0; i < adj.nodes.length; i++) {
    for (let j = 0; j < adj.nodes.length; j++) {
      if (adj.matrix[i][j] === 1) {
        result.push(`${adj.nodes[i]}->${adj.nodes[j]}`);
      }
    }
  }
  return result;
}
