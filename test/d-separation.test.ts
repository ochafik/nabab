import { describe, it, expect } from 'vitest';
import { isDSeparated, dConnectedVars, markovBlanket, BayesianNetwork } from '../src/lib/index.js';
import type { Variable, CPT } from '../src/lib/types.js';

// ─── Helpers ──────────────────────────────────────────────────────────

function makeVar(name: string): Variable {
  return { name, outcomes: ['t', 'f'] };
}

/** Build a uniform CPT for a variable with the given parents. */
function makeCPT(variable: Variable, parents: Variable[]): CPT {
  const rows = parents.reduce((n, p) => n * p.outcomes.length, 1);
  const cols = variable.outcomes.length;
  const table = new Float64Array(rows * cols);
  const prob = 1 / cols;
  table.fill(prob);
  return { variable, parents, table };
}

/**
 * Build a BayesianNetwork from a list of (child, parents[]) declarations.
 * Variables are created automatically.
 */
function buildNetwork(
  edges: Array<[string, string[]]>,
): { network: BayesianNetwork; vars: Map<string, Variable> } {
  const varMap = new Map<string, Variable>();
  const getVar = (name: string) => {
    if (!varMap.has(name)) varMap.set(name, makeVar(name));
    return varMap.get(name)!;
  };

  // Collect all variable names (order: parents first where possible)
  for (const [child, parents] of edges) {
    for (const p of parents) getVar(p);
    getVar(child);
  }

  const variables = [...varMap.values()];
  const cpts: CPT[] = [];

  // Build CPTs: every variable needs one, even roots
  for (const v of variables) {
    const entry = edges.find(([c]) => c === v.name);
    const parents = entry ? entry[1].map(p => varMap.get(p)!) : [];
    cpts.push(makeCPT(v, parents));
  }

  const network = new BayesianNetwork({ name: 'test', variables, cpts });
  return { network, vars: varMap };
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('d-separation', () => {
  describe('chain: A → B → C', () => {
    const { network } = buildNetwork([
      ['B', ['A']],
      ['C', ['B']],
    ]);

    it('A and C are d-connected given {} (no evidence)', () => {
      expect(isDSeparated(network, 'A', 'C', [])).toBe(false);
    });

    it('A and C are d-separated given {B}', () => {
      expect(isDSeparated(network, 'A', 'C', ['B'])).toBe(true);
    });

    it('is symmetric: C and A are d-separated given {B}', () => {
      expect(isDSeparated(network, 'C', 'A', ['B'])).toBe(true);
    });
  });

  describe('fork: A ← B → C', () => {
    const { network } = buildNetwork([
      ['A', ['B']],
      ['C', ['B']],
    ]);

    it('A and C are d-connected given {} (common cause active)', () => {
      expect(isDSeparated(network, 'A', 'C', [])).toBe(false);
    });

    it('A and C are d-separated given {B} (common cause blocked)', () => {
      expect(isDSeparated(network, 'A', 'C', ['B'])).toBe(true);
    });
  });

  describe('collider (v-structure): A → C ← B', () => {
    const { network } = buildNetwork([
      ['C', ['A', 'B']],
    ]);

    it('A and B are d-separated given {} (collider blocks)', () => {
      expect(isDSeparated(network, 'A', 'B', [])).toBe(true);
    });

    it('A and B are d-connected given {C} (explaining away)', () => {
      expect(isDSeparated(network, 'A', 'B', ['C'])).toBe(false);
    });
  });

  describe('collider with descendant evidence', () => {
    // A → C ← B, C → D
    // Observing D (descendant of collider) should also open the path A-B
    const { network } = buildNetwork([
      ['C', ['A', 'B']],
      ['D', ['C']],
    ]);

    it('A and B are d-separated given {}', () => {
      expect(isDSeparated(network, 'A', 'B', [])).toBe(true);
    });

    it('A and B are d-connected given {D} (descendant of collider)', () => {
      expect(isDSeparated(network, 'A', 'B', ['D'])).toBe(false);
    });
  });

  describe('longer chain: A → B → C → D', () => {
    const { network } = buildNetwork([
      ['B', ['A']],
      ['C', ['B']],
      ['D', ['C']],
    ]);

    it('A and D are d-connected given {}', () => {
      expect(isDSeparated(network, 'A', 'D', [])).toBe(false);
    });

    it('A and D are d-separated given {B}', () => {
      expect(isDSeparated(network, 'A', 'D', ['B'])).toBe(true);
    });

    it('A and D are d-separated given {C}', () => {
      expect(isDSeparated(network, 'A', 'D', ['C'])).toBe(true);
    });

    it('A and D are d-connected given {B, C} is still separated (both intermediate blocked)', () => {
      expect(isDSeparated(network, 'A', 'D', ['B', 'C'])).toBe(true);
    });
  });

  describe('diamond: A → B, A → C, B → D, C → D', () => {
    const { network } = buildNetwork([
      ['B', ['A']],
      ['C', ['A']],
      ['D', ['B', 'C']],
    ]);

    it('B and C are d-connected given {} (through common parent A)', () => {
      expect(isDSeparated(network, 'B', 'C', [])).toBe(false);
    });

    it('B and C are d-separated given {A} (fork blocked, collider at D not observed)', () => {
      expect(isDSeparated(network, 'B', 'C', ['A'])).toBe(true);
    });

    it('B and C are d-connected given {A, D} (collider D observed opens path)', () => {
      expect(isDSeparated(network, 'B', 'C', ['A', 'D'])).toBe(false);
    });
  });

  describe('string-based variable lookup', () => {
    const { network } = buildNetwork([
      ['B', ['A']],
      ['C', ['B']],
    ]);

    it('works with string variable names', () => {
      expect(isDSeparated(network, 'A', 'C', ['B'])).toBe(true);
    });

    it('throws on unknown variable', () => {
      expect(() => isDSeparated(network, 'A', 'UNKNOWN', [])).toThrow('Unknown variable');
    });
  });
});

describe('dConnectedVars', () => {
  describe('chain: A → B → C', () => {
    const { network, vars } = buildNetwork([
      ['B', ['A']],
      ['C', ['B']],
    ]);

    it('from A given {}: B and C are d-connected', () => {
      const connected = dConnectedVars(network, 'A', []);
      expect(connected.has(vars.get('B')!)).toBe(true);
      expect(connected.has(vars.get('C')!)).toBe(true);
    });

    it('from A given {B}: nothing is d-connected', () => {
      const connected = dConnectedVars(network, 'A', ['B']);
      expect(connected.has(vars.get('C')!)).toBe(false);
    });
  });

  describe('collider: A → C ← B', () => {
    const { network, vars } = buildNetwork([
      ['C', ['A', 'B']],
    ]);

    it('from A given {}: only C is d-connected (B is blocked by collider)', () => {
      const connected = dConnectedVars(network, 'A', []);
      expect(connected.has(vars.get('C')!)).toBe(true);
      expect(connected.has(vars.get('B')!)).toBe(false);
    });

    it('from A given {C}: B is d-connected (explaining away)', () => {
      const connected = dConnectedVars(network, 'A', ['C']);
      expect(connected.has(vars.get('B')!)).toBe(true);
    });
  });
});

describe('markovBlanket', () => {
  describe('diamond: A → B, A → C, B → D, C → D', () => {
    const { network, vars } = buildNetwork([
      ['B', ['A']],
      ['C', ['A']],
      ['D', ['B', 'C']],
    ]);

    it('Markov blanket of A = {B, C} (children)', () => {
      const mb = markovBlanket(network, 'A');
      expect(mb.size).toBe(2);
      expect(mb.has(vars.get('B')!)).toBe(true);
      expect(mb.has(vars.get('C')!)).toBe(true);
    });

    it('Markov blanket of B = {A, D, C} (parent + child + co-parent)', () => {
      const mb = markovBlanket(network, 'B');
      expect(mb.size).toBe(3);
      expect(mb.has(vars.get('A')!)).toBe(true);
      expect(mb.has(vars.get('D')!)).toBe(true);
      expect(mb.has(vars.get('C')!)).toBe(true);
    });

    it('Markov blanket of D = {B, C} (parents only, no children)', () => {
      const mb = markovBlanket(network, 'D');
      expect(mb.size).toBe(2);
      expect(mb.has(vars.get('B')!)).toBe(true);
      expect(mb.has(vars.get('C')!)).toBe(true);
    });
  });

  describe('chain: A → B → C', () => {
    const { network, vars } = buildNetwork([
      ['B', ['A']],
      ['C', ['B']],
    ]);

    it('Markov blanket of B = {A, C}', () => {
      const mb = markovBlanket(network, 'B');
      expect(mb.size).toBe(2);
      expect(mb.has(vars.get('A')!)).toBe(true);
      expect(mb.has(vars.get('C')!)).toBe(true);
    });

    it('Markov blanket of A = {B}', () => {
      const mb = markovBlanket(network, 'A');
      expect(mb.size).toBe(1);
      expect(mb.has(vars.get('B')!)).toBe(true);
    });

    it('Markov blanket of C = {B}', () => {
      const mb = markovBlanket(network, 'C');
      expect(mb.size).toBe(1);
      expect(mb.has(vars.get('B')!)).toBe(true);
    });
  });

  describe('Markov blanket implies d-separation from non-blanket', () => {
    // A → B → C → D
    const { network, vars } = buildNetwork([
      ['B', ['A']],
      ['C', ['B']],
      ['D', ['C']],
    ]);

    it('B is d-separated from D given its Markov blanket {A, C}', () => {
      const mb = markovBlanket(network, 'B');
      const mbNames = [...mb].map(v => v.name);
      expect(isDSeparated(network, 'B', 'D', mbNames)).toBe(true);
    });

    it('A is d-separated from C given its Markov blanket {B}', () => {
      const mb = markovBlanket(network, 'A');
      const mbNames = [...mb].map(v => v.name);
      expect(isDSeparated(network, 'A', 'C', mbNames)).toBe(true);
    });

    it('A is d-separated from D given its Markov blanket {B}', () => {
      const mb = markovBlanket(network, 'A');
      const mbNames = [...mb].map(v => v.name);
      expect(isDSeparated(network, 'A', 'D', mbNames)).toBe(true);
    });
  });
});
