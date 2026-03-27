import { describe, it, expect } from 'vitest';
import { causalDiscovery } from '../src/lib/causal-discovery.js';
import { learnStructure, learnStructureGES, computeBIC } from '../src/lib/structure-learning.js';
import { BayesianNetwork } from '../src/lib/network.js';
import type { Variable, CPT } from '../src/lib/types.js';
import type { DataColumn } from '../src/lib/structure-learning.js';

// --- Helper: generate data from a known Bayesian network ---
function generateData(variables: Variable[], cpts: CPT[], n: number, seed = 42): DataColumn[] {
  let s = seed;
  function rand() {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  const cptMap = new Map<string, CPT>();
  for (const cpt of cpts) cptMap.set(cpt.variable.name, cpt);

  const columns: DataColumn[] = variables.map(v => ({ name: v.name, values: [] }));
  const colMap = new Map<string, DataColumn>();
  for (const col of columns) colMap.set(col.name, col);

  for (let row = 0; row < n; row++) {
    const assignment = new Map<string, number>();

    for (const variable of variables) {
      const cpt = cptMap.get(variable.name)!;
      let paIdx = 0;
      let stride = 1;
      for (let p = cpt.parents.length - 1; p >= 0; p--) {
        paIdx += assignment.get(cpt.parents[p].name)! * stride;
        stride *= cpt.parents[p].outcomes.length;
      }

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

// Helper: count total edges in a ParsedNetwork
function countEdges(net: { cpts: readonly CPT[] }): number {
  let total = 0;
  for (const cpt of net.cpts) total += cpt.parents.length;
  return total;
}

// Helper: check if two variables are connected (edge in either direction)
function areConnected(net: { cpts: readonly CPT[] }, a: string, b: string): boolean {
  for (const cpt of net.cpts) {
    if (cpt.variable.name === a && cpt.parents.some(p => p.name === b)) return true;
    if (cpt.variable.name === b && cpt.parents.some(p => p.name === a)) return true;
  }
  return false;
}

// Helper: verify acyclicity via topological sort
function isAcyclic(net: { variables: readonly Variable[]; cpts: readonly CPT[] }): boolean {
  const n = net.variables.length;
  const nameToIdx = new Map<string, number>();
  net.variables.forEach((v, i) => nameToIdx.set(v.name, i));

  const adj: number[][] = Array.from({ length: n }, () => []);
  const inDegree = new Array(n).fill(0);
  for (const cpt of net.cpts) {
    const j = nameToIdx.get(cpt.variable.name)!;
    for (const parent of cpt.parents) {
      const i = nameToIdx.get(parent.name)!;
      adj[i].push(j);
      inDegree[j]++;
    }
  }

  const queue: number[] = [];
  for (let i = 0; i < n; i++) if (inDegree[i] === 0) queue.push(i);

  let count = 0;
  while (queue.length > 0) {
    const node = queue.shift()!;
    count++;
    for (const child of adj[node]) {
      inDegree[child]--;
      if (inDegree[child] === 0) queue.push(child);
    }
  }
  return count === n;
}

// ===================== Chain data for testing =====================

// A -> B -> C with strong dependencies
const A: Variable = { name: 'A', outcomes: ['0', '1'] };
const B: Variable = { name: 'B', outcomes: ['0', '1'] };
const C: Variable = { name: 'C', outcomes: ['0', '1'] };

const chainCPTs: CPT[] = [
  { variable: A, parents: [], table: new Float64Array([0.3, 0.7]) },
  { variable: B, parents: [A], table: new Float64Array([0.9, 0.1, 0.1, 0.9]) },
  { variable: C, parents: [B], table: new Float64Array([0.85, 0.15, 0.15, 0.85]) },
];

const chainData = generateData([A, B, C], chainCPTs, 3000);

// ===================== PC algorithm tests =====================

describe('causalDiscovery - PC algorithm', () => {
  it('recovers edges in a simple chain A-B-C', () => {
    const result = causalDiscovery(chainData, { algorithm: 'pc', alpha: 0.05 });

    expect(result.variables.length).toBe(3);
    expect(result.cpts.length).toBe(3);

    // A-B and B-C should be connected (direction may vary)
    expect(areConnected(result, 'A', 'B')).toBe(true);
    expect(areConnected(result, 'B', 'C')).toBe(true);

    // Should have at least 2 edges
    expect(countEdges(result)).toBeGreaterThanOrEqual(2);
  });

  it('produces an acyclic graph', () => {
    const result = causalDiscovery(chainData, { algorithm: 'pc' });
    expect(isAcyclic(result)).toBe(true);
  });

  it('works with G-square CI test', () => {
    const result = causalDiscovery(chainData, {
      algorithm: 'pc',
      ciTest: 'g-square',
      alpha: 0.05,
    });

    expect(result.variables.length).toBe(3);
    expect(areConnected(result, 'A', 'B')).toBe(true);
    expect(areConnected(result, 'B', 'C')).toBe(true);
  });

  it('produces valid probability distributions', () => {
    const result = causalDiscovery(chainData, { algorithm: 'pc' });

    for (const cpt of result.cpts) {
      // All probabilities should be in [0, 1]
      for (let i = 0; i < cpt.table.length; i++) {
        expect(cpt.table[i]).toBeGreaterThanOrEqual(0);
        expect(cpt.table[i]).toBeLessThanOrEqual(1);
      }

      // Rows should sum to ~1
      const varCard = cpt.variable.outcomes.length;
      const numRows = cpt.table.length / varCard;
      for (let r = 0; r < numRows; r++) {
        let rowSum = 0;
        for (let k = 0; k < varCard; k++) {
          rowSum += cpt.table[r * varCard + k];
        }
        expect(rowSum).toBeCloseTo(1.0, 5);
      }
    }
  });
});

// ===================== GES algorithm tests =====================

describe('causalDiscovery - GES algorithm', () => {
  it('recovers edges in a simple chain A-B-C', () => {
    const result = causalDiscovery(chainData, { algorithm: 'ges' });

    expect(result.variables.length).toBe(3);
    expect(areConnected(result, 'A', 'B')).toBe(true);
    expect(areConnected(result, 'B', 'C')).toBe(true);
  });

  it('produces an acyclic graph', () => {
    const result = causalDiscovery(chainData, { algorithm: 'ges' });
    expect(isAcyclic(result)).toBe(true);
  });

  it('output is a valid BayesianNetwork that can run inference', () => {
    const result = causalDiscovery(chainData, { algorithm: 'ges' });
    const bn = new BayesianNetwork(result);
    const priors = bn.priors();

    // All distributions should sum to ~1
    for (const [, dist] of priors) {
      let sum = 0;
      for (const [, p] of dist) sum += p;
      expect(sum).toBeCloseTo(1.0, 5);
    }

    // Variable A's marginal should approximately match the data
    const aDist = priors.get(bn.variables.find(v => v.name === 'A')!)!;
    expect(aDist.get('0')!).toBeCloseTo(0.3, 1);
    expect(aDist.get('1')!).toBeCloseTo(0.7, 1);
  });
});

// ===================== GRaSP algorithm tests =====================

describe('causalDiscovery - GRaSP algorithm', () => {
  it('recovers edges in a simple chain A-B-C', () => {
    const result = causalDiscovery(chainData, { algorithm: 'grasp' });

    expect(result.variables.length).toBe(3);
    expect(areConnected(result, 'A', 'B')).toBe(true);
    expect(areConnected(result, 'B', 'C')).toBe(true);
  });

  it('produces an acyclic graph', () => {
    const result = causalDiscovery(chainData, { algorithm: 'grasp' });
    expect(isAcyclic(result)).toBe(true);
  });

  it('output is a valid BayesianNetwork that can run inference', () => {
    const result = causalDiscovery(chainData, { algorithm: 'grasp' });
    const bn = new BayesianNetwork(result);
    const priors = bn.priors();

    for (const [, dist] of priors) {
      let sum = 0;
      for (const [, p] of dist) sum += p;
      expect(sum).toBeCloseTo(1.0, 5);
    }
  });
});

// ===================== FCI algorithm tests =====================

describe('causalDiscovery - FCI algorithm', () => {
  it('produces a valid network from chain data', () => {
    const result = causalDiscovery(chainData, { algorithm: 'fci', alpha: 0.05 });

    expect(result.variables.length).toBe(3);
    expect(result.cpts.length).toBe(3);
    expect(isAcyclic(result)).toBe(true);
  });

  it('output is a valid BayesianNetwork that can run inference', () => {
    const result = causalDiscovery(chainData, { algorithm: 'fci', alpha: 0.05 });
    const bn = new BayesianNetwork(result);
    const priors = bn.priors();

    for (const [, dist] of priors) {
      let sum = 0;
      for (const [, p] of dist) sum += p;
      expect(sum).toBeCloseTo(1.0, 5);
    }
  });
});

// ===================== Comparison with nabab's HC/GES =====================

describe('causalDiscovery - comparison with nabab native algorithms', () => {
  it('PC results are comparable to HC on chain data', () => {
    const pcResult = causalDiscovery(chainData, { algorithm: 'pc', alpha: 0.05 });
    const hcResult = learnStructure(chainData);

    // Both should find edges between A-B and B-C
    expect(areConnected(pcResult, 'A', 'B')).toBe(true);
    expect(areConnected(pcResult, 'B', 'C')).toBe(true);
    expect(areConnected(hcResult, 'A', 'B')).toBe(true);
    expect(areConnected(hcResult, 'B', 'C')).toBe(true);
  });

  it('GES-causal results are comparable to GES-nabab on chain data', () => {
    const causalGES = causalDiscovery(chainData, { algorithm: 'ges' });
    const nababGES = learnStructureGES(chainData);

    // Both should find edges
    expect(countEdges(causalGES)).toBeGreaterThanOrEqual(2);
    expect(countEdges(nababGES)).toBeGreaterThanOrEqual(2);

    // Both should find A-B and B-C connections
    expect(areConnected(causalGES, 'A', 'B')).toBe(true);
    expect(areConnected(causalGES, 'B', 'C')).toBe(true);
    expect(areConnected(nababGES, 'A', 'B')).toBe(true);
    expect(areConnected(nababGES, 'B', 'C')).toBe(true);
  });
});

// ===================== Edge cases and error handling =====================

describe('causalDiscovery - edge cases', () => {
  it('throws on empty data', () => {
    expect(() => causalDiscovery([])).toThrow('at least one column');
  });

  it('throws on empty rows', () => {
    expect(() => causalDiscovery([{ name: 'A', values: [] }])).toThrow('at least one row');
  });

  it('throws on unknown algorithm', () => {
    expect(() =>
      causalDiscovery(chainData, { algorithm: 'unknown' as any }),
    ).toThrow('unknown algorithm');
  });

  it('handles 2-variable data', () => {
    const Rain: Variable = { name: 'Rain', outcomes: ['T', 'F'] };
    const Wet: Variable = { name: 'Wet', outcomes: ['T', 'F'] };
    const cpts: CPT[] = [
      { variable: Rain, parents: [], table: new Float64Array([0.3, 0.7]) },
      { variable: Wet, parents: [Rain], table: new Float64Array([0.9, 0.1, 0.2, 0.8]) },
    ];

    const data = generateData([Rain, Wet], cpts, 2000);
    const result = causalDiscovery(data, { algorithm: 'pc' });

    expect(result.variables.length).toBe(2);
    expect(areConnected(result, 'Rain', 'Wet')).toBe(true);
  });

  it('handles multi-valued categorical variables', () => {
    const Weather: Variable = { name: 'Weather', outcomes: ['sunny', 'cloudy', 'rainy'] };
    const Activity: Variable = { name: 'Activity', outcomes: ['indoor', 'outdoor'] };
    const cpts: CPT[] = [
      { variable: Weather, parents: [], table: new Float64Array([0.5, 0.3, 0.2]) },
      {
        variable: Activity,
        parents: [Weather],
        table: new Float64Array([0.2, 0.8, 0.5, 0.5, 0.9, 0.1]),
      },
    ];

    const data = generateData([Weather, Activity], cpts, 2000);
    const result = causalDiscovery(data, { algorithm: 'pc' });

    expect(result.variables.length).toBe(2);
    const weatherVar = result.variables.find(v => v.name === 'Weather')!;
    expect(weatherVar.outcomes.length).toBe(3);
  });

  it('default algorithm is PC', () => {
    const result = causalDiscovery(chainData);
    // Should work without specifying algorithm
    expect(result.variables.length).toBe(3);
    expect(result.cpts.length).toBe(3);
  });
});
