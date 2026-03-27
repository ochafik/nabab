import { describe, it, expect } from 'vitest';
import { discretize, learnCLGParameters, inferContinuous } from '../src/lib/gaussian.js';
import { learnStructure, parseCSV } from '../src/lib/structure-learning.js';
import { BayesianNetwork } from '../src/lib/network.js';

// ─── Discretization ──────────────────────────────────────────────────

describe('discretize', () => {
  it('equal-width: 3 bins on [0..9]', () => {
    const values = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const result = discretize(values, 'equal-width', 3);

    expect(result.thresholds).toHaveLength(2);
    expect(result.thresholds[0]).toBeCloseTo(3);
    expect(result.thresholds[1]).toBeCloseTo(6);
    expect(result.labels).toHaveLength(3);
    expect(result.discretized).toHaveLength(10);

    // 0,1,2 should be in first bin; 3,4,5 in second; 6..9 in third
    expect(result.discretized[0]).toBe(result.labels[0]);
    expect(result.discretized[3]).toBe(result.labels[1]);
    expect(result.discretized[9]).toBe(result.labels[2]);
  });

  it('equal-width: 2 bins on uniform data', () => {
    const values = [10, 20, 30, 40];
    const result = discretize(values, 'equal-width', 2);

    expect(result.thresholds).toHaveLength(1);
    expect(result.thresholds[0]).toBeCloseTo(25);
    expect(result.labels).toHaveLength(2);
    // 10, 20 < 25 → bin 0; 30, 40 >= 25 → bin 1
    expect(result.discretized[0]).toBe(result.labels[0]);
    expect(result.discretized[1]).toBe(result.labels[0]);
    expect(result.discretized[2]).toBe(result.labels[1]);
    expect(result.discretized[3]).toBe(result.labels[1]);
  });

  it('equal-frequency: 3 bins on 9 values', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const result = discretize(values, 'equal-frequency', 3);

    // With 9 values / 3 bins = 3 per bin
    // Thresholds at indices 3 and 6 in sorted array → values 4 and 7
    expect(result.thresholds).toHaveLength(2);
    expect(result.thresholds[0]).toBe(4);
    expect(result.thresholds[1]).toBe(7);
    expect(result.labels).toHaveLength(3);
    expect(result.discretized).toHaveLength(9);

    // 1,2,3 → bin 0; 4,5,6 → bin 1; 7,8,9 → bin 2
    expect(result.discretized[0]).toBe(result.labels[0]);
    expect(result.discretized[3]).toBe(result.labels[1]);
    expect(result.discretized[8]).toBe(result.labels[2]);
  });

  it('equal-frequency: handles ties by deduplicating thresholds', () => {
    // Many duplicate values
    const values = [1, 1, 1, 2, 2, 2, 3, 3, 3];
    const result = discretize(values, 'equal-frequency', 3);

    // Thresholds should be deduped
    for (let i = 1; i < result.thresholds.length; i++) {
      expect(result.thresholds[i]).toBeGreaterThan(result.thresholds[i - 1]);
    }
    expect(result.discretized).toHaveLength(9);
  });

  it('single bin returns all values in one bin', () => {
    const values = [5, 10, 15];
    const result = discretize(values, 'equal-width', 1);

    expect(result.thresholds).toHaveLength(0);
    expect(result.labels).toEqual(['all']);
    expect(result.discretized).toEqual(['all', 'all', 'all']);
  });

  it('throws on empty array', () => {
    expect(() => discretize([], 'equal-width', 3)).toThrow('empty');
  });

  it('defaults to equal-width with 3 bins', () => {
    const values = [0, 3, 6, 9];
    const result = discretize(values);
    expect(result.thresholds).toHaveLength(2);
    expect(result.labels).toHaveLength(3);
  });
});

// ─── CLG Parameter Learning ──────────────────────────────────────────

