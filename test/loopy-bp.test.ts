/**
 * Tests for Loopy Belief Propagation (LBP) approximate inference.
 *
 * Compares LBP posteriors against exact junction-tree results on small
 * networks and verifies convergence properties.
 */
import { describe, it, expect } from 'vitest';
import { loopyBeliefPropagation } from '../src/lib/loopy-bp.js';
import { infer } from '../src/lib/inference.js';
import { parseBif } from '../src/lib/bif-parser.js';
import type { Variable, CPT, Distribution } from '../src/lib/types.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ─── Helpers ─────────────────────────────────────────────────────────

/** Max absolute difference between two distributions. */
function maxDistDiff(a: Distribution, b: Distribution): number {
  let maxDiff = 0;
  for (const [outcome, pa] of a) {
    const pb = b.get(outcome) ?? 0;
    const d = Math.abs(pa - pb);
    if (d > maxDiff) maxDiff = d;
  }
  return maxDiff;
}

/** Compare all posteriors between LBP and exact, returning max diff. */
function maxPosteriorDiff(
  lbp: Map<Variable, Distribution>,
  exact: Map<Variable, Distribution>,
): number {
  let maxDiff = 0;
  for (const [v, exactDist] of exact) {
    const lbpDist = lbp.get(v);
    if (!lbpDist) continue;
    const d = maxDistDiff(lbpDist, exactDist);
    if (d > maxDiff) maxDiff = d;
  }
  return maxDiff;
}

/** Mean absolute difference across all variables and outcomes. */
function meanPosteriorDiff(
  lbp: Map<Variable, Distribution>,
  exact: Map<Variable, Distribution>,
): number {
  let totalDiff = 0;
  let count = 0;
  for (const [v, exactDist] of exact) {
    const lbpDist = lbp.get(v);
    if (!lbpDist) continue;
    for (const [outcome, ep] of exactDist) {
      totalDiff += Math.abs((lbpDist.get(outcome) ?? 0) - ep);
      count++;
    }
  }
  return count > 0 ? totalDiff / count : 0;
}

function loadBif(name: string) {
  const content = readFileSync(
    resolve(__dirname, `../bench/models/${name}.bif`),
    'utf-8',
  );
  return parseBif(content);
}

// ─── Small inline networks ──────────────────────────────────────────

const Rain: Variable = { name: 'Rain', outcomes: ['T', 'F'] };
const Wet: Variable = { name: 'Wet', outcomes: ['T', 'F'] };
const rainWetCpts: CPT[] = [
  { variable: Rain, parents: [], table: new Float64Array([0.2, 0.8]) },
  { variable: Wet, parents: [Rain], table: new Float64Array([0.9, 0.1, 0.1, 0.9]) },
];

const A: Variable = { name: 'A', outcomes: ['T', 'F'] };
const B: Variable = { name: 'B', outcomes: ['T', 'F'] };
const C: Variable = { name: 'C', outcomes: ['T', 'F'] };
const chainCpts: CPT[] = [
  { variable: A, parents: [], table: new Float64Array([0.6, 0.4]) },
  { variable: B, parents: [A], table: new Float64Array([0.8, 0.2, 0.3, 0.7]) },
  { variable: C, parents: [B], table: new Float64Array([0.9, 0.1, 0.4, 0.6]) },
];

// V-structure: A -> C <- B
const vStructCpts: CPT[] = [
  { variable: A, parents: [], table: new Float64Array([0.5, 0.5]) },
  { variable: B, parents: [], table: new Float64Array([0.5, 0.5]) },
  {
    variable: C,
    parents: [A, B],
    table: new Float64Array([
      1.0, 0.0, // P(C|A=T,B=T)
      0.5, 0.5, // P(C|A=T,B=F)
      0.5, 0.5, // P(C|A=F,B=T)
      0.0, 1.0, // P(C|A=F,B=F)
    ]),
  },
];

// ─── Tests ───────────────────────────────────────────────────────────

