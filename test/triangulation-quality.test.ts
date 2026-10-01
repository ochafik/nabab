import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { Variable, CPT, Evidence, LikelihoodEvidence, Distribution } from '../src/lib/types.js';
import {
  buildDirectedGraph,
  moralize,
  triangulate,
  eliminate,
  buildJunctionTree,
  type UndirectedGraph,
  type JunctionTree,
  type EliminationHeuristic,
} from '../src/lib/graph.js';
import {
  infer,
  estimateInferenceCost,
  DEFAULT_MAX_CLIQUE_ENTRIES,
} from '../src/lib/inference.js';
import { BayesianNetwork } from '../src/lib/network.js';

// ─────────────────────────────────────────────────────────────────────
// Helpers: test network construction (deterministic seeded CPTs)
// ─────────────────────────────────────────────────────────────────────

function makeVar(name: string, k = 2): Variable {
  return { name, outcomes: Array.from({ length: k }, (_, i) => `${name}${i}`) };
}

let _seed = 987654321;
function rnd(): number {
  _seed = (_seed * 1103515245 + 12345) & 0x7fffffff;
  return _seed / 0x7fffffff;
}
function seedRng(s: number) {
  _seed = s;
}

/** A CPT with random, properly normalized rows (P(v | parents) sums to 1 per parent config). */
function randCPT(v: Variable, parents: Variable[]): CPT {
  let rows = 1;
  for (const p of parents) rows *= p.outcomes.length;
  const k = v.outcomes.length;
  const table = new Float64Array(rows * k);
  for (let r = 0; r < rows; r++) {
    const vals: number[] = [];
    let sum = 0;
    for (let i = 0; i < k; i++) {
      const x = 0.05 + rnd();
      vals.push(x);
      sum += x;
    }
    for (let i = 0; i < k; i++) table[r * k + i] = vals[i] / sum;
  }
  return { variable: v, parents, table };
}

function dagFromCpts(variables: Variable[], cpts: CPT[]) {
  const edges: Array<[Variable, Variable]> = [];
  for (const cpt of cpts) for (const p of cpt.parents) edges.push([p, cpt.variable]);
  return buildDirectedGraph([...variables], edges);
}

// ─────────────────────────────────────────────────────────────────────
// Independent brute-force reference: enumerate the full joint, normalize,
// marginalize. This is GROUND TRUTH — deliberately not using any nabab
// junction-tree/factor machinery.
// ─────────────────────────────────────────────────────────────────────

function bruteForcePosteriors(
  variables: Variable[],
  cpts: CPT[],
  evidence?: Evidence,
  likelihood?: LikelihoodEvidence,
): Map<Variable, Distribution> {
  const n = variables.length;
  const cards = variables.map(v => v.outcomes.length);
  const idxOf = new Map(variables.map((v, i) => [v, i] as const));
  const byName = new Map(variables.map(v => [v.name, v] as const));
  const marg = variables.map(v => new Array(v.outcomes.length).fill(0));
  const assign = new Array(n).fill(0);
  const total = cards.reduce((a, b) => a * b, 1);
  let Z = 0;

  for (let t = 0; t < total; t++) {
    // Joint probability = product of CPT entries for this full assignment.
    let p = 1;
    for (const cpt of cpts) {
      let index = 0;
      for (const par of cpt.parents) index = index * par.outcomes.length + assign[idxOf.get(par)!];
      index = index * cpt.variable.outcomes.length + assign[idxOf.get(cpt.variable)!];
      p *= cpt.table[index];
      if (p === 0) break;
    }

    if (p !== 0) {
      // Hard evidence: drop inconsistent assignments.
      let consistent = true;
      if (evidence) {
        for (const [name, out] of evidence) {
          const v = byName.get(name)!;
          if (v.outcomes[assign[idxOf.get(v)!]] !== out) {
            consistent = false;
            break;
          }
        }
      }
      if (consistent) {
        // Likelihood/soft evidence: multiply by per-outcome weight.
        if (likelihood) {
          for (const [name, w] of likelihood) {
            const v = byName.get(name)!;
            p *= w.get(v.outcomes[assign[idxOf.get(v)!]]) ?? 1;
          }
        }
        Z += p;
        for (let i = 0; i < n; i++) marg[i][assign[i]] += p;
      }
    }

    // Odometer increment.
    for (let k = n - 1; k >= 0; k--) {
      if (++assign[k] < cards[k]) break;
      assign[k] = 0;
    }
  }

  const out = new Map<Variable, Distribution>();
  variables.forEach((v, i) => {
    const d: Distribution = new Map();
    v.outcomes.forEach((o, j) => d.set(o, marg[i][j] / Z));
    out.set(v, d);
  });
  return out;
}