describe('learnCLGParameters', () => {
  it('recovers a known linear relationship y = 2 + 3x', () => {
    // Generate data: y = 2 + 3*x (no noise)
    const data: Array<Record<string, number | string>> = [];
    for (let x = 0; x <= 10; x++) {
      data.push({ x, y: 2 + 3 * x });
    }

    const node = learnCLGParameters(data, 'y', [], ['x']);

    expect(node.variable).toBe('y');
    expect(node.type).toBe('continuous');
    expect(node.continuousParents).toEqual(['x']);

    // Single empty-key group (no discrete parents)
    const params = node.parameters.get('')!;
    expect(params).toBeDefined();
    expect(params.intercept).toBeCloseTo(2, 5);
    expect(params.coefficients).toHaveLength(1);
    expect(params.coefficients[0]).toBeCloseTo(3, 5);
    expect(params.variance).toBeCloseTo(0, 5); // no noise
  });

  it('recovers multivariate linear relationship y = 1 + 2*x1 + 3*x2', () => {
    const data: Array<Record<string, number | string>> = [];
    for (let x1 = 0; x1 <= 5; x1++) {
      for (let x2 = 0; x2 <= 5; x2++) {
        data.push({ x1, x2, y: 1 + 2 * x1 + 3 * x2 });
      }
    }

    const node = learnCLGParameters(data, 'y', [], ['x1', 'x2']);
    const params = node.parameters.get('')!;

    expect(params.intercept).toBeCloseTo(1, 5);
    expect(params.coefficients[0]).toBeCloseTo(2, 5);
    expect(params.coefficients[1]).toBeCloseTo(3, 5);
    expect(params.variance).toBeCloseTo(0, 5);
  });

  it('learns separate parameters per discrete parent config', () => {
    const data: Array<Record<string, number | string>> = [];
    // Group "A": y = 10 + 1*x
    for (let x = 0; x <= 10; x++) {
      data.push({ group: 'A', x, y: 10 + 1 * x });
    }
    // Group "B": y = -5 + 2*x
    for (let x = 0; x <= 10; x++) {
      data.push({ group: 'B', x, y: -5 + 2 * x });
    }

    const node = learnCLGParameters(data, 'y', ['group'], ['x']);

    expect(node.discreteParents).toEqual(['group']);
    expect(node.parameters.size).toBe(2);

    const paramsA = node.parameters.get('A')!;
    expect(paramsA.intercept).toBeCloseTo(10, 5);
    expect(paramsA.coefficients[0]).toBeCloseTo(1, 5);

    const paramsB = node.parameters.get('B')!;
    expect(paramsB.intercept).toBeCloseTo(-5, 5);
    expect(paramsB.coefficients[0]).toBeCloseTo(2, 5);
  });

  it('handles noisy data and reports residual variance', () => {
    // Simple seeded PRNG
    let seed = 42;
    function rand() {
      seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    // Box-Muller for normal noise
    function randn(): number {
      const u1 = rand(), u2 = rand();
      return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    }

    // y = 5 + 2*x + noise(σ=1)
    const data: Array<Record<string, number | string>> = [];
    for (let i = 0; i < 1000; i++) {
      const x = rand() * 10;
      data.push({ x, y: 5 + 2 * x + randn() });
    }

    const node = learnCLGParameters(data, 'y', [], ['x']);
    const params = node.parameters.get('')!;

    expect(params.intercept).toBeCloseTo(5, 0);      // within ~0.5
    expect(params.coefficients[0]).toBeCloseTo(2, 0); // within ~0.5
    expect(params.variance).toBeGreaterThan(0.5);
    expect(params.variance).toBeLessThan(2.0);        // σ²≈1
  });
});

// ─── inferContinuous ─────────────────────────────────────────────────

describe('inferContinuous', () => {
  it('computes mean from CLG parameters with evidence', () => {
    // Create a dummy BN (not actually used for the simple case)
    const bn = new BayesianNetwork({
      name: 'dummy',
      variables: [{ name: 'D', outcomes: ['a', 'b'] }],
      cpts: [{ variable: { name: 'D', outcomes: ['a', 'b'] }, parents: [], table: new Float64Array([0.5, 0.5]) }],
    });

    const clgNode = learnCLGParameters(
      // y = 3 + 2*x for group "a", y = 10 + 0*x for group "b"
      [
        ...Array.from({ length: 20 }, (_, i) => ({ D: 'a' as string | number, x: i, y: 3 + 2 * i })),
        ...Array.from({ length: 20 }, (_, i) => ({ D: 'b' as string | number, x: i, y: 10 })),
      ],
      'y', ['D'], ['x'],
    );

    // Query with D=a, x=5 → expected mean = 3 + 2*5 = 13
    const resultA = inferContinuous(
      bn, [clgNode], 'y',
      new Map([['D', 'a']]),
      new Map([['x', 5]]),
    );
    expect(resultA.mean).toBeCloseTo(13, 3);

    // Query with D=b, x=5 → expected mean = 10 + 0*5 = 10
    const resultB = inferContinuous(
      bn, [clgNode], 'y',
      new Map([['D', 'b']]),
      new Map([['x', 5]]),
    );
    expect(resultB.mean).toBeCloseTo(10, 3);
  });
});

// ─── End-to-end: continuous data → discretize → learn → infer ───────

describe('end-to-end: continuous → discrete pipeline', () => {
  it('discretizes continuous data and learns a discrete BN', () => {
    // Simple seeded PRNG
    let seed = 123;
    function rand() {
      seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    // Generate: A → B  (B ≈ 2*A + noise)
    const n = 200;
    const aVals: number[] = [];
    const bVals: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = rand() * 10;
      const b = 2 * a + (rand() - 0.5) * 2;
      aVals.push(a);
      bVals.push(b);
    }

    // Discretize both variables
    const dA = discretize(aVals, 'equal-width', 3);
    const dB = discretize(bVals, 'equal-width', 3);

    // Build CSV-style data columns for structure learning
    const csv =
      'A,B\n' +
      dA.discretized.map((a, i) => `${a},${dB.discretized[i]}`).join('\n');

    const columns = parseCSV(csv);
    expect(columns).toHaveLength(2);
    expect(columns[0].name).toBe('A');

    // Learn structure
    const network = learnStructure(columns);
    const bn = new BayesianNetwork(network);

    expect(bn.variables.length).toBe(2);

    // Infer: with no evidence, posteriors should sum to 1
    const priors = bn.priors();
    for (const [v, dist] of priors) {
      let sum = 0;
      for (const p of dist.values()) sum += p;
      expect(sum).toBeCloseTo(1, 5);
    }
  });
});
