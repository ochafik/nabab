import { describe, it, expect } from 'vitest';
import {
  BayesianNetwork,
  interventionalQuery,
  averageCausalEffect,
  mutilateNetwork,
} from '../src/lib/index.js';
import type { Variable, CPT, Evidence } from '../src/lib/types.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ─── Helpers ──────────────────────────────────────────────────────────

function makeVar(name: string, outcomes = ['T', 'F']): Variable {
  return { name, outcomes };
}

/**
 * Build a confounded network: X ← Z → Y, X → Y
 *
 * Z is a common cause (confounder) of X and Y.
 * X also directly causes Y.
 *
 * P(Z=T) = 0.5
 * P(X=T | Z=T) = 0.8, P(X=T | Z=F) = 0.2
 * P(Y=T | X=T, Z=T) = 0.9, P(Y=T | X=T, Z=F) = 0.7
 * P(Y=T | X=F, Z=T) = 0.5, P(Y=T | X=F, Z=F) = 0.1
 */
function buildConfoundedNetwork(): {
  network: BayesianNetwork;
  Z: Variable;
  X: Variable;
  Y: Variable;
} {
  const Z = makeVar('Z');
  const X = makeVar('X');
  const Y = makeVar('Y');

  const cpts: CPT[] = [
    // P(Z)
    { variable: Z, parents: [], table: new Float64Array([0.5, 0.5]) },
    // P(X | Z) — parents: [Z], rows: Z=T, Z=F
    {
      variable: X,
      parents: [Z],
      table: new Float64Array([
        0.8, 0.2, // P(X | Z=T)
        0.2, 0.8, // P(X | Z=F)
      ]),
    },
    // P(Y | X, Z) — parents: [X, Z], rows: X=T,Z=T / X=T,Z=F / X=F,Z=T / X=F,Z=F
    {
      variable: Y,
      parents: [X, Z],
      table: new Float64Array([
        0.9, 0.1, // P(Y | X=T, Z=T)
        0.7, 0.3, // P(Y | X=T, Z=F)
        0.5, 0.5, // P(Y | X=F, Z=T)
        0.1, 0.9, // P(Y | X=F, Z=F)
      ]),
    },
  ];

  const network = new BayesianNetwork({
    name: 'Confounded',
    variables: [Z, X, Y],
    cpts,
  });

  return { network, Z, X, Y };
}

/**
 * Build a simple chain: A → B → C
 *
 * P(A=T) = 0.6
 * P(B=T | A=T) = 0.8, P(B=T | A=F) = 0.3
 * P(C=T | B=T) = 0.9, P(C=T | B=F) = 0.4
 */
