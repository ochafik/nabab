import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseBif } from '../src/lib/bif-parser.js';

const MODELS_DIR = join(import.meta.dirname, '..', 'bench', 'models');

/** Expected node counts for the standard bnlearn benchmarks. */
const EXPECTED_NODES: Record<string, number> = {
  asia: 8,
  alarm: 37,
  sachs: 11,
  child: 20,
  insurance: 27,
  water: 32,
  hepar2: 70,
};

/** Expected edge counts (directed arcs). */
const EXPECTED_EDGES: Record<string, number> = {
  asia: 8,
  alarm: 46,
  sachs: 17,
  child: 25,
  insurance: 52,
  water: 66,
  hepar2: 123,
};

function listBifFiles(): string[] {
  try {
    return readdirSync(MODELS_DIR)
      .filter(f => f.endsWith('.bif'))
      .sort();
  } catch {
    return [];
  }
}

const bifFiles = listBifFiles();

describe('BIF Parser', () => {
  it('has downloaded model files', () => {
    expect(bifFiles.length).toBeGreaterThan(0);
  });

  describe.each(bifFiles.map(f => [f.replace('.bif', ''), f]))('%s', (modelName, fileName) => {
    const content = readFileSync(join(MODELS_DIR, fileName), 'utf-8');
    const parsed = parseBif(content);

    it('parses without error', () => {
      expect(parsed).toBeDefined();
      expect(parsed.variables.length).toBeGreaterThan(0);
      expect(parsed.cpts.length).toBeGreaterThan(0);
    });

    it('has expected number of nodes', () => {
      const expected = EXPECTED_NODES[modelName];
      if (expected !== undefined) {
        expect(parsed.variables.length).toBe(expected);
      }
    });

    it('has expected number of edges', () => {
      const expected = EXPECTED_EDGES[modelName];
      if (expected !== undefined) {
        const edgeCount = parsed.cpts.reduce((sum, cpt) => sum + cpt.parents.length, 0);
        expect(edgeCount).toBe(expected);
      }
    });

    it('has one CPT per variable', () => {
      expect(parsed.cpts.length).toBe(parsed.variables.length);
    });

    it('has probability tables that sum to ~1 per parent combination', () => {
      for (const cpt of parsed.cpts) {
        const numOutcomes = cpt.variable.outcomes.length;
        const numRows = cpt.table.length / numOutcomes;
        expect(cpt.table.length).toBe(numRows * numOutcomes);

        for (let row = 0; row < numRows; row++) {
          let sum = 0;
          for (let k = 0; k < numOutcomes; k++) {
            sum += cpt.table[row * numOutcomes + k];
          }
          expect(sum).toBeCloseTo(1.0, 2);
        }
      }
    });

    it('has all probability values in [0, 1]', () => {
      for (const cpt of parsed.cpts) {
        for (let i = 0; i < cpt.table.length; i++) {
          expect(cpt.table[i]).toBeGreaterThanOrEqual(0);
          expect(cpt.table[i]).toBeLessThanOrEqual(1.0001); // tiny tolerance for rounding
        }
      }
    });

    it('has correct table sizes', () => {
      for (const cpt of parsed.cpts) {
        const expectedSize =
          cpt.variable.outcomes.length *
          cpt.parents.reduce((acc, p) => acc * p.outcomes.length, 1);
        expect(cpt.table.length).toBe(expectedSize);
      }
    });

    it('has unique variable names', () => {
      const names = parsed.variables.map(v => v.name);
      expect(new Set(names).size).toBe(names.length);
    });
  });
});

describe('BIF Parser - inline tests', () => {
  it('parses a minimal network', () => {
    const bif = `
network test {}
variable A {
  type discrete [ 2 ] { yes, no };
}
probability ( A ) {
  table 0.3, 0.7;
}
`;
    const parsed = parseBif(bif);
    expect(parsed.name).toBe('test');
    expect(parsed.variables.length).toBe(1);
    expect(parsed.variables[0].name).toBe('A');
    expect(parsed.variables[0].outcomes).toEqual(['yes', 'no']);
    expect(Array.from(parsed.cpts[0].table)).toEqual([0.3, 0.7]);
  });

  it('parses conditional probability rows', () => {
    const bif = `
network test {}
variable A {
  type discrete [ 2 ] { yes, no };
}
variable B {
  type discrete [ 2 ] { true, false };
}
probability ( B | A ) {
  (yes) 0.9, 0.1;
  (no) 0.4, 0.6;
}
probability ( A ) {
  table 0.6, 0.4;
}
`;
    const parsed = parseBif(bif);
    expect(parsed.variables.length).toBe(2);

    const cptB = parsed.cpts.find(c => c.variable.name === 'B')!;
    expect(cptB).toBeDefined();
    expect(cptB.parents.length).toBe(1);
    expect(cptB.parents[0].name).toBe('A');
    // Row for A=yes: P(B=true|A=yes)=0.9, P(B=false|A=yes)=0.1
    // Row for A=no:  P(B=true|A=no)=0.4, P(B=false|A=no)=0.6
    expect(Array.from(cptB.table)).toEqual([0.9, 0.1, 0.4, 0.6]);
  });

  it('parses multi-parent conditional', () => {
    const bif = `
network test {}
variable A { type discrete [ 2 ] { a0, a1 }; }
variable B { type discrete [ 2 ] { b0, b1 }; }
variable C { type discrete [ 2 ] { c0, c1 }; }
probability ( A ) { table 0.5, 0.5; }
probability ( B ) { table 0.5, 0.5; }
probability ( C | A, B ) {
  (a0, b0) 0.1, 0.9;
  (a1, b0) 0.2, 0.8;
  (a0, b1) 0.3, 0.7;
  (a1, b1) 0.4, 0.6;
}
`;
    const parsed = parseBif(bif);
    const cptC = parsed.cpts.find(c => c.variable.name === 'C')!;
    expect(cptC.parents.map(p => p.name)).toEqual(['A', 'B']);
    // Row-major: A varies outermost, B innermost
    // (a0,b0) -> index 0, (a0,b1) -> index 1, (a1,b0) -> index 2, (a1,b1) -> index 3
    expect(Array.from(cptC.table)).toEqual([0.1, 0.9, 0.3, 0.7, 0.2, 0.8, 0.4, 0.6]);
  });

  it('strips comments', () => {
    const bif = `
// This is a comment
network test { /* inline comment */ }
variable X {
  type discrete [ 2 ] { on, off }; // states
}
probability ( X ) {
  table 0.5, 0.5; /* equal priors */
}
`;
    const parsed = parseBif(bif);
    expect(parsed.variables.length).toBe(1);
    expect(parsed.variables[0].name).toBe('X');
  });

  it('handles position properties', () => {
    const bif = `
network test {}
variable X {
  type discrete [ 2 ] { on, off };
  property position = (100, 200);
}
probability ( X ) {
  table 0.5, 0.5;
}
`;
    const parsed = parseBif(bif);
    expect(parsed.variables[0].position).toEqual({ x: 100, y: 200 });
  });
});
