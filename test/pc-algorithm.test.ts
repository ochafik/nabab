import { describe, it, expect } from 'vitest';
import { pcAlgorithm } from '../src/lib/pc-algorithm.js';
import { BayesianNetwork } from '../src/lib/network.js';
import type { Variable, CPT } from '../src/lib/types.js';
import type { DataColumn } from '../src/lib/structure-learning.js';

// --- Seeded PRNG ---
function makeRng(seed = 42) {
  let s = seed;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateData(variables: Variable[], cpts: CPT[], n: number, seed = 42): DataColumn[] {
  const rand = makeRng(seed);
  const cptMap = new Map<string, CPT>();
  for (const cpt of cpts) cptMap.set(cpt.variable.name, cpt);

  const columns: DataColumn[] = variables.map(v => ({ name: v.name, values: [] }));
  const colMap = new Map<string, DataColumn>();
  for (const col of columns) colMap.set(col.name, col);

  for (let row = 0; row < n; row++) {
    const assignment = new Map<string, number>();
    for (const variable of variables) {
      const cpt = cptMap.get(variable.name)!;
      let paIdx = 0, stride = 1;
      for (let p = cpt.parents.length - 1; p >= 0; p--) {
        paIdx += assignment.get(cpt.parents[p].name)! * stride;
        stride *= cpt.parents[p].outcomes.length;
      }
      const varCard = variable.outcomes.length;
      const r = rand();
      let cum = 0, sampledIdx = varCard - 1;
      for (let k = 0; k < varCard; k++) {
        cum += cpt.table[paIdx * varCard + k];
        if (r < cum) { sampledIdx = k; break; }
      }
      assignment.set(variable.name, sampledIdx);
      colMap.get(variable.name)!.values.push(variable.outcomes[sampledIdx]);
    }
  }
  return columns;
}

// Helpers
function areConnected(net: { cpts: readonly CPT[] }, a: string, b: string): boolean {
  for (const cpt of net.cpts) {
    if (cpt.variable.name === a && cpt.parents.some(p => p.name === b)) return true;
    if (cpt.variable.name === b && cpt.parents.some(p => p.name === a)) return true;
  }
  return false;
}

function countEdges(net: { cpts: readonly CPT[] }): number {
  let total = 0;
  for (const cpt of net.cpts) total += cpt.parents.length;
  return total;
}

function isAcyclic(net: { variables: readonly Variable[]; cpts: readonly CPT[] }): boolean {
  const n = net.variables.length;
  const idx = new Map<string, number>();
  net.variables.forEach((v, i) => idx.set(v.name, i));
  const inDeg = new Array(n).fill(0);
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const cpt of net.cpts) {
    const j = idx.get(cpt.variable.name)!;
    for (const p of cpt.parents) { adj[idx.get(p.name)!].push(j); inDeg[j]++; }
  }
  const q: number[] = [];
  for (let i = 0; i < n; i++) if (inDeg[i] === 0) q.push(i);
  let count = 0;
  while (q.length > 0) {
    const node = q.shift()!; count++;
    for (const c of adj[node]) { inDeg[c]--; if (inDeg[c] === 0) q.push(c); }
  }
  return count === n;
}

// =============== Test structures ===============

// Chain: A -> B -> C
const A: Variable = { name: 'A', outcomes: ['0', '1'] };
const B: Variable = { name: 'B', outcomes: ['0', '1'] };
const C: Variable = { name: 'C', outcomes: ['0', '1'] };

const chainCPTs: CPT[] = [
  { variable: A, parents: [], table: new Float64Array([0.3, 0.7]) },
  { variable: B, parents: [A], table: new Float64Array([0.9, 0.1, 0.1, 0.9]) },
  { variable: C, parents: [B], table: new Float64Array([0.85, 0.15, 0.15, 0.85]) },
];
const chainData = generateData([A, B, C], chainCPTs, 3000);

// Fork: B <- A -> C
const forkCPTs: CPT[] = [
  { variable: A, parents: [], table: new Float64Array([0.4, 0.6]) },
  { variable: B, parents: [A], table: new Float64Array([0.9, 0.1, 0.15, 0.85]) },
  { variable: C, parents: [A], table: new Float64Array([0.85, 0.15, 0.1, 0.9]) },
];
const forkData = generateData([A, B, C], forkCPTs, 3000);

// Collider: A -> B <- C (A and C independent, but dependent given B)
const colliderCPTs: CPT[] = [
  { variable: A, parents: [], table: new Float64Array([0.5, 0.5]) },
  { variable: C, parents: [], table: new Float64Array([0.5, 0.5]) },
  {
    variable: B, parents: [A, C], table: new Float64Array([
      0.95, 0.05,  // A=0, C=0
      0.3, 0.7,   // A=0, C=1
      0.3, 0.7,   // A=1, C=0
      0.05, 0.95,  // A=1, C=1
    ]),
  },
];
const colliderData = generateData([A, C, B], colliderCPTs, 5000, 99);

describe('PC algorithm - chain structure', () => {
  it('recovers edges A-B and B-C', () => {
    const result = pcAlgorithm(chainData, { alpha: 0.05 });
    expect(areConnected(result, 'A', 'B')).toBe(true);
    expect(areConnected(result, 'B', 'C')).toBe(true);
  });

  it('does not add spurious A-C edge', () => {
    const result = pcAlgorithm(chainData, { alpha: 0.05 });
    // A and C should be conditionally independent given B
    // so the edge should be removed
    expect(areConnected(result, 'A', 'C')).toBe(false);
  });

  it('produces an acyclic graph', () => {
    const result = pcAlgorithm(chainData);
    expect(isAcyclic(result)).toBe(true);
  });

  it('has exactly 2 edges', () => {
    const result = pcAlgorithm(chainData, { alpha: 0.05 });
    expect(countEdges(result)).toBe(2);
  });
});

