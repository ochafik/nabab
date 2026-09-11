/**
 * Brute-force joint enumeration helpers for tests (tiny networks only).
 */
import type { Variable, CPT, Evidence, LikelihoodEvidence } from '../src/lib/types.js';

export interface JointEntry {
  /** Outcome index per variable (aligned with `variables`). */
  readonly indices: number[];
  readonly assignment: Map<string, string>;
  /** Unnormalised P(x) × evidence indicators × likelihood weights. */
  readonly weight: number;
}

/** Row offset of a CPT for a given full assignment. */
function cptValue(cpt: CPT, idxOf: Map<Variable, number>): number {
  let offset = 0;
  for (const p of cpt.parents) offset = offset * p.outcomes.length + idxOf.get(p)!;
  return cpt.table[offset * cpt.variable.outcomes.length + idxOf.get(cpt.variable)!];
}

/** Enumerate every full assignment with its (unnormalised) weight. */
export function enumerateJoint(
  variables: readonly Variable[],
  cpts: readonly CPT[],
  evidence?: Evidence,
  likelihoodEvidence?: LikelihoodEvidence,
): JointEntry[] {
  const entries: JointEntry[] = [];
  const n = variables.length;
  const indices = new Array<number>(n).fill(0);
  let total = 1;
  for (const v of variables) total *= v.outcomes.length;

  for (let r = 0; r < total; r++) {
    const idxOf = new Map<Variable, number>();
    variables.forEach((v, i) => idxOf.set(v, indices[i]));
    let w = 1;
    for (const cpt of cpts) w *= cptValue(cpt, idxOf);
    const assignment = new Map<string, string>();
    for (let i = 0; i < n; i++) {
      const v = variables[i];
      const outcome = v.outcomes[indices[i]];
      assignment.set(v.name, outcome);
      const e = evidence?.get(v.name);
      if (e !== undefined && e !== outcome) w = 0;
      const lw = likelihoodEvidence?.get(v.name);
      if (lw) w *= lw.get(outcome) ?? 1;
    }
    entries.push({ indices: [...indices], assignment, weight: w });

    for (let j = n - 1; j >= 0; j--) {
      indices[j]++;
      if (indices[j] < variables[j].outcomes.length) break;
      indices[j] = 0;
    }
  }
  return entries;
}

/** Exact marginal of one variable from the enumerated joint. */
export function bruteMarginal(entries: readonly JointEntry[], variable: Variable): Map<string, number> {
  const dist = new Map<string, number>();
  let total = 0;
  for (const o of variable.outcomes) dist.set(o, 0);
  for (const e of entries) {
    const o = e.assignment.get(variable.name)!;
    dist.set(o, dist.get(o)! + e.weight);
    total += e.weight;
  }
  for (const o of variable.outcomes) dist.set(o, total > 0 ? dist.get(o)! / total : 0);
  return dist;
}

/** Seeded PRNG for building random test networks. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Random DAG with `n` variables, cardinalities 2–3, each variable getting up
 * to `maxParents` random earlier variables as parents, random Dirichlet-ish CPTs.
 */
export function randomNetwork(n: number, seed: number, maxParents = 2): { variables: Variable[]; cpts: CPT[] } {
  const rng = seededRandom(seed);
  const variables: Variable[] = [];
  for (let i = 0; i < n; i++) {
    const card = 2 + Math.floor(rng() * 2);
    variables.push({ name: `V${i}`, outcomes: Array.from({ length: card }, (_, k) => `o${k}`) });
  }
  const cpts: CPT[] = variables.map((v, i) => {
    const nParents = Math.min(i, Math.floor(rng() * (maxParents + 1)));
    const pool = variables.slice(0, i);
    const parents: Variable[] = [];
    while (parents.length < nParents) {
      const p = pool[Math.floor(rng() * pool.length)];
      if (!parents.includes(p)) parents.push(p);
    }
    const rows = parents.reduce((r, p) => r * p.outcomes.length, 1);
    const card = v.outcomes.length;
    const table = new Float64Array(rows * card);
    for (let r = 0; r < rows; r++) {
      let sum = 0;
      for (let k = 0; k < card; k++) {
        const x = 0.05 + rng();
        table[r * card + k] = x;
        sum += x;
      }
      for (let k = 0; k < card; k++) table[r * card + k] /= sum;
    }
    return { variable: v, parents, table };
  });
  return { variables, cpts };
}