function expectPosteriorsMatch(
  actual: Map<Variable, Distribution>,
  expected: Map<Variable, Distribution>,
  variables: Variable[],
  tol = 1e-9,
) {
  for (const v of variables) {
    const a = actual.get(v)!;
    const e = expected.get(v)!;
    expect(a, `posterior present for ${v.name}`).toBeTruthy();
    for (const o of v.outcomes) {
      expect(Math.abs((a.get(o) ?? NaN) - (e.get(o) ?? NaN)), `${v.name}=${o}`).toBeLessThan(tol);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────
// Structural checkers (independent implementations, for the correctness bar)
// ─────────────────────────────────────────────────────────────────────

/**
 * A graph is chordal iff repeatedly removing a simplicial vertex (one whose
 * remaining neighbours form a clique) eliminates the whole graph.
 */
function isChordal(graph: UndirectedGraph): boolean {
  const adj = new Map<Variable, Set<Variable>>();
  for (const [v, ns] of graph.neighbors) adj.set(v, new Set(ns));
  const remaining = new Set(graph.vertices);

  while (remaining.size > 0) {
    let simplicialVertex: Variable | null = null;
    for (const v of remaining) {
      const ns = [...adj.get(v)!].filter(n => remaining.has(n));
      let simplicial = true;
      outer: for (let i = 0; i < ns.length; i++) {
        const ai = adj.get(ns[i])!;
        for (let j = i + 1; j < ns.length; j++) {
          if (!ai.has(ns[j])) {
            simplicial = false;
            break outer;
          }
        }
      }
      if (simplicial) {
        simplicialVertex = v;
        break;
      }
    }
    if (!simplicialVertex) return false; // no simplicial vertex → not chordal
    remaining.delete(simplicialVertex);
  }
  return true;
}

/**
 * Running-intersection property: for every variable, the set of cliques
 * containing it must form a connected subtree of the junction tree.
 */
function satisfiesRIP(jt: JunctionTree): boolean {
  const allVars = new Set(jt.cliques.flat());
  for (const v of allVars) {
    const containing: number[] = [];
    jt.cliques.forEach((c, i) => {
      if (c.includes(v)) containing.push(i);
    });
    if (containing.length <= 1) continue;
    // BFS over the tree restricted to `containing`; must reach them all.
    const inSet = new Set(containing);
    const seen = new Set<number>([containing[0]]);
    const stack = [containing[0]];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const nb of jt.neighbors.get(cur) ?? []) {
        if (inSet.has(nb) && !seen.has(nb)) {
          seen.add(nb);
          stack.push(nb);
        }
      }
    }
    if (seen.size !== containing.length) return false;
  }
  return true;
}

/** Is `jt` a tree (edges == cliques − 1, and connected)? */
function isTree(jt: JunctionTree): boolean {
  const n = jt.cliques.length;
  if (n === 0) return true;
  let edges = 0;
  for (const ns of jt.neighbors.values()) edges += ns.size;
  edges /= 2;
  if (edges !== n - 1) return false;
  // connectivity
  const seen = new Set<number>([0]);
  const stack = [0];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const nb of jt.neighbors.get(cur) ?? []) {
      if (!seen.has(nb)) {
        seen.add(nb);
        stack.push(nb);
      }
    }
  }
  return seen.size === n;
}

// ─────────────────────────────────────────────────────────────────────
// Test networks
// ─────────────────────────────────────────────────────────────────────

function chainNet() {
  seedRng(1);
  const A = makeVar('A'), B = makeVar('B'), C = makeVar('C');
  const variables = [A, B, C];
  const cpts = [randCPT(A, []), randCPT(B, [A]), randCPT(C, [B])];
  return { variables, cpts };
}

/** Collider / v-structure: A -> C <- B. Moralization marries A and B. */
function colliderNet() {
  seedRng(2);
  const A = makeVar('A'), B = makeVar('B'), C = makeVar('C');
  const variables = [A, B, C];
  const cpts = [randCPT(A, []), randCPT(B, []), randCPT(C, [A, B])];
  return { variables, cpts };
}

