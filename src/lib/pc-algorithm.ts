/**
 * PC algorithm for causal discovery from observational discrete data.
 * Dependency-free implementation using native CI tests.
 */
import type { Variable, CPT } from './types.js';
import type { ParsedNetwork } from './xmlbif-parser.js';
import type { DataColumn } from './structure-learning.js';
import { chiSquaredTest, gSquaredTest } from './ci-tests.js';

export interface PCOptions {
  alpha?: number;                          // significance level (default 0.05)
  ciTest?: 'chi-squared' | 'g-squared';   // default 'chi-squared'
  maxConditioningSize?: number;            // default: unlimited
}

/** PC algorithm: learns a CPDAG from data, then orients into a DAG. */
export function pcAlgorithm(data: DataColumn[], options?: PCOptions): ParsedNetwork {
  const alpha = options?.alpha ?? 0.05;
  const test = options?.ciTest === 'g-squared' ? gSquaredTest : chiSquaredTest;
  const maxCond = options?.maxConditioningSize ?? Infinity;
  const names = data.map(c => c.name), n = names.length;

  const adj: boolean[][] = Array.from({ length: n }, () => new Array(n).fill(false));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { adj[i][j] = true; adj[j][i] = true; }

  const sepSet = new Map<string, Set<string>>();
  const sk = (a: number, b: number) => `${Math.min(a, b)},${Math.max(a, b)}`;

  // Step 1: Skeleton discovery
  for (let sz = 0; sz <= Math.min(maxCond, n - 2); sz++) {
    let changed = false;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      if (!adj[i][j]) continue;
      const nbI: number[] = [], nbJ: number[] = [];
      for (let k = 0; k < n; k++) {
        if (k !== j && adj[i][k]) nbI.push(k);
        if (k !== i && adj[j][k]) nbJ.push(k);
      }
      let sep = false;
      for (const nb of [nbI, nbJ]) {
        if (nb.length < sz) continue;
        for (const sub of combos(nb, sz)) {
          if (test(data, names[i], names[j], sub.map(k => names[k])).pValue > alpha) {
            adj[i][j] = adj[j][i] = false;
            sepSet.set(sk(i, j), new Set(sub.map(k => names[k])));
            sep = changed = true; break;
          }
        }
        if (sep) break;
      }
    }
    if (!changed && sz > 0) break;
  }

  // Orientation matrices
  const dir: boolean[][] = Array.from({ length: n }, () => new Array(n).fill(false));
  const und: boolean[][] = Array.from({ length: n }, () => new Array(n).fill(false));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++)
    if (adj[i][j]) { und[i][j] = und[j][i] = true; }

  // Step 2: Orient v-structures
  for (let z = 0; z < n; z++) {
    const nb: number[] = [];
    for (let k = 0; k < n; k++) if (adj[z][k]) nb.push(k);
    for (let ai = 0; ai < nb.length; ai++) for (let bi = ai + 1; bi < nb.length; bi++) {
      const x = nb[ai], y = nb[bi];
      if (adj[x][y]) continue;
      const s = sepSet.get(sk(x, y));
      if (s && s.has(names[z])) continue;
      dir[x][z] = dir[y][z] = true;
      und[x][z] = und[z][x] = und[y][z] = und[z][y] = false;
    }
  }

  // Step 3: Meek's rules
  const orient = (a: number, b: number) => { dir[a][b] = true; und[a][b] = und[b][a] = false; };
  for (let go = true; go;) {
    go = false;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      if (!und[i][j]) continue;
      // R1: k->i-j, k not adj j
      for (let k = 0; k < n; k++) if (dir[k][i] && !adj[k][j]) { orient(i, j); go = true; break; }
      if (!und[i][j]) continue;
      // R2: i->k->j
      for (let k = 0; k < n; k++) if (dir[i][k] && dir[k][j]) { orient(i, j); go = true; break; }
      if (!und[i][j]) continue;
      // R3: i-k1->j, i-k2->j, k1 not adj k2
      const ks: number[] = [];
      for (let k = 0; k < n; k++) if (und[i][k] && dir[k][j]) ks.push(k);
      outer: for (let a = 0; a < ks.length; a++) for (let b = a + 1; b < ks.length; b++)
        if (!adj[ks[a]][ks[b]]) { orient(i, j); go = true; break outer; }
    }
  }

  // Remaining undirected: lower -> higher index
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (und[i][j]) dir[i][j] = true;
  ensureAcyclic(dir, n);

  const variables: Variable[] = data.map(c => ({ name: c.name, outcomes: [...new Set(c.values)].sort() }));
  return { name: 'learned', variables, cpts: buildCPTs(dir, data, variables) };
}

function* combos(arr: number[], k: number): Generator<number[]> {
  if (k === 0) { yield []; return; }
  for (let i = 0; i <= arr.length - k; i++)
    for (const r of combos(arr.slice(i + 1), k - 1)) yield [arr[i], ...r];
}

function ensureAcyclic(a: boolean[][], n: number): void {
  const ind = new Array(n).fill(0);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (a[i][j]) ind[j]++;
  const q: number[] = [], tmp = [...ind];
  for (let i = 0; i < n; i++) if (ind[i] === 0) q.push(i);
  const ord: number[] = [];
  while (q.length) { const u = q.shift()!; ord.push(u); for (let j = 0; j < n; j++) if (a[u][j] && --tmp[j] === 0) q.push(j); }
  if (ord.length === n) return;
  const vis = new Uint8Array(n), fin: number[] = [];
  function dfs(u: number) { vis[u] = 1; for (let v = 0; v < n; v++) if (a[u][v] && !vis[v]) dfs(v); vis[u] = 2; fin.push(u); }
  for (let i = 0; i < n; i++) if (!vis[i]) dfs(i);
  const pos = new Array(n);
  for (let i = 0; i < n; i++) pos[fin[n - 1 - i]] = i;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (a[i][j] && pos[i] > pos[j]) a[i][j] = false;
}

function buildCPTs(adj: boolean[][], data: DataColumn[], vars: Variable[]): CPT[] {
  const nR = data[0].values.length, nV = vars.length;
  const vi: number[][] = data.map((c, ci) => {
    const m = new Map<string, number>(); vars[ci].outcomes.forEach((o, k) => m.set(o, k));
    return c.values.map(v => m.get(v) ?? 0);
  });
  const cpts: CPT[] = [];
  for (let j = 0; j < nV; j++) {
    const pIdx: number[] = [];
    for (let i = 0; i < nV; i++) if (adj[i][j]) pIdx.push(i);
    const v = vars[j], pa = pIdx.map(i => vars[i]), vc = v.outcomes.length;
    const pc = pIdx.map(p => vars[p].outcomes.length);
    let npc = 1; for (const c of pc) npc *= c;
    const ts = npc * vc, cnt = new Float64Array(ts).fill(1), pac = new Float64Array(npc).fill(vc);
    for (let r = 0; r < nR; r++) {
      let pi = 0, s = 1;
      for (let p = pIdx.length - 1; p >= 0; p--) { pi += vi[pIdx[p]][r] * s; s *= pc[p]; }
      cnt[pi * vc + vi[j][r]]++; pac[pi]++;
    }
    const t = new Float64Array(ts);
    for (let p = 0; p < npc; p++) for (let k = 0; k < vc; k++) t[p * vc + k] = cnt[p * vc + k] / pac[p];
    cpts.push({ variable: v, parents: pa, table: t });
  }
  return cpts;
}