describe('PC algorithm - fork structure', () => {
  it('recovers edges A-B and A-C', () => {
    const result = pcAlgorithm(forkData, { alpha: 0.05 });
    expect(areConnected(result, 'A', 'B')).toBe(true);
    expect(areConnected(result, 'A', 'C')).toBe(true);
  });

  it('does not add spurious B-C edge', () => {
    const result = pcAlgorithm(forkData, { alpha: 0.05 });
    expect(areConnected(result, 'B', 'C')).toBe(false);
  });

  it('produces an acyclic graph with 2 edges', () => {
    const result = pcAlgorithm(forkData, { alpha: 0.05 });
    expect(isAcyclic(result)).toBe(true);
    expect(countEdges(result)).toBe(2);
  });
});

describe('PC algorithm - collider structure', () => {
  it('recovers edges A-B and C-B', () => {
    const result = pcAlgorithm(colliderData, { alpha: 0.05 });
    expect(areConnected(result, 'A', 'B')).toBe(true);
    expect(areConnected(result, 'C', 'B')).toBe(true);
  });

  it('does not add spurious A-C edge', () => {
    const result = pcAlgorithm(colliderData, { alpha: 0.05 });
    expect(areConnected(result, 'A', 'C')).toBe(false);
  });

  it('orients v-structure: both A and C are parents of B', () => {
    const result = pcAlgorithm(colliderData, { alpha: 0.05 });
    const bCpt = result.cpts.find(c => c.variable.name === 'B')!;
    const bParentNames = bCpt.parents.map(p => p.name).sort();
    expect(bParentNames).toEqual(['A', 'C']);
  });

  it('produces an acyclic graph', () => {
    const result = pcAlgorithm(colliderData, { alpha: 0.05 });
    expect(isAcyclic(result)).toBe(true);
  });
});

describe('PC algorithm - options', () => {
  it('works with g-squared test', () => {
    const result = pcAlgorithm(chainData, { ciTest: 'g-squared', alpha: 0.05 });
    expect(areConnected(result, 'A', 'B')).toBe(true);
    expect(areConnected(result, 'B', 'C')).toBe(true);
    expect(areConnected(result, 'A', 'C')).toBe(false);
  });

  it('maxConditioningSize limits conditioning sets', () => {
    const result = pcAlgorithm(chainData, { alpha: 0.05, maxConditioningSize: 0 });
    // With maxConditioningSize=0, no conditioning so A-C may remain
    expect(areConnected(result, 'A', 'B')).toBe(true);
    expect(areConnected(result, 'B', 'C')).toBe(true);
  });

  it('produces valid probability distributions', () => {
    const result = pcAlgorithm(chainData, { alpha: 0.05 });
    for (const cpt of result.cpts) {
      for (let i = 0; i < cpt.table.length; i++) {
        expect(cpt.table[i]).toBeGreaterThanOrEqual(0);
        expect(cpt.table[i]).toBeLessThanOrEqual(1);
      }
      const varCard = cpt.variable.outcomes.length;
      const numRows = cpt.table.length / varCard;
      for (let r = 0; r < numRows; r++) {
        let rowSum = 0;
        for (let k = 0; k < varCard; k++) rowSum += cpt.table[r * varCard + k];
        expect(rowSum).toBeCloseTo(1.0, 5);
      }
    }
  });
});

describe('PC algorithm - inference integration', () => {
  it('output is a valid BayesianNetwork that can run inference', () => {
    const result = pcAlgorithm(chainData, { alpha: 0.05 });
    const bn = new BayesianNetwork(result);
    const priors = bn.priors();

    for (const [, dist] of priors) {
      let sum = 0;
      for (const [, p] of dist) sum += p;
      expect(sum).toBeCloseTo(1.0, 5);
    }

    // Variable A's marginal should roughly match data
    const aDist = priors.get(bn.variables.find(v => v.name === 'A')!)!;
    expect(aDist.get('0')!).toBeCloseTo(0.3, 1);
    expect(aDist.get('1')!).toBeCloseTo(0.7, 1);
  });
});

describe('PC algorithm - comparison with @kanaries/causal', () => {
  it('PC results match causalDiscovery PC on chain data (skeleton)', async () => {
    // Only compare if @kanaries/causal is available
    let causalDiscovery: typeof import('../src/lib/causal-discovery.js').causalDiscovery;
    try {
      const mod = await import('../src/lib/causal-discovery.js');
      causalDiscovery = mod.causalDiscovery;
    } catch {
      // @kanaries/causal not available, skip
      return;
    }

    const native = pcAlgorithm(chainData, { alpha: 0.05 });
    const kanaries = causalDiscovery(chainData, { algorithm: 'pc', alpha: 0.05 });

    // Both should find A-B and B-C
    expect(areConnected(native, 'A', 'B')).toBe(true);
    expect(areConnected(native, 'B', 'C')).toBe(true);
    expect(areConnected(kanaries, 'A', 'B')).toBe(true);
    expect(areConnected(kanaries, 'B', 'C')).toBe(true);

    // Both should not have A-C
    expect(areConnected(native, 'A', 'C')).toBe(false);
    expect(areConnected(kanaries, 'A', 'C')).toBe(false);
  });
});
