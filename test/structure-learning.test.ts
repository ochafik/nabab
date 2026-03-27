import { describe, it, expect } from 'vitest';
import { parseCSV, learnStructure, learnStructureGES, computeBIC } from '../src/lib/structure-learning.js';
import { BayesianNetwork } from '../src/lib/network.js';
import type { Variable, CPT } from '../src/lib/types.js';
import type { DataColumn } from '../src/lib/structure-learning.js';

// --- Helper: generate data from a known Bayesian network ---
function generateData(variables: Variable[], cpts: CPT[], n: number, seed = 42): DataColumn[] {
  // Simple seeded PRNG (mulberry32)
  let s = seed;
  function rand() {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Topological order: process variables so parents are sampled before children
  const cptMap = new Map<string, CPT>();
  for (const cpt of cpts) cptMap.set(cpt.variable.name, cpt);

  const columns: DataColumn[] = variables.map(v => ({ name: v.name, values: [] }));
  const colMap = new Map<string, DataColumn>();
  for (const col of columns) colMap.set(col.name, col);

  for (let row = 0; row < n; row++) {
    const assignment = new Map<string, number>(); // variable name -> outcome index

    for (const variable of variables) {
      const cpt = cptMap.get(variable.name)!;
      // Compute the parent config index
      let paIdx = 0;
      let stride = 1;
      for (let p = cpt.parents.length - 1; p >= 0; p--) {
        paIdx += assignment.get(cpt.parents[p].name)! * stride;
        stride *= cpt.parents[p].outcomes.length;
      }

      // Sample from conditional distribution
      const varCard = variable.outcomes.length;
      const r = rand();
      let cumulative = 0;
      let sampledIdx = varCard - 1;
      for (let k = 0; k < varCard; k++) {
        cumulative += cpt.table[paIdx * varCard + k];
        if (r < cumulative) {
          sampledIdx = k;
          break;
        }
      }

      assignment.set(variable.name, sampledIdx);
      colMap.get(variable.name)!.values.push(variable.outcomes[sampledIdx]);
    }
  }

  return columns;
}

// ===================== parseCSV tests =====================

describe('parseCSV', () => {
  it('parses a simple comma-delimited CSV', () => {
    const csv = 'A,B,C\n1,2,3\n4,5,6\n';
    const cols = parseCSV(csv);
    expect(cols.length).toBe(3);
    expect(cols[0].name).toBe('A');
    expect(cols[0].values).toEqual(['1', '4']);
    expect(cols[1].values).toEqual(['2', '5']);
    expect(cols[2].values).toEqual(['3', '6']);
  });

  it('parses tab-delimited CSV', () => {
    const csv = 'X\tY\n1\t2\n3\t4\n';
    const cols = parseCSV(csv);
    expect(cols.length).toBe(2);
    expect(cols[0].name).toBe('X');
    expect(cols[0].values).toEqual(['1', '3']);
  });

  it('parses semicolon-delimited CSV', () => {
    const csv = 'X;Y\n1;2\n3;4\n';
    const cols = parseCSV(csv);
    expect(cols.length).toBe(2);
    expect(cols[1].values).toEqual(['2', '4']);
  });

  it('handles quoted fields with commas', () => {
    const csv = 'Name,Value\n"Smith, John",42\nDoe,7\n';
    const cols = parseCSV(csv);
    expect(cols[0].values[0]).toBe('Smith, John');
    expect(cols[1].values[0]).toBe('42');
  });

  it('handles quoted fields with escaped quotes', () => {
    const csv = 'A,B\n"""hello""",world\n';
    const cols = parseCSV(csv);
    expect(cols[0].values[0]).toBe('"hello"');
  });

  it('throws on insufficient data', () => {
    expect(() => parseCSV('A,B')).toThrow();
  });
});

// ===================== Structure learning tests =====================

describe('learnStructure', () => {
  it('recovers a simple Rain -> Wet structure', () => {
    const Rain: Variable = { name: 'Rain', outcomes: ['T', 'F'] };
    const Wet: Variable = { name: 'Wet', outcomes: ['T', 'F'] };
    const cpts: CPT[] = [
      { variable: Rain, parents: [], table: new Float64Array([0.3, 0.7]) },
      { variable: Wet, parents: [Rain], table: new Float64Array([0.9, 0.1, 0.2, 0.8]) },
    ];

    const data = generateData([Rain, Wet], cpts, 2000);
    const result = learnStructure(data);

    // Should have 2 variables
    expect(result.variables.length).toBe(2);

    // Should have an edge between Rain and Wet (in either direction is acceptable)
    const rainCPT = result.cpts.find(c => c.variable.name === 'Rain')!;
    const wetCPT = result.cpts.find(c => c.variable.name === 'Wet')!;

    // At least one should be a parent of the other
    const hasEdge =
      rainCPT.parents.some(p => p.name === 'Wet') ||
      wetCPT.parents.some(p => p.name === 'Rain');
    expect(hasEdge).toBe(true);
  });

  it('learned parameters approximate true CPTs', () => {
    const A: Variable = { name: 'A', outcomes: ['0', '1'] };
    const B: Variable = { name: 'B', outcomes: ['0', '1'] };
    const cpts: CPT[] = [
      { variable: A, parents: [], table: new Float64Array([0.4, 0.6]) },
      { variable: B, parents: [A], table: new Float64Array([0.8, 0.2, 0.3, 0.7]) },
    ];

    const data = generateData([A, B], cpts, 5000);
    const result = learnStructure(data);

    // Find the CPT for the root variable (should have no parents or one parent)
    // Just check that parameters are in the right ballpark
    for (const cpt of result.cpts) {
      // All probabilities should be valid (between 0 and 1)
      for (let i = 0; i < cpt.table.length; i++) {
        expect(cpt.table[i]).toBeGreaterThanOrEqual(0);
        expect(cpt.table[i]).toBeLessThanOrEqual(1);
      }
    }

    // Check the learned network produces reasonable inferences
    const bn = new BayesianNetwork(result);
    const priors = bn.priors();

    // Variable A's marginal should be approximately 0.4 / 0.6
    const aDist = priors.get(bn.variables.find(v => v.name === 'A')!)!;
    expect(aDist.get('0')!).toBeCloseTo(0.4, 1);
    expect(aDist.get('1')!).toBeCloseTo(0.6, 1);
  });

  it('respects maxParents constraint', () => {
    const A: Variable = { name: 'A', outcomes: ['0', '1'] };
    const B: Variable = { name: 'B', outcomes: ['0', '1'] };
    const C: Variable = { name: 'C', outcomes: ['0', '1'] };
    const D: Variable = { name: 'D', outcomes: ['0', '1'] };

    const cpts: CPT[] = [
      { variable: A, parents: [], table: new Float64Array([0.5, 0.5]) },
      { variable: B, parents: [], table: new Float64Array([0.5, 0.5]) },
      { variable: C, parents: [], table: new Float64Array([0.5, 0.5]) },
      { variable: D, parents: [A, B, C], table: new Float64Array([
        0.9, 0.1, 0.8, 0.2, 0.7, 0.3, 0.6, 0.4,
        0.4, 0.6, 0.3, 0.7, 0.2, 0.8, 0.1, 0.9,
      ]) },
    ];

    const data = generateData([A, B, C, D], cpts, 1000);
    const result = learnStructure(data, { maxParents: 1 });

    // Every node should have at most 1 parent
    for (const cpt of result.cpts) {
      expect(cpt.parents.length).toBeLessThanOrEqual(1);
    }
  });

  it('produces acyclic graphs', () => {
    // Generate data with a chain: A -> B -> C
    const A: Variable = { name: 'A', outcomes: ['0', '1'] };
    const B: Variable = { name: 'B', outcomes: ['0', '1'] };
    const C: Variable = { name: 'C', outcomes: ['0', '1'] };

    const cpts: CPT[] = [
      { variable: A, parents: [], table: new Float64Array([0.5, 0.5]) },
      { variable: B, parents: [A], table: new Float64Array([0.9, 0.1, 0.1, 0.9]) },
      { variable: C, parents: [B], table: new Float64Array([0.8, 0.2, 0.2, 0.8]) },
    ];

    const data = generateData([A, B, C], cpts, 1000);
    const result = learnStructure(data);

    // Verify acyclicity: build adjacency and check with topological sort
    const nameToIdx = new Map<string, number>();
    result.variables.forEach((v, i) => nameToIdx.set(v.name, i));

    const n = result.variables.length;
    const inDegree = new Array(n).fill(0);
    for (const cpt of result.cpts) {
      for (const parent of cpt.parents) {
        inDegree[nameToIdx.get(cpt.variable.name)!]++;
      }
    }

    // Kahn's algorithm
    const queue = [];
    for (let i = 0; i < n; i++) if (inDegree[i] === 0) queue.push(i);

    const adj: number[][] = Array.from({ length: n }, () => []);
    for (const cpt of result.cpts) {
      for (const parent of cpt.parents) {
        adj[nameToIdx.get(parent.name)!].push(nameToIdx.get(cpt.variable.name)!);
      }
    }

    const visited = new Set<number>();
    const q = [...queue];
    const inDeg = [...inDegree];
    while (q.length > 0) {
      const node = q.shift()!;
      visited.add(node);
      for (const child of adj[node]) {
        inDeg[child]--;
        if (inDeg[child] === 0) q.push(child);
      }
    }

    expect(visited.size).toBe(n); // All nodes visited => no cycle
  });

  it('learns a 3-variable chain A -> B -> C', () => {
    const A: Variable = { name: 'A', outcomes: ['0', '1'] };
    const B: Variable = { name: 'B', outcomes: ['0', '1'] };
    const C: Variable = { name: 'C', outcomes: ['0', '1'] };

    const cpts: CPT[] = [
      { variable: A, parents: [], table: new Float64Array([0.3, 0.7]) },
      { variable: B, parents: [A], table: new Float64Array([0.9, 0.1, 0.2, 0.8]) },
      { variable: C, parents: [B], table: new Float64Array([0.8, 0.2, 0.1, 0.9]) },
    ];

    const data = generateData([A, B, C], cpts, 3000);
    const result = learnStructure(data);

    // Should have edges. With enough data, the chain structure should be found
    // (though direction might differ due to score equivalence).
    let totalEdges = 0;
    for (const cpt of result.cpts) totalEdges += cpt.parents.length;
    expect(totalEdges).toBeGreaterThanOrEqual(2);

    // B should be connected to both A and C
    const bCPT = result.cpts.find(c => c.variable.name === 'B')!;
    const aCPT = result.cpts.find(c => c.variable.name === 'A')!;
    const cCPT = result.cpts.find(c => c.variable.name === 'C')!;

    // Check connectivity: A-B connected and B-C connected (in either direction)
    const abConnected =
      bCPT.parents.some(p => p.name === 'A') || aCPT.parents.some(p => p.name === 'B');
    const bcConnected =
      cCPT.parents.some(p => p.name === 'B') || bCPT.parents.some(p => p.name === 'C');

    expect(abConnected).toBe(true);
    expect(bcConnected).toBe(true);
  });

  it('learns a 4-variable diamond A->B, A->C, B->D, C->D', () => {
    const A: Variable = { name: 'A', outcomes: ['0', '1'] };
    const B: Variable = { name: 'B', outcomes: ['0', '1'] };
    const C: Variable = { name: 'C', outcomes: ['0', '1'] };
    const D: Variable = { name: 'D', outcomes: ['0', '1'] };

    const cpts: CPT[] = [
      { variable: A, parents: [], table: new Float64Array([0.5, 0.5]) },
      { variable: B, parents: [A], table: new Float64Array([0.8, 0.2, 0.2, 0.8]) },
      { variable: C, parents: [A], table: new Float64Array([0.7, 0.3, 0.3, 0.7]) },
      { variable: D, parents: [B, C], table: new Float64Array([0.9, 0.1, 0.6, 0.4, 0.5, 0.5, 0.1, 0.9]) },
    ];

    const data = generateData([A, B, C, D], cpts, 5000);
    const result = learnStructure(data, { maxParents: 3 });

    // Should find edges (at least 3-4)
    let totalEdges = 0;
    for (const cpt of result.cpts) totalEdges += cpt.parents.length;
    expect(totalEdges).toBeGreaterThanOrEqual(3);

    // The learned network should produce valid inference
    const bn = new BayesianNetwork(result);
    const priors = bn.priors();

    // All distributions should sum to ~1
    for (const [, dist] of priors) {
      let sum = 0;
      for (const [, p] of dist) sum += p;
      expect(sum).toBeCloseTo(1.0, 5);
    }
  });
});

// ===================== computeBIC tests =====================

describe('computeBIC', () => {
  it('returns a finite score for a simple network', () => {
    const A: Variable = { name: 'A', outcomes: ['0', '1'] };
    const B: Variable = { name: 'B', outcomes: ['0', '1'] };

    const cpts: CPT[] = [
      { variable: A, parents: [], table: new Float64Array([0.5, 0.5]) },
      { variable: B, parents: [A], table: new Float64Array([0.8, 0.2, 0.3, 0.7]) },
    ];

    const data: DataColumn[] = [
      { name: 'A', values: ['0', '0', '1', '1', '0', '1'] },
      { name: 'B', values: ['0', '1', '0', '1', '0', '1'] },
    ];

    const score = computeBIC(data, cpts, [A, B]);
    expect(isFinite(score)).toBe(true);
  });

  it('penalizes more complex models', () => {
    // A model with more parameters should have a larger BIC penalty
    const A: Variable = { name: 'A', outcomes: ['0', '1'] };
    const B: Variable = { name: 'B', outcomes: ['0', '1'] };

    // Same data
    const data: DataColumn[] = [
      { name: 'A', values: Array(100).fill('0').concat(Array(100).fill('1')) },
      { name: 'B', values: Array(100).fill('0').concat(Array(100).fill('1')) },
    ];

    // Simple: independent
    const cptsSimple: CPT[] = [
      { variable: A, parents: [], table: new Float64Array([0.5, 0.5]) },
      { variable: B, parents: [], table: new Float64Array([0.5, 0.5]) },
    ];

    // Complex: A -> B with uniform CPT (same fit but more params)
    const cptsComplex: CPT[] = [
      { variable: A, parents: [], table: new Float64Array([0.5, 0.5]) },
      { variable: B, parents: [A], table: new Float64Array([0.5, 0.5, 0.5, 0.5]) },
    ];

    const scoreSimple = computeBIC(data, cptsSimple, [A, B]);
    const scoreComplex = computeBIC(data, cptsComplex, [A, B]);

    // When the data doesn't show a dependency, simpler model should have better (higher) BIC
    expect(scoreSimple).toBeGreaterThan(scoreComplex);
  });
});

// ===================== End-to-end: CSV -> learn -> infer =====================

describe('end-to-end: CSV to inference', () => {
  it('learns from CSV and produces valid inference', () => {
    // Generate a CSV string from known data
    const Rain: Variable = { name: 'Rain', outcomes: ['yes', 'no'] };
    const Sprinkler: Variable = { name: 'Sprinkler', outcomes: ['on', 'off'] };
    const Wet: Variable = { name: 'Wet', outcomes: ['yes', 'no'] };

    const cpts: CPT[] = [
      { variable: Rain, parents: [], table: new Float64Array([0.3, 0.7]) },
      { variable: Sprinkler, parents: [Rain], table: new Float64Array([0.1, 0.9, 0.5, 0.5]) },
      { variable: Wet, parents: [Rain, Sprinkler], table: new Float64Array([
        0.99, 0.01,  // Rain=yes, Sprinkler=on
        0.8, 0.2,    // Rain=yes, Sprinkler=off
        0.9, 0.1,    // Rain=no, Sprinkler=on
        0.01, 0.99,  // Rain=no, Sprinkler=off
      ]) },
    ];

    const data = generateData([Rain, Sprinkler, Wet], cpts, 5000);

    // Convert to CSV string
    const headers = data.map(c => c.name).join(',');
    const rows = [];
    for (let i = 0; i < data[0].values.length; i++) {
      rows.push(data.map(c => c.values[i]).join(','));
    }
    const csv = [headers, ...rows].join('\n');

    // Parse CSV back
    const parsedData = parseCSV(csv);
    expect(parsedData.length).toBe(3);

    // Learn structure
    const result = learnStructure(parsedData);
    expect(result.variables.length).toBe(3);

    // Create network and run inference
    const bn = new BayesianNetwork(result);
    const priors = bn.priors();

    // All distributions should be valid probability distributions
    for (const [, dist] of priors) {
      let sum = 0;
      for (const [, p] of dist) {
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
        sum += p;
      }
      expect(sum).toBeCloseTo(1.0, 5);
    }
  });
});

// ===================== GES structure learning tests =====================

describe('learnStructureGES', () => {
  it('recovers a simple Rain -> Wet structure', () => {
    const Rain: Variable = { name: 'Rain', outcomes: ['T', 'F'] };
    const Wet: Variable = { name: 'Wet', outcomes: ['T', 'F'] };
    const cpts: CPT[] = [
      { variable: Rain, parents: [], table: new Float64Array([0.3, 0.7]) },
      { variable: Wet, parents: [Rain], table: new Float64Array([0.9, 0.1, 0.2, 0.8]) },
    ];

    const data = generateData([Rain, Wet], cpts, 2000);
    const result = learnStructureGES(data);

    expect(result.variables.length).toBe(2);

    const rainCPT = result.cpts.find(c => c.variable.name === 'Rain')!;
    const wetCPT = result.cpts.find(c => c.variable.name === 'Wet')!;

    // At least one should be a parent of the other (direction may vary)
    const hasEdge =
      rainCPT.parents.some(p => p.name === 'Wet') ||
      wetCPT.parents.some(p => p.name === 'Rain');
    expect(hasEdge).toBe(true);
  });

  it('recovers a 3-variable chain A -> B -> C', () => {
    const A: Variable = { name: 'A', outcomes: ['0', '1'] };
    const B: Variable = { name: 'B', outcomes: ['0', '1'] };
    const C: Variable = { name: 'C', outcomes: ['0', '1'] };

    const cpts: CPT[] = [
      { variable: A, parents: [], table: new Float64Array([0.3, 0.7]) },
      { variable: B, parents: [A], table: new Float64Array([0.9, 0.1, 0.2, 0.8]) },
      { variable: C, parents: [B], table: new Float64Array([0.8, 0.2, 0.1, 0.9]) },
    ];

    const data = generateData([A, B, C], cpts, 3000);
    const result = learnStructureGES(data);

    // Should have at least 2 edges
    let totalEdges = 0;
    for (const cpt of result.cpts) totalEdges += cpt.parents.length;
    expect(totalEdges).toBeGreaterThanOrEqual(2);

    const aCPT = result.cpts.find(c => c.variable.name === 'A')!;
    const bCPT = result.cpts.find(c => c.variable.name === 'B')!;
    const cCPT = result.cpts.find(c => c.variable.name === 'C')!;

    // A-B connected and B-C connected (in either direction)
    const abConnected =
      bCPT.parents.some(p => p.name === 'A') || aCPT.parents.some(p => p.name === 'B');
    const bcConnected =
      cCPT.parents.some(p => p.name === 'B') || bCPT.parents.some(p => p.name === 'C');

    expect(abConnected).toBe(true);
    expect(bcConnected).toBe(true);
  });

  it('GES achieves BIC at least as good as HC on same data', () => {
    const A: Variable = { name: 'A', outcomes: ['0', '1'] };
    const B: Variable = { name: 'B', outcomes: ['0', '1'] };
    const C: Variable = { name: 'C', outcomes: ['0', '1'] };

    const cpts: CPT[] = [
      { variable: A, parents: [], table: new Float64Array([0.4, 0.6]) },
      { variable: B, parents: [A], table: new Float64Array([0.85, 0.15, 0.15, 0.85]) },
      { variable: C, parents: [B], table: new Float64Array([0.9, 0.1, 0.1, 0.9]) },
    ];

    const data = generateData([A, B, C], cpts, 3000);

    const hcResult = learnStructure(data);
    const gesResult = learnStructureGES(data);

    const hcBIC = computeBIC(data, hcResult.cpts, hcResult.variables);
    const gesBIC = computeBIC(data, gesResult.cpts, gesResult.variables);

    // GES should be at least as good (higher BIC = better)
    expect(gesBIC).toBeGreaterThanOrEqual(hcBIC - 1); // small tolerance for floating point
  });
});
