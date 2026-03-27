import { describe, it, expect } from 'vitest';
import { chiSquaredTest, gSquaredTest, mutualInformation } from '../src/lib/ci-tests.js';
import type { DataColumn } from '../src/lib/structure-learning.js';
import type { Variable, CPT } from '../src/lib/types.js';

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

// --- Test data ---
const X: Variable = { name: 'X', outcomes: ['0', '1'] };
const Y: Variable = { name: 'Y', outcomes: ['0', '1'] };
const Z: Variable = { name: 'Z', outcomes: ['0', '1'] };

// X -> Y (strong dependency)
const depCPTs: CPT[] = [
  { variable: X, parents: [], table: new Float64Array([0.5, 0.5]) },
  { variable: Y, parents: [X], table: new Float64Array([0.95, 0.05, 0.05, 0.95]) },
];
const depData = generateData([X, Y], depCPTs, 2000);

// Two independent variables
function makeIndependentData(n: number, seed = 777): DataColumn[] {
  const rand = makeRng(seed);
  const a: string[] = [], b: string[] = [];
  for (let i = 0; i < n; i++) {
    a.push(rand() < 0.5 ? '0' : '1');
    b.push(rand() < 0.5 ? '0' : '1');
  }
  return [{ name: 'A', values: a }, { name: 'B', values: b }];
}
const indepData = makeIndependentData(2000);

// Chain: X -> Z -> Y for conditional independence test
const chainCPTs: CPT[] = [
  { variable: X, parents: [], table: new Float64Array([0.5, 0.5]) },
  { variable: Z, parents: [X], table: new Float64Array([0.9, 0.1, 0.1, 0.9]) },
  { variable: Y, parents: [Z], table: new Float64Array([0.9, 0.1, 0.1, 0.9]) },
];
const chainData = generateData([X, Z, Y], chainCPTs, 3000);

describe('chiSquaredTest', () => {
  it('detects strong dependence (low p-value)', () => {
    const result = chiSquaredTest(depData, 'X', 'Y', []);
    expect(result.pValue).toBeLessThan(0.001);
    expect(result.df).toBe(1);
    expect(result.statistic).toBeGreaterThan(10);
  });

  it('does not reject independence for independent variables', () => {
    const result = chiSquaredTest(indepData, 'A', 'B', []);
    expect(result.pValue).toBeGreaterThan(0.05);
    expect(result.df).toBe(1);
  });

  it('detects conditional independence in a chain (X ⊥ Y | Z)', () => {
    const result = chiSquaredTest(chainData, 'X', 'Y', ['Z']);
    expect(result.pValue).toBeGreaterThan(0.01);
  });

  it('detects marginal dependence in a chain (X not ⊥ Y)', () => {
    const result = chiSquaredTest(chainData, 'X', 'Y', []);
    expect(result.pValue).toBeLessThan(0.05);
  });
});

describe('gSquaredTest', () => {
  it('detects strong dependence (low p-value)', () => {
    const result = gSquaredTest(depData, 'X', 'Y', []);
    expect(result.pValue).toBeLessThan(0.001);
    expect(result.statistic).toBeGreaterThan(10);
  });

  it('does not reject independence for independent variables', () => {
    const result = gSquaredTest(indepData, 'A', 'B', []);
    expect(result.pValue).toBeGreaterThan(0.05);
  });

  it('detects conditional independence in a chain (X ⊥ Y | Z)', () => {
    const result = gSquaredTest(chainData, 'X', 'Y', ['Z']);
    expect(result.pValue).toBeGreaterThan(0.01);
  });
});

describe('mutualInformation', () => {
  it('returns high MI for dependent variables', () => {
    const mi = mutualInformation(depData, 'X', 'Y');
    expect(mi).toBeGreaterThan(0.3);
  });

  it('returns near-zero MI for independent variables', () => {
    const mi = mutualInformation(indepData, 'A', 'B');
    expect(mi).toBeLessThan(0.01);
  });

  it('conditional MI is near zero when conditioned on mediator', () => {
    const mi = mutualInformation(chainData, 'X', 'Y', ['Z']);
    expect(mi).toBeLessThan(0.02);
  });

  it('unconditional MI is positive for chain endpoints', () => {
    const mi = mutualInformation(chainData, 'X', 'Y');
    expect(mi).toBeGreaterThan(0.05);
  });
});