/** Diamond / loop: A->B, A->C, B->D, C->D. Moral graph has a 4-cycle needing a chord. */
function diamondNet() {
  seedRng(3);
  const A = makeVar('A'), B = makeVar('B'), C = makeVar('C'), D = makeVar('D');
  const variables = [A, B, C, D];
  const cpts = [randCPT(A, []), randCPT(B, [A]), randCPT(C, [A]), randCPT(D, [B, C])];
  return { variables, cpts };
}

/** Mixed cardinalities + a collider, to exercise cardinality handling. */
function mixedNet() {
  seedRng(4);
  const X = makeVar('X', 3), Y = makeVar('Y', 2), Z = makeVar('Z', 4), W = makeVar('W', 2), V = makeVar('V', 3);
  const variables = [X, Y, Z, W, V];
  const cpts = [randCPT(X, []), randCPT(Y, [X]), randCPT(Z, [X]), randCPT(W, [Y, Z]), randCPT(V, [W])];
  return { variables, cpts };
}

const dogProblemXml = readFileSync(resolve(__dirname, '../src/example.xmlbif'), 'utf-8');

// ─────────────────────────────────────────────────────────────────────

describe('Exactness vs brute-force reference (marginals are elimination-order invariant)', () => {
  const nets: Array<{ name: string; make: () => { variables: Variable[]; cpts: CPT[] } }> = [
    { name: 'chain A->B->C', make: chainNet },
    { name: 'collider A->C<-B', make: colliderNet },
    { name: 'diamond A->B,A->C,B->D,C->D', make: diamondNet },
    { name: 'mixed cardinalities', make: mixedNet },
  ];

  for (const { name, make } of nets) {
    it(`${name}: priors match brute force (all heuristics)`, () => {
      const { variables, cpts } = make();
      const expected = bruteForcePosteriors(variables, cpts);
      for (const h of ['min-fill', 'min-degree', 'input-order'] as EliminationHeuristic[]) {
        const res = infer(variables, cpts, undefined, undefined, {
          eliminationHeuristic: h,
          maxCliqueEntries: Infinity,
        });
        expectPosteriorsMatch(res.posteriors, expected, variables);
      }
    });

    it(`${name}: posteriors with hard evidence match brute force`, () => {
      const { variables, cpts } = make();
      const ev: Evidence = new Map([[variables[variables.length - 1].name, variables[variables.length - 1].outcomes[0]]]);
      const expected = bruteForcePosteriors(variables, cpts, ev);
      const res = infer(variables, cpts, ev);
      expectPosteriorsMatch(res.posteriors, expected, variables);
    });

    it(`${name}: soft/likelihood evidence matches brute force`, () => {
      const { variables, cpts } = make();
      const target = variables[Math.floor(variables.length / 2)];
      const lik: LikelihoodEvidence = new Map([
        [target.name, new Map(target.outcomes.map((o, i) => [o, i === 0 ? 0.8 : 0.2]))],
      ]);
      const expected = bruteForcePosteriors(variables, cpts, undefined, lik);
      const res = infer(variables, cpts, undefined, lik);
      expectPosteriorsMatch(res.posteriors, expected, variables);
    });
  }

  it('dog-problem: priors and evidence posteriors match brute force', () => {
    const net = BayesianNetwork.fromXmlBif(dogProblemXml);
    const variables = [...net.variables];
    const cpts = [...net.cpts];

    const priors = bruteForcePosteriors(variables, cpts);
    expectPosteriorsMatch(net.infer().posteriors, priors, variables);

    const ev: Evidence = new Map([['hear-bark', 'true']]);
    const expected = bruteForcePosteriors(variables, cpts, ev);
    expectPosteriorsMatch(net.infer(ev).posteriors, expected, variables);
  });
});

