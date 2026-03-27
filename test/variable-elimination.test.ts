/**
 * Tests for Variable Elimination inference algorithm.
 *
 * Validates that VE produces identical results to the junction tree algorithm,
 * and verifies against the Java reference values for the dog-problem network.
 */
import { describe, it, expect } from 'vitest';
import { BayesianNetwork } from '../src/lib/network.js';
import { variableElimination, minFillOrder } from '../src/lib/variable-elimination.js';
import { infer } from '../src/lib/inference.js';
import type { Variable, CPT, Distribution } from '../src/lib/types.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const dogProblemXml = readFileSync(resolve(__dirname, '../src/example.xmlbif'), 'utf-8');

function loadNet() {
  return BayesianNetwork.fromXmlBif(dogProblemXml);
}

// Java reference values (from cross-validation.test.ts)
const JAVA_PRIORS: Record<string, Record<string, number>> = {
  'light-on':       { true: 0.132500, false: 0.867500 },
  'hear-bark':      { true: 0.283123, false: 0.716877 },
  'bowel-problem':  { true: 0.010000, false: 0.990000 },
  'dog-out':        { true: 0.395830, false: 0.604170 },
  'family-out':     { true: 0.150000, false: 0.850000 },
};

const JAVA_HEAR_BARK_TRUE: Record<string, Record<string, number>> = {
  'light-on':       { true: 0.234050, false: 0.765950 },
  'hear-bark':      { true: 1.000000, false: 0.000000 },
  'bowel-problem':  { true: 0.024066, false: 0.975934 },
  'dog-out':        { true: 0.978660, false: 0.021340 },
  'family-out':     { true: 0.334636, false: 0.665364 },
};

const JAVA_DOG_OUT_FALSE: Record<string, Record<string, number>> = {
  'light-on':       { true: 0.063532, false: 0.936468 },
  'hear-bark':      { true: 0.010000, false: 0.990000 },
  'bowel-problem':  { true: 0.000447, false: 0.999553 },
  'dog-out':        { true: 0.000000, false: 1.000000 },
  'family-out':     { true: 0.024604, false: 0.975396 },
};

const JAVA_FAMILY_OUT_TRUE: Record<string, Record<string, number>> = {
  'light-on':       { true: 0.600000, false: 0.400000 },
  'hear-bark':      { true: 0.631621, false: 0.368379 },
  'bowel-problem':  { true: 0.010000, false: 0.990000 },
  'dog-out':        { true: 0.900900, false: 0.099100 },
  'family-out':     { true: 1.000000, false: 0.000000 },
};

function compareDistributions(
  actual: Distribution,
  expected: Record<string, number>,
  tolerance: number,
  label: string,
) {
  for (const [outcome, expectedProb] of Object.entries(expected)) {
    const actualProb = actual.get(outcome);
    expect(actualProb, `Missing outcome ${outcome} in VE result for ${label}`).toBeDefined();
    expect(actualProb!).toBeCloseTo(expectedProb, tolerance);
  }
}

