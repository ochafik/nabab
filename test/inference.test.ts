import { describe, it, expect } from 'vitest';
import { BayesianNetwork } from '../src/lib/network.js';
import { infer } from '../src/lib/inference.js';
import type { Variable, CPT } from '../src/lib/types.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Dog-problem XMLBIF from the test fixtures
const dogProblemXml = readFileSync(
  resolve(__dirname, '../src/example.xmlbif'),
  'utf-8',
);

// Node.js DOM parser
function makeParser() {
  // Use a minimal DOM parser for tests
}

describe('Inference', () => {
  it('computes priors for simple 2-node network', () => {
    // Rain -> Wet
    // P(Rain=T) = 0.2, P(Rain=F) = 0.8
    // P(Wet=T|Rain=T) = 0.9, P(Wet=F|Rain=T) = 0.1
    // P(Wet=T|Rain=F) = 0.1, P(Wet=F|Rain=F) = 0.9
    const Rain: Variable = { name: 'Rain', outcomes: ['T', 'F'] };
    const Wet: Variable = { name: 'Wet', outcomes: ['T', 'F'] };
    const cpts: CPT[] = [
      { variable: Rain, parents: [], table: new Float64Array([0.2, 0.8]) },
      { variable: Wet, parents: [Rain], table: new Float64Array([0.9, 0.1, 0.1, 0.9]) },
    ];

    const result = infer([Rain, Wet], cpts);

    const rainDist = result.posteriors.get(Rain)!;
    expect(rainDist.get('T')).toBeCloseTo(0.2);
    expect(rainDist.get('F')).toBeCloseTo(0.8);

    // P(Wet=T) = P(Wet=T|Rain=T)*P(Rain=T) + P(Wet=T|Rain=F)*P(Rain=F)
    //          = 0.9*0.2 + 0.1*0.8 = 0.26
    const wetDist = result.posteriors.get(Wet)!;
    expect(wetDist.get('T')).toBeCloseTo(0.26);
    expect(wetDist.get('F')).toBeCloseTo(0.74);
  });

  it('computes posteriors with evidence', () => {
    const Rain: Variable = { name: 'Rain', outcomes: ['T', 'F'] };
    const Wet: Variable = { name: 'Wet', outcomes: ['T', 'F'] };
    const cpts: CPT[] = [
      { variable: Rain, parents: [], table: new Float64Array([0.2, 0.8]) },
      { variable: Wet, parents: [Rain], table: new Float64Array([0.9, 0.1, 0.1, 0.9]) },
    ];

    // Observe Wet=T, what's P(Rain)?
    const evidence = new Map([['Wet', 'T']]);
    const result = infer([Rain, Wet], cpts, evidence);

    const rainDist = result.posteriors.get(Rain)!;
    // P(Rain=T|Wet=T) = P(Wet=T|Rain=T)*P(Rain=T) / P(Wet=T)
    //                  = 0.9*0.2 / 0.26 ≈ 0.692
    expect(rainDist.get('T')).toBeCloseTo(0.18 / 0.26, 2);
    expect(rainDist.get('F')).toBeCloseTo(0.08 / 0.26, 2);
  });

  it('handles a v-structure (explaining away)', () => {
    // A -> C <- B
    const A: Variable = { name: 'A', outcomes: ['T', 'F'] };
    const B: Variable = { name: 'B', outcomes: ['T', 'F'] };
    const C: Variable = { name: 'C', outcomes: ['T', 'F'] };

    const cpts: CPT[] = [
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

    // Prior: A and B are independent
    const prior = infer([A, B, C], cpts);
    const priorA = prior.posteriors.get(A)!;
    expect(priorA.get('T')).toBeCloseTo(0.5);

    // Observe C=T: now A and B are coupled (explaining away)
    const posterior = infer([A, B, C], cpts, new Map([['C', 'T']]));
    const postA = posterior.posteriors.get(A)!;
    const postB = posterior.posteriors.get(B)!;

    // P(C=T) = 0.5*0.5*1 + 0.5*0.5*0.5 + 0.5*0.5*0.5 + 0.5*0.5*0 = 0.5
    // P(A=T|C=T) = (1*0.5 + 0.5*0.5)*0.5 / 0.5 = 0.75*0.5/0.5 = 0.75
    // Actually: P(A=T,C=T) = P(C=T|A=T,B=T)*P(A=T)*P(B=T) + P(C=T|A=T,B=F)*P(A=T)*P(B=F)
    //                      = 1*0.5*0.5 + 0.5*0.5*0.5 = 0.375
    // P(C=T) = 0.375 + 0.125 = 0.5
    // P(A=T|C=T) = 0.375/0.5 = 0.75
    expect(postA.get('T')).toBeCloseTo(0.75, 1);

    // By symmetry: P(B=T|C=T) should also be 0.75
    expect(postB.get('T')).toBeCloseTo(0.75, 1);
  });

  it('handles a chain A->B->C', () => {
    const A: Variable = { name: 'A', outcomes: ['T', 'F'] };
    const B: Variable = { name: 'B', outcomes: ['T', 'F'] };
    const C: Variable = { name: 'C', outcomes: ['T', 'F'] };

    const cpts: CPT[] = [
      { variable: A, parents: [], table: new Float64Array([0.6, 0.4]) },
      { variable: B, parents: [A], table: new Float64Array([0.8, 0.2, 0.3, 0.7]) },
      { variable: C, parents: [B], table: new Float64Array([0.9, 0.1, 0.4, 0.6]) },
    ];

    const result = infer([A, B, C], cpts);
    const distA = result.posteriors.get(A)!;
    const distB = result.posteriors.get(B)!;
    const distC = result.posteriors.get(C)!;

    expect(distA.get('T')).toBeCloseTo(0.6);
    // P(B=T) = 0.8*0.6 + 0.3*0.4 = 0.6
    expect(distB.get('T')).toBeCloseTo(0.6);
    // P(C=T) = 0.9*0.6 + 0.4*0.4 = 0.7
    expect(distC.get('T')).toBeCloseTo(0.7);
  });
});

describe('BayesianNetwork', () => {
  it('creates a network programmatically and infers', () => {
    const Rain: Variable = { name: 'Rain', outcomes: ['T', 'F'] };
    const Wet: Variable = { name: 'Wet', outcomes: ['T', 'F'] };

    const net = new BayesianNetwork({
      name: 'Test',
      variables: [Rain, Wet],
      cpts: [
        { variable: Rain, parents: [], table: new Float64Array([0.2, 0.8]) },
        { variable: Wet, parents: [Rain], table: new Float64Array([0.9, 0.1, 0.1, 0.9]) },
      ],
    });

    expect(net.toString()).toContain('Rain');
    expect(net.toString()).toContain('Wet');

    const dist = net.query('Wet');
    expect(dist.get('T')).toBeCloseTo(0.26);
  });
});