describe('Triangulation is chordal and junction tree satisfies RIP', () => {
  for (const { name, make } of [
    { name: 'diamond', make: diamondNet },
    { name: 'collider', make: colliderNet },
    { name: 'mixed', make: mixedNet },
  ]) {
    it(`${name}: triangulated graph is chordal, jt is a tree with RIP`, () => {
      const { variables, cpts } = make();
      const dag = dagFromCpts(variables, cpts);
      const moral = moralize(dag);
      const tri = triangulate(moral, 'min-fill');
      expect(isChordal(tri), 'triangulated graph chordal').toBe(true);

      const jt = buildJunctionTree(dag);
      expect(isTree(jt), 'junction graph is a tree').toBe(true);
      expect(satisfiesRIP(jt), 'running-intersection property').toBe(true);
    });
  }

  it('dog-problem: chordal + RIP', () => {
    const net = BayesianNetwork.fromXmlBif(dogProblemXml);
    const dag = dagFromCpts([...net.variables], [...net.cpts]);
    const tri = triangulate(moralize(dag), 'min-fill');
    expect(isChordal(tri)).toBe(true);
    const jt = buildJunctionTree(dag);
    expect(isTree(jt)).toBe(true);
    expect(satisfiesRIP(jt)).toBe(true);
  });

  it('an untriangulated 4-cycle is NOT chordal (checker sanity)', () => {
    // A-B-C-D-A cycle, no chord.
    const A = makeVar('A'), B = makeVar('B'), C = makeVar('C'), D = makeVar('D');
    const neighbors = new Map<Variable, Set<Variable>>([
      [A, new Set([B, D])],
      [B, new Set([A, C])],
      [C, new Set([B, D])],
      [D, new Set([C, A])],
    ]);
    expect(isChordal({ vertices: [A, B, C, D], neighbors })).toBe(false);
  });
});

describe('Determinism', () => {
  it('buildJunctionTree is deterministic across runs', () => {
    const { variables, cpts } = mixedNet();
    const dag = dagFromCpts(variables, cpts);
    const key = (jt: JunctionTree) =>
      jt.cliques.map(c => c.map(v => v.name).sort().join('+')).sort().join('|');
    expect(key(buildJunctionTree(dag))).toBe(key(buildJunctionTree(dag)));
  });

  it('eliminate produces a stable ordering and induced width', () => {
    const { variables, cpts } = diamondNet();
    const moral = moralize(dagFromCpts(variables, cpts));
    const a = eliminate(moral, 'min-fill');
    const b = eliminate(moral, 'min-fill');
    expect(a.order.map(v => v.name)).toEqual(b.order.map(v => v.name));
    expect(a.inducedWidth).toBe(b.inducedWidth);
  });
});