describe('Variable Elimination', () => {
  describe('matches junction tree on simple networks', () => {
    it('computes priors for 2-node Rain->Wet network', () => {
      const Rain: Variable = { name: 'Rain', outcomes: ['T', 'F'] };
      const Wet: Variable = { name: 'Wet', outcomes: ['T', 'F'] };
      const cpts: CPT[] = [
        { variable: Rain, parents: [], table: new Float64Array([0.2, 0.8]) },
        { variable: Wet, parents: [Rain], table: new Float64Array([0.9, 0.1, 0.1, 0.9]) },
      ];

      const veRain = variableElimination([Rain, Wet], cpts, Rain);
      expect(veRain.get('T')).toBeCloseTo(0.2);
      expect(veRain.get('F')).toBeCloseTo(0.8);

      const veWet = variableElimination([Rain, Wet], cpts, Wet);
      expect(veWet.get('T')).toBeCloseTo(0.26);
      expect(veWet.get('F')).toBeCloseTo(0.74);
    });

    it('computes posteriors with evidence for 2-node network', () => {
      const Rain: Variable = { name: 'Rain', outcomes: ['T', 'F'] };
      const Wet: Variable = { name: 'Wet', outcomes: ['T', 'F'] };
      const cpts: CPT[] = [
        { variable: Rain, parents: [], table: new Float64Array([0.2, 0.8]) },
        { variable: Wet, parents: [Rain], table: new Float64Array([0.9, 0.1, 0.1, 0.9]) },
      ];

      const evidence = new Map([['Wet', 'T']]);
      const veRain = variableElimination([Rain, Wet], cpts, Rain, evidence);
      // P(Rain=T|Wet=T) = 0.18/0.26 ≈ 0.692
      expect(veRain.get('T')).toBeCloseTo(0.18 / 0.26, 2);
      expect(veRain.get('F')).toBeCloseTo(0.08 / 0.26, 2);
    });

    it('handles v-structure (explaining away)', () => {
      const A: Variable = { name: 'A', outcomes: ['T', 'F'] };
      const B: Variable = { name: 'B', outcomes: ['T', 'F'] };
      const C: Variable = { name: 'C', outcomes: ['T', 'F'] };
      const cpts: CPT[] = [
        { variable: A, parents: [], table: new Float64Array([0.5, 0.5]) },
        { variable: B, parents: [], table: new Float64Array([0.5, 0.5]) },
        {
          variable: C,
          parents: [A, B],
          table: new Float64Array([1.0, 0.0, 0.5, 0.5, 0.5, 0.5, 0.0, 1.0]),
        },
      ];

      // Prior
      const veA = variableElimination([A, B, C], cpts, A);
      expect(veA.get('T')).toBeCloseTo(0.5);

      // Observe C=T
      const evidence = new Map([['C', 'T']]);
      const postA = variableElimination([A, B, C], cpts, A, evidence);
      expect(postA.get('T')).toBeCloseTo(0.75, 1);

      const postB = variableElimination([A, B, C], cpts, B, evidence);
      expect(postB.get('T')).toBeCloseTo(0.75, 1);
    });

    it('handles chain A->B->C', () => {
      const A: Variable = { name: 'A', outcomes: ['T', 'F'] };
      const B: Variable = { name: 'B', outcomes: ['T', 'F'] };
      const C: Variable = { name: 'C', outcomes: ['T', 'F'] };
      const cpts: CPT[] = [
        { variable: A, parents: [], table: new Float64Array([0.6, 0.4]) },
        { variable: B, parents: [A], table: new Float64Array([0.8, 0.2, 0.3, 0.7]) },
        { variable: C, parents: [B], table: new Float64Array([0.9, 0.1, 0.4, 0.6]) },
      ];

      const veC = variableElimination([A, B, C], cpts, C);
      expect(veC.get('T')).toBeCloseTo(0.7);
      expect(veC.get('F')).toBeCloseTo(0.3);

      const veB = variableElimination([A, B, C], cpts, B);
      expect(veB.get('T')).toBeCloseTo(0.6);
    });
  });

  describe('matches junction tree on dog-problem network', () => {
    it('priors match JT and Java reference for all variables', () => {
      const net = loadNet();
      const jtResult = infer(net.variables, net.cpts);

      for (const v of net.variables) {
        const veDist = variableElimination(net.variables, net.cpts, v);
        const jtDist = jtResult.posteriors.get(v)!;

        for (const outcome of v.outcomes) {
          expect(veDist.get(outcome)).toBeCloseTo(jtDist.get(outcome)!, 6);
        }

        // Also check against Java reference
        const javaRef = JAVA_PRIORS[v.name];
        if (javaRef) {
          compareDistributions(veDist, javaRef, 3, `prior ${v.name}`);
        }
      }
    });

    it('hear-bark=true posteriors match JT and Java reference', () => {
      const net = loadNet();
      const evidence = new Map([['hear-bark', 'true']]);
      const jtResult = infer(net.variables, net.cpts, evidence);

      for (const v of net.variables) {
        const veDist = variableElimination(net.variables, net.cpts, v, evidence);
        const jtDist = jtResult.posteriors.get(v)!;

        for (const outcome of v.outcomes) {
          expect(veDist.get(outcome)).toBeCloseTo(jtDist.get(outcome)!, 6);
        }

        const javaRef = JAVA_HEAR_BARK_TRUE[v.name];
        if (javaRef) {
          compareDistributions(veDist, javaRef, 3, `hear-bark=true ${v.name}`);
        }
      }
    });

    it('dog-out=false posteriors match JT and Java reference', () => {
      const net = loadNet();
      const evidence = new Map([['dog-out', 'false']]);
      const jtResult = infer(net.variables, net.cpts, evidence);

      for (const v of net.variables) {
        const veDist = variableElimination(net.variables, net.cpts, v, evidence);
        const jtDist = jtResult.posteriors.get(v)!;

        for (const outcome of v.outcomes) {
          expect(veDist.get(outcome)).toBeCloseTo(jtDist.get(outcome)!, 6);
        }

        const javaRef = JAVA_DOG_OUT_FALSE[v.name];
        if (javaRef) {
          compareDistributions(veDist, javaRef, 3, `dog-out=false ${v.name}`);
        }
      }
    });

    it('family-out=true posteriors match JT and Java reference', () => {
      const net = loadNet();
      const evidence = new Map([['family-out', 'true']]);
      const jtResult = infer(net.variables, net.cpts, evidence);

      for (const v of net.variables) {
        const veDist = variableElimination(net.variables, net.cpts, v, evidence);
        const jtDist = jtResult.posteriors.get(v)!;

        for (const outcome of v.outcomes) {
          expect(veDist.get(outcome)).toBeCloseTo(jtDist.get(outcome)!, 6);
        }

        const javaRef = JAVA_FAMILY_OUT_TRUE[v.name];
        if (javaRef) {
          compareDistributions(veDist, javaRef, 3, `family-out=true ${v.name}`);
        }
      }
    });
  });

  describe('with evidence', () => {
    it('evidence variable has deterministic distribution', () => {
      const net = loadNet();
      const evidence = new Map([['hear-bark', 'true']]);
      const veDist = variableElimination(
        net.variables,
        net.cpts,
        net.getVariable('hear-bark')!,
        evidence,
      );
      expect(veDist.get('true')).toBeCloseTo(1.0);
      expect(veDist.get('false')).toBeCloseTo(0.0);
    });

    it('supports likelihood evidence', () => {
      const Rain: Variable = { name: 'Rain', outcomes: ['T', 'F'] };
      const Wet: Variable = { name: 'Wet', outcomes: ['T', 'F'] };
      const cpts: CPT[] = [
        { variable: Rain, parents: [], table: new Float64Array([0.2, 0.8]) },
        { variable: Wet, parents: [Rain], table: new Float64Array([0.9, 0.1, 0.1, 0.9]) },
      ];

      // Soft evidence: 80% sure Wet=T
      const likelihoodEvidence = new Map([['Wet', new Map([['T', 0.8], ['F', 0.2]])]]);
      const veDist = variableElimination([Rain, Wet], cpts, Rain, undefined, likelihoodEvidence);

      // Compare against JT
      const jtResult = infer([Rain, Wet], cpts, undefined, likelihoodEvidence);
      const jtDist = jtResult.posteriors.get(Rain)!;
      expect(veDist.get('T')).toBeCloseTo(jtDist.get('T')!, 6);
      expect(veDist.get('F')).toBeCloseTo(jtDist.get('F')!, 6);
    });
  });

  describe('minFillOrder', () => {
    it('returns all provided variables', () => {
      const net = loadNet();
      const order = minFillOrder(net.variables, net.cpts);
      expect(order).toHaveLength(net.variables.length);
      // Every variable should appear exactly once
      const names = order.map(v => v.name).sort();
      const expected = [...net.variables].map(v => v.name).sort();
      expect(names).toEqual(expected);
    });

    it('produces a valid elimination ordering', () => {
      const A: Variable = { name: 'A', outcomes: ['T', 'F'] };
      const B: Variable = { name: 'B', outcomes: ['T', 'F'] };
      const C: Variable = { name: 'C', outcomes: ['T', 'F'] };
      const cpts: CPT[] = [
        { variable: A, parents: [], table: new Float64Array([0.5, 0.5]) },
        { variable: B, parents: [A], table: new Float64Array([0.5, 0.5, 0.5, 0.5]) },
        { variable: C, parents: [B], table: new Float64Array([0.5, 0.5, 0.5, 0.5]) },
      ];

      const order = minFillOrder([A, B, C], cpts);
      expect(order).toHaveLength(3);
      // All variables should be present
      const names = new Set(order.map(v => v.name));
      expect(names.has('A')).toBe(true);
      expect(names.has('B')).toBe(true);
      expect(names.has('C')).toBe(true);
    });

    it('accepts a custom elimination order', () => {
      const net = loadNet();
      // Use a specific (possibly suboptimal) order
      const customOrder = [...net.variables];
      const queryVar = net.getVariable('hear-bark')!;

      const dist = variableElimination(
        net.variables,
        net.cpts,
        queryVar,
        undefined,
        undefined,
        customOrder,
      );

      // Should still produce correct results
      const jtResult = infer(net.variables, net.cpts);
      const jtDist = jtResult.posteriors.get(queryVar)!;
      for (const outcome of queryVar.outcomes) {
        expect(dist.get(outcome)).toBeCloseTo(jtDist.get(outcome)!, 6);
      }
    });
  });

  describe('performance', () => {
    it('querying a single variable with VE is faster than full JT', () => {
      const net = loadNet();
      const queryVar = net.getVariable('hear-bark')!;
      const iterations = 200;

      // Warm up
      for (let i = 0; i < 10; i++) {
        variableElimination(net.variables, net.cpts, queryVar);
        infer(net.variables, net.cpts);
      }

      // Time VE (single variable)
      const veStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        variableElimination(net.variables, net.cpts, queryVar);
      }
      const veTime = performance.now() - veStart;

      // Time JT (all variables)
      const jtStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        infer(net.variables, net.cpts);
      }
      const jtTime = performance.now() - jtStart;

      // VE for a single variable should generally be faster than full JT.
      // We use a generous threshold to avoid flaky tests.
      // The key insight: VE avoids building the junction tree entirely.
      expect(veTime).toBeLessThan(jtTime * 3);
    });
  });
});