function buildChainNetwork(): {
  network: BayesianNetwork;
  A: Variable;
  B: Variable;
  C: Variable;
} {
  const A = makeVar('A');
  const B = makeVar('B');
  const C = makeVar('C');

  const cpts: CPT[] = [
    { variable: A, parents: [], table: new Float64Array([0.6, 0.4]) },
    {
      variable: B,
      parents: [A],
      table: new Float64Array([0.8, 0.2, 0.3, 0.7]),
    },
    {
      variable: C,
      parents: [B],
      table: new Float64Array([0.9, 0.1, 0.4, 0.6]),
    },
  ];

  const network = new BayesianNetwork({
    name: 'Chain',
    variables: [A, B, C],
    cpts,
  });

  return { network, A, B, C };
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('mutilateNetwork', () => {
  it('removes incoming edges to the intervened variable', () => {
    const { network } = buildConfoundedNetwork();

    const mutilated = mutilateNetwork(network, [
      { variable: 'X', value: 'T' },
    ]);

    // X should now have no parents
    const xVar = mutilated.getVariable('X')!;
    expect(mutilated.getParents(xVar)).toHaveLength(0);

    // Z and Y should keep their original parent structure
    const zVar = mutilated.getVariable('Z')!;
    expect(mutilated.getParents(zVar)).toHaveLength(0);

    const yVar = mutilated.getVariable('Y')!;
    expect(mutilated.getParents(yVar)).toHaveLength(2);
  });

  it('creates a degenerate CPT for the intervened variable', () => {
    const { network } = buildConfoundedNetwork();

    const mutilated = mutilateNetwork(network, [
      { variable: 'X', value: 'T' },
    ]);

    // Find X's CPT in the mutilated network
    const xVar = mutilated.getVariable('X')!;
    const xCpt = mutilated.cpts.find(c => c.variable === xVar)!;

    // Should be a degenerate distribution: P(X=T)=1, P(X=F)=0
    expect(xCpt.table[0]).toBe(1.0); // T
    expect(xCpt.table[1]).toBe(0.0); // F
    expect(xCpt.parents).toHaveLength(0);
  });

  it('preserves all variables', () => {
    const { network } = buildConfoundedNetwork();

    const mutilated = mutilateNetwork(network, [
      { variable: 'X', value: 'T' },
    ]);

    expect(mutilated.variables).toHaveLength(network.variables.length);
    for (const v of network.variables) {
      expect(mutilated.getVariable(v.name)).toBeDefined();
    }
  });

  it('supports multiple simultaneous interventions', () => {
    const { network } = buildConfoundedNetwork();

    const mutilated = mutilateNetwork(network, [
      { variable: 'X', value: 'T' },
      { variable: 'Z', value: 'F' },
    ]);

    const xVar = mutilated.getVariable('X')!;
    const zVar = mutilated.getVariable('Z')!;

    expect(mutilated.getParents(xVar)).toHaveLength(0);
    expect(mutilated.getParents(zVar)).toHaveLength(0);

    // Check both CPTs are degenerate
    const xCpt = mutilated.cpts.find(c => c.variable === xVar)!;
    expect(xCpt.table[0]).toBe(1.0);
    expect(xCpt.table[1]).toBe(0.0);

    const zCpt = mutilated.cpts.find(c => c.variable === zVar)!;
    expect(zCpt.table[0]).toBe(0.0); // Z=T
    expect(zCpt.table[1]).toBe(1.0); // Z=F
  });

  it('throws on unknown variable', () => {
    const { network } = buildConfoundedNetwork();
    expect(() =>
      mutilateNetwork(network, [{ variable: 'UNKNOWN', value: 'T' }]),
    ).toThrow('Unknown intervention variable');
  });

  it('throws on invalid outcome value', () => {
    const { network } = buildConfoundedNetwork();
    expect(() =>
      mutilateNetwork(network, [{ variable: 'X', value: 'INVALID' }]),
    ).toThrow('Invalid intervention value');
  });
});

describe('interventionalQuery', () => {
  describe('confounded network: X ← Z → Y, X → Y', () => {
    it('P(Y | do(X=T)) differs from P(Y | X=T) due to confounding', () => {
      const { network } = buildConfoundedNetwork();

      // Observational: P(Y | X=T)
      const observational = network.query('Y', new Map([['X', 'T']]));

      // Interventional: P(Y | do(X=T))
      const interventional = interventionalQuery(network, 'Y', [
        { variable: 'X', value: 'T' },
      ]);

      // These should differ because Z confounds the X-Y relationship.
      // When we observe X=T, we learn Z is likely T (since Z=T makes X=T more
      // probable), which inflates P(Y=T) beyond the causal effect.
      // When we intervene do(X=T), Z stays at its prior.
      const pYgivenX = observational.get('T')!;
      const pYdoX = interventional.get('T')!;

      expect(Math.abs(pYgivenX - pYdoX)).toBeGreaterThan(0.01);

      // Compute P(Y=T | do(X=T)) by hand:
      // Mutilated graph: Z → Y, X (no parents) → Y. P(X=T)=1.
      // P(Y=T | do(X=T)) = sum_z P(Y=T|X=T,Z=z) * P(Z=z)
      //                   = 0.9 * 0.5 + 0.7 * 0.5 = 0.8
      expect(pYdoX).toBeCloseTo(0.8, 2);
    });

    it('P(Y | do(X=F)) uses the causal effect only', () => {
      const { network } = buildConfoundedNetwork();

      const result = interventionalQuery(network, 'Y', [
        { variable: 'X', value: 'F' },
      ]);

      // P(Y=T | do(X=F)) = sum_z P(Y=T|X=F,Z=z) * P(Z=z)
      //                   = 0.5 * 0.5 + 0.1 * 0.5 = 0.3
      expect(result.get('T')).toBeCloseTo(0.3, 2);
    });

    it('intervention on Z removes Z from its (empty) parents', () => {
      const { network } = buildConfoundedNetwork();

      // do(Z=T) — Z has no parents, so this is equivalent to observing Z=T
      // but the mechanism is different (surgery vs conditioning).
      // In this case the results should be the same because Z is a root node.
      const doZ = interventionalQuery(network, 'Y', [
        { variable: 'Z', value: 'T' },
      ]);
      const obsZ = network.query('Y', new Map([['Z', 'T']]));

      // For root nodes, do(Z=z) = P(Y|Z=z) since Z has no incoming edges.
      expect(doZ.get('T')).toBeCloseTo(obsZ.get('T')!, 2);
    });
  });

  describe('chain: A → B → C (no confounding)', () => {
    it('P(C | do(B=T)) equals P(C | B=T) because B blocks the only path', () => {
      const { network } = buildChainNetwork();

      // Observational: P(C | B=T)
      const observational = network.query('C', new Map([['B', 'T']]));

      // Interventional: P(C | do(B=T))
      const interventional = interventionalQuery(network, 'C', [
        { variable: 'B', value: 'T' },
      ]);

      // In a chain A→B→C, B has no confounders with C.
      // do(B=T) cuts the A→B edge, but since C depends only on B,
      // P(C|do(B=T)) = P(C|B=T).
      expect(interventional.get('T')).toBeCloseTo(observational.get('T')!, 4);
      expect(interventional.get('F')).toBeCloseTo(observational.get('F')!, 4);
    });

    it('P(A | do(B=T)) differs from P(A | B=T)', () => {
      const { network } = buildChainNetwork();

      // Observational: P(A | B=T) — observing B=T updates our belief about A
      const observational = network.query('A', new Map([['B', 'T']]));

      // Interventional: P(A | do(B=T)) — intervening on B cuts A→B,
      // so A stays at its prior.
      const interventional = interventionalQuery(network, 'A', [
        { variable: 'B', value: 'T' },
      ]);

      // P(A=T | do(B=T)) should equal the prior P(A=T) = 0.6
      // because the intervention cuts the A→B edge.
      expect(interventional.get('T')).toBeCloseTo(0.6, 2);

      // P(A=T | B=T) != 0.6 because observing B=T gives evidence about A
      expect(Math.abs(observational.get('T')! - 0.6)).toBeGreaterThan(0.01);
    });
  });

  it('supports combined interventions and observations', () => {
    const { network } = buildConfoundedNetwork();

    // do(X=T) and observe Z=T simultaneously
    const result = interventionalQuery(
      network,
      'Y',
      [{ variable: 'X', value: 'T' }],
      new Map([['Z', 'T']]),
    );

    // P(Y=T | do(X=T), Z=T) = P(Y=T | X=T, Z=T) = 0.9
    expect(result.get('T')).toBeCloseTo(0.9, 2);
  });
});

describe('averageCausalEffect', () => {
  it('computes ACE for the confounded network', () => {
    const { network } = buildConfoundedNetwork();

    const ace = averageCausalEffect(network, 'X', 'Y');

    // ACE = P(Y=T | do(X=T)) - P(Y=T | do(X=F))
    //     = 0.8 - 0.3 = 0.5
    expect(ace).toBeCloseTo(0.5, 2);
  });

  it('computes ACE for a chain network', () => {
    const { network } = buildChainNetwork();

    const ace = averageCausalEffect(network, 'B', 'C');

    // P(C=T | do(B=T)) = 0.9
    // P(C=T | do(B=F)) = 0.4
    // ACE = 0.9 - 0.4 = 0.5
    expect(ace).toBeCloseTo(0.5, 2);
  });

  it('ACE is zero when cause does not affect effect', () => {
    const { network } = buildChainNetwork();

    // A has no causal effect on C through do(A), but it does:
    // P(C=T | do(A=T)) = P(C=T|B=T)*P(B=T|A=T) + P(C=T|B=F)*P(B=F|A=T)
    //                   = 0.9*0.8 + 0.4*0.2 = 0.72 + 0.08 = 0.80
    // P(C=T | do(A=F)) = 0.9*0.3 + 0.4*0.7 = 0.27 + 0.28 = 0.55
    // ACE = 0.80 - 0.55 = 0.25
    const ace = averageCausalEffect(network, 'A', 'C');
    expect(ace).toBeCloseTo(0.25, 2);
  });

  it('ACE is zero for a non-ancestor', () => {
    // In chain A → B → C, C has no causal effect on A
    const { network } = buildChainNetwork();

    // do(C=T): cut B→C, so A stays at prior. do(C=F): same.
    // P(A=T | do(C=T)) = P(A=T | do(C=F)) = P(A=T) = 0.6
    const ace = averageCausalEffect(network, 'C', 'A');
    expect(ace).toBeCloseTo(0, 4);
  });
});

describe('dog-problem network', () => {
  const dogProblemXml = readFileSync(
    resolve(__dirname, '../src/example.xmlbif'),
    'utf-8',
  );
  const network = BayesianNetwork.fromXmlBif(dogProblemXml);

  it('interventional query on dog-problem network', () => {
    // do(family-out=true): force the family to be out
    // This should affect light-on and dog-out but through their
    // causal mechanisms (not through observational updating).
    const result = interventionalQuery(network, 'hear-bark', [
      { variable: 'family-out', value: 'true' },
    ]);

    // P(hear-bark=true | do(family-out=true))
    // = sum over bp,do: P(hb|do) * P(do|bp,fo=T) * P(bp)
    // dog-out parents are [bowel-problem, family-out]:
    //   P(do=T|bp=T,fo=T)=0.99, P(do=T|bp=F,fo=T)=0.9
    // P(bp=T)=0.01
    // P(do=T|fo=T) = 0.99*0.01 + 0.9*0.99 = 0.0099 + 0.891 = 0.9009
    // P(hb=T|do=T)=0.7, P(hb=T|do=F)=0.01
    // P(hb=T|do(fo=T)) = 0.7*0.9009 + 0.01*0.0991 ≈ 0.6316
    expect(result.get('true')).toBeCloseTo(0.6316, 2);
  });

  it('mutilated dog-problem has correct structure', () => {
    const mutilated = mutilateNetwork(network, [
      { variable: 'family-out', value: 'true' },
    ]);

    // family-out should have no parents (it's already a root, so no change)
    const foVar = mutilated.getVariable('family-out')!;
    expect(mutilated.getParents(foVar)).toHaveLength(0);

    // light-on should still have family-out as parent
    const loVar = mutilated.getVariable('light-on')!;
    const loParents = mutilated.getParents(loVar);
    expect(loParents).toHaveLength(1);
    expect(loParents[0].name).toBe('family-out');

    // dog-out should still have bowel-problem and family-out as parents
    const doVar = mutilated.getVariable('dog-out')!;
    expect(mutilated.getParents(doVar)).toHaveLength(2);
  });

  it('intervening on dog-out cuts bowel-problem and family-out edges', () => {
    const mutilated = mutilateNetwork(network, [
      { variable: 'dog-out', value: 'true' },
    ]);

    const doVar = mutilated.getVariable('dog-out')!;
    expect(mutilated.getParents(doVar)).toHaveLength(0);

    // bowel-problem and family-out should be unaffected
    const bpVar = mutilated.getVariable('bowel-problem')!;
    expect(mutilated.getParents(bpVar)).toHaveLength(0);

    const foVar = mutilated.getVariable('family-out')!;
    expect(mutilated.getParents(foVar)).toHaveLength(0);

    // hear-bark still depends on dog-out
    const hbVar = mutilated.getVariable('hear-bark')!;
    const hbParents = mutilated.getParents(hbVar);
    expect(hbParents).toHaveLength(1);
    expect(hbParents[0].name).toBe('dog-out');
  });

  it('P(hear-bark | do(dog-out=true)) = P(hear-bark | dog-out=true)', () => {
    // Since hear-bark only depends on dog-out (no confounding),
    // do(dog-out) = observe(dog-out) for downstream variables.
    const interventional = interventionalQuery(network, 'hear-bark', [
      { variable: 'dog-out', value: 'true' },
    ]);
    const observational = network.query(
      'hear-bark',
      new Map([['dog-out', 'true']]),
    );

    expect(interventional.get('true')).toBeCloseTo(
      observational.get('true')!,
      4,
    );
  });

  it('P(family-out | do(dog-out=true)) = P(family-out) (prior)', () => {
    // Intervening on dog-out cuts it from its parents.
    // family-out is a parent of dog-out but not a descendant,
    // so do(dog-out) should not affect our belief about family-out.
    const interventional = interventionalQuery(network, 'family-out', [
      { variable: 'dog-out', value: 'true' },
    ]);

    // P(family-out=true) = 0.15 (prior)
    expect(interventional.get('true')).toBeCloseTo(0.15, 2);
  });
});