describe('Cost estimation API (structure-only)', () => {
  it('reports realized treewidth = max clique size − 1 and clique table sizes', () => {
    const { variables, cpts } = mixedNet();
    const est = estimateInferenceCost(variables, cpts);
    expect(est.treewidth).toBe(est.maxCliqueSize - 1);
    // largest clique table = product of member cardinalities
    const prod = est.largestClique.reduce((a, v) => a * v.outcomes.length, 1);
    expect(est.maxCliqueEntries).toBe(prod);
    expect(est.totalCliqueEntries).toBeGreaterThanOrEqual(est.maxCliqueEntries);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Value demonstration: min-fill vs a bad (input-order) elimination
// ─────────────────────────────────────────────────────────────────────

/** ~39-node multi-hub network: eliminating hubs first (input order) explodes;
 *  min-fill eliminates the low-degree leaves first and stays tiny. */
function hubNet() {
  seedRng(42);
  const card = 3;
  const hubs = [0, 1, 2].map(i => makeVar(`H${i}`, card));
  const leaves = Array.from({ length: 36 }, (_, i) => makeVar(`L${String(i).padStart(2, '0')}`, card));
  const variables = [...hubs, ...leaves];
  const cpts: CPT[] = hubs.map(h => randCPT(h, []));
  for (let i = 0; i < leaves.length; i++) {
    const parents: Variable[] = [hubs[i % 3]];
    if (i % 2 === 0) parents.push(hubs[(i + 1) % 3]);
    if (i >= 1) parents.push(leaves[i - 1]);
    cpts.push(randCPT(leaves[i], parents));
  }
  return { variables, cpts };
}

describe('Value demonstration: min-fill beats a naive (input-order) elimination', () => {
  it('min-fill realizes far lower treewidth and clique-table size on a hub network', () => {
    const { variables, cpts } = hubNet();
    const bad = estimateInferenceCost(variables, cpts, { eliminationHeuristic: 'input-order' });
    const minDeg = estimateInferenceCost(variables, cpts, { eliminationHeuristic: 'min-degree' });
    const minFill = estimateInferenceCost(variables, cpts, { eliminationHeuristic: 'min-fill' });

     
    console.log(
      `\n  Hub network (${variables.length} nodes, ternary):\n` +
      `    input-order : treewidth=${bad.treewidth}  maxCliqueEntries=${bad.maxCliqueEntries.toExponential(2)}\n` +
      `    min-degree  : treewidth=${minDeg.treewidth}  maxCliqueEntries=${minDeg.maxCliqueEntries.toExponential(2)}\n` +
      `    min-fill    : treewidth=${minFill.treewidth}  maxCliqueEntries=${minFill.maxCliqueEntries.toExponential(2)}`,
    );

    expect(minFill.treewidth).toBeLessThan(bad.treewidth);
    expect(minFill.maxCliqueEntries).toBeLessThan(bad.maxCliqueEntries);
    // The bad order genuinely blows up (this is the incident-class failure).
    expect(bad.maxCliqueEntries).toBeGreaterThan(DEFAULT_MAX_CLIQUE_ENTRIES);
    expect(minFill.maxCliqueEntries).toBeLessThan(DEFAULT_MAX_CLIQUE_ENTRIES);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Fail-fast clique-size guard
// ─────────────────────────────────────────────────────────────────────

/** n×n grid DAG (edges right & down). Grids have treewidth ≈ n; a modest grid
 *  of quaternary variables blows far past any sane clique budget. */
function gridNet(n: number, card = 4) {
  const V: Variable[][] = [];
  for (let r = 0; r < n; r++) {
    V.push([]);
    for (let c = 0; c < n; c++) V[r].push(makeVar(`g${r}_${c}`, card));
  }
  const variables = V.flat();
  const cpts: CPT[] = [];
  seedRng(7);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const parents: Variable[] = [];
    if (r > 0) parents.push(V[r - 1][c]);
    if (c > 0) parents.push(V[r][c - 1]);
    cpts.push(randCPT(V[r][c], parents));
  }
  return { variables, cpts };
}

describe('Fail-fast clique-size guard', () => {
  it('rejects an intractable network quickly, without allocating or hanging', () => {
    const { variables, cpts } = gridNet(14, 4); // 196 vars, treewidth ~20

    // The estimate (structure-only) already flags the blowup.
    const est = estimateInferenceCost(variables, cpts);
    expect(est.maxCliqueEntries).toBeGreaterThan(DEFAULT_MAX_CLIQUE_ENTRIES);

    const t0 = performance.now();
    let message = '';
    expect(() => {
      try {
        infer(variables, cpts);
      } catch (e) {
        message = (e as Error).message;
        throw e;
      }
    }).toThrow(/exact inference aborted/i);
    const elapsed = performance.now() - t0;

    // Must fail fast (well under a second) — proves it did not allocate/hang.
    expect(elapsed).toBeLessThan(1000);
    // Message names the offending clique variables and the sizes.
    expect(message).toMatch(/treewidth/);
    expect(message).toMatch(/g\d+_\d+/); // a grid variable name
    expect(message).toContain('table entries');
  });

  it('does not affect a normal small network', () => {
    const net = BayesianNetwork.fromXmlBif(dogProblemXml);
    expect(() => net.infer()).not.toThrow();
    expect(net.estimateInferenceCost().maxCliqueEntries).toBeLessThan(DEFAULT_MAX_CLIQUE_ENTRIES);
  });

  it('honours an explicit low budget and names the clique', () => {
    const { variables, cpts } = colliderNet(); // clique {A,B,C} = 2^3 = 8 entries
    expect(() => infer(variables, cpts, undefined, undefined, { maxCliqueEntries: 4 }))
      .toThrow(/A, B, C|B, A, C|exact inference aborted/);
    // Same net runs fine under the default budget.
    expect(() => infer(variables, cpts)).not.toThrow();
  });

  it('maxCliqueEntries: Infinity disables the guard', () => {
    const { variables, cpts } = colliderNet();
    expect(() => infer(variables, cpts, undefined, undefined, { maxCliqueEntries: Infinity })).not.toThrow();
  });

  it('respects the NABAB_MAX_CLIQUE_ENTRIES env var', () => {
    const { variables, cpts } = colliderNet();
    const prev = process.env.NABAB_MAX_CLIQUE_ENTRIES;
    try {
      process.env.NABAB_MAX_CLIQUE_ENTRIES = '4';
      expect(() => infer(variables, cpts)).toThrow(/exact inference aborted/i);
      process.env.NABAB_MAX_CLIQUE_ENTRIES = '0'; // 0 => no limit
      expect(() => infer(variables, cpts)).not.toThrow();
    } finally {
      if (prev === undefined) delete process.env.NABAB_MAX_CLIQUE_ENTRIES;
      else process.env.NABAB_MAX_CLIQUE_ENTRIES = prev;
    }
  });
});