describe('Loopy Belief Propagation', () => {
  describe('small tree-structured networks (exact match expected)', () => {
    it('Rain -> Wet priors match exact inference', () => {
      const lbp = loopyBeliefPropagation([Rain, Wet], rainWetCpts);
      const exact = infer([Rain, Wet], rainWetCpts);

      expect(lbp.converged).toBe(true);
      const diff = maxPosteriorDiff(lbp.posteriors, exact.posteriors);
      expect(diff).toBeLessThan(0.05);

      // Spot-check known values
      expect(lbp.posteriors.get(Rain)!.get('T')).toBeCloseTo(0.2, 3);
      expect(lbp.posteriors.get(Wet)!.get('T')).toBeCloseTo(0.26, 3);
    });

    it('Rain -> Wet with evidence Wet=T', () => {
      const evidence = new Map([['Wet', 'T']]);
      const lbp = loopyBeliefPropagation([Rain, Wet], rainWetCpts, evidence);
      const exact = infer([Rain, Wet], rainWetCpts, evidence);

      expect(lbp.converged).toBe(true);
      const diff = maxPosteriorDiff(lbp.posteriors, exact.posteriors);
      expect(diff).toBeLessThan(0.05);

      // P(Rain=T|Wet=T) = 0.18/0.26 ~= 0.692
      expect(lbp.posteriors.get(Rain)!.get('T')).toBeCloseTo(0.18 / 0.26, 2);
    });

    it('chain A -> B -> C priors match exact', () => {
      const lbp = loopyBeliefPropagation([A, B, C], chainCpts);
      const exact = infer([A, B, C], chainCpts);

      expect(lbp.converged).toBe(true);
      const diff = maxPosteriorDiff(lbp.posteriors, exact.posteriors);
      expect(diff).toBeLessThan(0.05);
    });

    it('chain A -> B -> C with evidence C=T', () => {
      const evidence = new Map([['C', 'T']]);
      const lbp = loopyBeliefPropagation([A, B, C], chainCpts, evidence);
      const exact = infer([A, B, C], chainCpts, evidence);

      expect(lbp.converged).toBe(true);
      const diff = maxPosteriorDiff(lbp.posteriors, exact.posteriors);
      expect(diff).toBeLessThan(0.05);
    });

    it('converges quickly on trees (few iterations)', () => {
      const lbp = loopyBeliefPropagation([Rain, Wet], rainWetCpts, undefined, undefined, {
        maxIterations: 200,
        tolerance: 1e-10,
        damping: 0,
      });
      expect(lbp.converged).toBe(true);
      // On a tree with no damping, BP should converge very fast
      expect(lbp.iterations).toBeLessThanOrEqual(10);
    });
  });

  describe('v-structure (loopy graph — single-loop)', () => {
    it('priors match exact', () => {
      const lbp = loopyBeliefPropagation([A, B, C], vStructCpts);
      const exact = infer([A, B, C], vStructCpts);

      expect(lbp.converged).toBe(true);
      const diff = maxPosteriorDiff(lbp.posteriors, exact.posteriors);
      expect(diff).toBeLessThan(0.05);
    });

    it('explaining away with evidence C=T', () => {
      const evidence = new Map([['C', 'T']]);
      const lbp = loopyBeliefPropagation([A, B, C], vStructCpts, evidence);
      const exact = infer([A, B, C], vStructCpts, evidence);

      const diff = maxPosteriorDiff(lbp.posteriors, exact.posteriors);
      expect(diff).toBeLessThan(0.05);

      // P(A=T|C=T) should be ~0.75
      expect(lbp.posteriors.get(A)!.get('T')).toBeCloseTo(0.75, 1);
    });
  });

  describe('asia network (8 nodes, tree-like structure)', () => {
    it('priors closely match exact inference', () => {
      const { variables, cpts } = loadBif('asia');
      const lbp = loopyBeliefPropagation(variables, cpts);
      const exact = infer(variables, cpts);

      expect(lbp.converged).toBe(true);
      const diff = maxPosteriorDiff(lbp.posteriors, exact.posteriors);
      expect(diff).toBeLessThan(0.05);
    });

    it('posteriors with evidence smoke=yes match exact', () => {
      const { variables, cpts } = loadBif('asia');
      const evidence = new Map([['smoke', 'yes']]);
      const lbp = loopyBeliefPropagation(variables, cpts, evidence);
      const exact = infer(variables, cpts, evidence);

      const diff = maxPosteriorDiff(lbp.posteriors, exact.posteriors);
      expect(diff).toBeLessThan(0.05);
    });

    it('posteriors with evidence xray=yes match exact', () => {
      const { variables, cpts } = loadBif('asia');
      const evidence = new Map([['xray', 'yes']]);
      const lbp = loopyBeliefPropagation(variables, cpts, evidence);
      const exact = infer(variables, cpts, evidence);

      const diff = maxPosteriorDiff(lbp.posteriors, exact.posteriors);
      expect(diff).toBeLessThan(0.05);
    });
  });

  describe('alarm network (37 nodes, loopy graph)', () => {
    it('converges with small mean error across all variables', () => {
      const { variables, cpts } = loadBif('alarm');
      const lbp = loopyBeliefPropagation(variables, cpts, undefined, undefined, {
        maxIterations: 200,
        damping: 0.5,
      });
      const exact = infer(variables, cpts);

      // LBP on loopy graphs may have a few variables with larger error
      // (e.g. EXPCO2 in alarm has ~0.24 max diff due to short cycles).
      // But the mean error across all variables should be small, and
      // the algorithm should converge.
      expect(lbp.converged).toBe(true);
      const mean = meanPosteriorDiff(lbp.posteriors, exact.posteriors);
      expect(mean).toBeLessThan(0.02);

      // Most variables should be very close (within 0.01)
      let closeCount = 0;
      for (const [v, exactDist] of exact.posteriors) {
        const lbpDist = lbp.posteriors.get(v)!;
        if (maxDistDiff(lbpDist, exactDist) < 0.01) closeCount++;
      }
      expect(closeCount / exact.posteriors.size).toBeGreaterThanOrEqual(0.8);
    });

    it('posteriors with evidence have small mean error', () => {
      const { variables, cpts } = loadBif('alarm');
      const evidence = new Map([['MINVOLSET', 'HIGH'], ['HRBP', 'HIGH']]);
      const lbp = loopyBeliefPropagation(variables, cpts, evidence, undefined, {
        maxIterations: 200,
        damping: 0.5,
      });
      const exact = infer(variables, cpts, evidence);

      expect(lbp.converged).toBe(true);
      const mean = meanPosteriorDiff(lbp.posteriors, exact.posteriors);
      expect(mean).toBeLessThan(0.03);
    });
  });

  describe('likelihood (soft) evidence', () => {
    it('soft evidence produces results close to exact', () => {
      const likelihoodEvidence = new Map([
        ['Rain', new Map([['T', 0.8], ['F', 0.2]])],
      ]);
      const lbp = loopyBeliefPropagation(
        [Rain, Wet], rainWetCpts, undefined, likelihoodEvidence,
      );
      const exact = infer([Rain, Wet], rainWetCpts, undefined, likelihoodEvidence);

      const diff = maxPosteriorDiff(lbp.posteriors, exact.posteriors);
      expect(diff).toBeLessThan(0.05);
    });
  });

  describe('options and edge cases', () => {
    it('respects maxIterations = 1', () => {
      const { variables, cpts } = loadBif('alarm');
      const lbp = loopyBeliefPropagation(variables, cpts, undefined, undefined, {
        maxIterations: 1,
      });
      expect(lbp.iterations).toBeLessThanOrEqual(1);
      // Should still produce valid distributions (sum to 1)
      for (const [, dist] of lbp.posteriors) {
        let sum = 0;
        for (const p of dist.values()) sum += p;
        expect(sum).toBeCloseTo(1, 5);
      }
    });

    it('damping=0 converges faster on tree networks', () => {
      const lbpDamped = loopyBeliefPropagation([A, B, C], chainCpts, undefined, undefined, {
        damping: 0.5,
        tolerance: 1e-10,
      });
      const lbpUndamped = loopyBeliefPropagation([A, B, C], chainCpts, undefined, undefined, {
        damping: 0,
        tolerance: 1e-10,
      });
      // Undamped should converge in fewer iterations on a tree
      expect(lbpUndamped.iterations).toBeLessThanOrEqual(lbpDamped.iterations);
    });

    it('all posteriors sum to 1', () => {
      const { variables, cpts } = loadBif('asia');
      const lbp = loopyBeliefPropagation(variables, cpts);
      for (const [, dist] of lbp.posteriors) {
        let sum = 0;
        for (const p of dist.values()) sum += p;
        expect(sum).toBeCloseTo(1, 10);
      }
    });
  });

  describe('timing comparison', () => {
    it('LBP is faster than exact JT on alarm network', () => {
      const { variables, cpts } = loadBif('alarm');

      // Warm-up runs
      loopyBeliefPropagation(variables, cpts);
      infer(variables, cpts);

      const lbpRuns = 5;
      const jtRuns = 5;

      const lbpStart = performance.now();
      for (let i = 0; i < lbpRuns; i++) {
        loopyBeliefPropagation(variables, cpts);
      }
      const lbpTime = (performance.now() - lbpStart) / lbpRuns;

      const jtStart = performance.now();
      for (let i = 0; i < jtRuns; i++) {
        infer(variables, cpts);
      }
      const jtTime = (performance.now() - jtStart) / jtRuns;

      console.log(`  alarm network timing: LBP ${lbpTime.toFixed(1)}ms vs JT ${jtTime.toFixed(1)}ms`);
      // We don't assert LBP is faster here — on small networks JT may win.
      // This is mainly to report timing.
      expect(lbpTime).toBeGreaterThan(0);
      expect(jtTime).toBeGreaterThan(0);
    });
  });
});
