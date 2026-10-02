/**
 * A junction tree that stays calibrated between queries.
 *
 * `CalibratedTree` is the engine behind both `infer()` (one query) and
 * `CachedInferenceEngine` (many queries). It implements Hugin propagation with
 * three properties that matter for per-query latency:
 *
 * - Everything structural is computed once per tree: clique/separator loop plans
 *   (see `createLoopPlan`), the clique each CPT and each likelihood lives in,
 *   the cheapest table to read each variable's marginal from, and (optionally)
 *   the CPT products of every clique.
 * - Messages are computed and absorbed in place, without allocating tables:
 *   the clique-to-separator sum, the separator ratio, and the multiplication
 *   into the destination clique are each one pass over precomputed loops.
 * - Evidence changes are incremental. The tree remembers the likelihood vector
 *   of every observed variable. Per connected component of the tree:
 *     - evidence that only adds information (every outcome that was impossible
 *       stays impossible: new observations, or soft evidence sharpening) is
 *       multiplied into one clique and a single outward pass restores calibration;
 *     - otherwise (evidence retracted or switched to another outcome, which
 *       cannot be undone by division because zeros lose information) the
 *       component is re-initialised from the cached CPT products and propagated
 *       in full;
 *     - components whose evidence did not change are not touched, and an
 *       identical query returns instantly.
 */
import type { Variable, CPT, Evidence, LikelihoodEvidence, Distribution } from './types.js';
import { ImpossibleEvidenceError } from './evidence.js';
import {
  type Factor,
  type LoopPlan,
  createFactor,
  createLoopPlan,
  sumInto,
  multiplyInto,
  sumRange,
  tableSize,
} from './factor.js';
import type { JunctionTree } from './graph.js';

/** Per-variable likelihood vectors; only variables whose vector is not all ones appear. */
export type Likelihoods = Map<Variable, Float64Array>;

/**
 * Merge hard and soft evidence into one likelihood vector per variable
 * (hard evidence is the indicator of the observed outcome; soft weights
 * default to 1; both multiply). Names not in `variables` are ignored.
 */
export function buildLikelihoods(
  variables: readonly Variable[],
  evidence?: Evidence,
  likelihood?: LikelihoodEvidence,
): Likelihoods {
  const result: Likelihoods = new Map();
  if (!(evidence?.size) && !(likelihood?.size)) return result;
  for (const v of variables) {
    const hard = evidence?.get(v.name);
    const soft = likelihood?.get(v.name);
    if (hard === undefined && soft === undefined) continue;
    const w = new Float64Array(v.outcomes.length).fill(1);
    if (hard !== undefined) {
      for (let i = 0; i < w.length; i++) if (v.outcomes[i] !== hard) w[i] = 0;
    }
    if (soft) {
      for (let i = 0; i < w.length; i++) w[i] *= soft.get(v.outcomes[i]) ?? 1;
    }
    result.set(v, w);
  }
  return result;
}

/** A separator between two adjacent cliques, with the loop plans onto both. */
interface Edge {
  readonly a: number;
  readonly b: number;
  readonly vars: readonly Variable[];
  /** Plan walking clique a (resp. b) onto the separator table. */
  readonly planA: LoopPlan;
  readonly planB: LoopPlan;
  /** Current separator potential; meaningful only if `hasSep`. */
  sep: Float64Array;
  /** Whether a message has been sent since the last initialisation. */
  hasSep: boolean;
  /** Buffer for the next message. */
  spare: Float64Array;
}

/** Where to read a variable's marginal: a clique or a separator table. */
interface MarginalSource {
  readonly clique?: number;
  readonly edge?: number;
  readonly plan: LoopPlan;
  readonly size: number;
}

/** Breadth-first order of a component from `root`, with parent links (-1 for the root). */
interface Rooted {
  readonly order: number[];
  readonly parent: Map<number, number>;
}

export interface CalibratedTreeOptions {
  /** Keep the CPT product of every clique so re-initialisation is a copy. Use for engines that serve many queries. */
  readonly cacheInitialPotentials?: boolean;
}

export class CalibratedTree {
  readonly junctionTree: JunctionTree;

  private readonly _cliques: readonly (readonly Variable[])[];
  private readonly _cliqueSizes: number[];
  private readonly _edges: Edge[] = [];
  /** clique index -> [edge index, neighbor index][] */
  private readonly _adjacent: Array<Array<[number, number]>> = [];
  private readonly _componentOf: Int32Array;
  private readonly _components: number[][] = [];
  private readonly _rootedFull: Rooted[] = [];
  /** CPTs assigned to each clique, with the plan that multiplies them in. */
  private readonly _assigned: Array<Array<{ factor: Factor; plan: LoopPlan }>> = [];
  /** Smallest clique holding each variable: where its likelihood is applied. */
  private readonly _home = new Map<Variable, number>();
  private readonly _marginalSource = new Map<Variable, MarginalSource>();

  /**
   * With `cacheInitialPotentials`: the prior potentials after the collect pass
   * (every clique holds its CPT product times the messages of its subtree) and
   * the matching separators. Re-initialising a component is then a copy, and
   * evidence only needs messages along the paths from the observed cliques to
   * the root.
   */
  private _base: Float64Array[] | null = null;
  private _baseSep: Float64Array[] | null = null;
  private readonly _potentials: Array<Float64Array | null>;

  // Evidence state
  private _likelihoods: Likelihoods = new Map();
  private readonly _componentValid: boolean[];
  private readonly _componentTotal: number[];
  /** Memoised clique-potential snapshot shared by results of the current state. */
  private _snapshot: (() => Map<number, Factor>) | null = null;

  constructor(
    variables: readonly Variable[],
    cpts: readonly CPT[],
    junctionTree: JunctionTree,
    options?: CalibratedTreeOptions,
  ) {
    this.junctionTree = junctionTree;
    const cliques = junctionTree.cliques;
    this._cliques = cliques;
    this._cliqueSizes = cliques.map(c => tableSize(c));

    // Edges (each undirected pair once) and adjacency.
    for (let i = 0; i < cliques.length; i++) this._adjacent.push([]);
    for (let a = 0; a < cliques.length; a++) {
      for (const b of junctionTree.neighbors.get(a) ?? []) {
        if (b < a) continue;
        const inB = new Set(cliques[b]);
        const vars = cliques[a].filter(v => inB.has(v));
        const sepFactor = createFactor(vars, new Float64Array(0));
        const size = tableSize(vars);
        const e = this._edges.length;
        this._edges.push({
          a, b, vars,
          planA: createLoopPlan(cliques[a], sepFactor),
          planB: createLoopPlan(cliques[b], sepFactor),
          sep: new Float64Array(size),
          hasSep: false,
          spare: new Float64Array(size),
        });
        this._adjacent[a].push([e, b]);
        this._adjacent[b].push([e, a]);
      }
    }

    // Connected components (the tree is a forest if the network is disconnected),
    // each rooted at its smallest clique so reading the root's total is cheap.
    this._componentOf = new Int32Array(cliques.length).fill(-1);
    for (let start = cliques.length - 1; start >= 0; start--) {
      if (this._componentOf[start] >= 0) continue;
      const members = this._root(start).order;
      const smallest = members.reduce((best, c) => (this._cliqueSizes[c] < this._cliqueSizes[best] ? c : best));
      const rooted = this._root(smallest);
      const id = this._components.length;
      this._components.push(rooted.order);
      this._rootedFull.push(rooted);
      for (const c of members) this._componentOf[c] = id;
    }
    this._componentValid = this._components.map(() => false);
    this._componentTotal = this._components.map(() => 1);

    // Assign each CPT to the first clique containing its whole family
    // (variables are visited in clique order, as in the original implementation).
    const cptByVar = new Map<Variable, CPT>();
    for (const cpt of cpts) cptByVar.set(cpt.variable, cpt);
    const assigned = new Set<Variable>();
    for (let i = 0; i < cliques.length; i++) {
      const inClique = new Set(cliques[i]);
      const list: Array<{ factor: Factor; plan: LoopPlan }> = [];
      for (const v of cliques[i]) {
        const cpt = cptByVar.get(v);
        if (!cpt || assigned.has(v)) continue;
        if (!cpt.parents.every(p => inClique.has(p))) continue;
        assigned.add(v);
        const factor = createFactor([...cpt.parents, cpt.variable], cpt.table);
        list.push({ factor, plan: createLoopPlan(cliques[i], factor) });
      }
      this._assigned.push(list);
    }
    for (const cpt of cpts) {
      if (!assigned.has(cpt.variable)) {
        throw new Error(`Failed to assign variable ${cpt.variable.name} to a clique`);
      }
    }

    // Home clique of each variable and the cheapest table to read its marginal from.
    for (let i = 0; i < cliques.length; i++) {
      for (const v of cliques[i]) {
        const home = this._home.get(v);
        if (home === undefined || this._cliqueSizes[i] < this._cliqueSizes[home]) this._home.set(v, i);
      }
    }
    const consider = (v: Variable, source: Omit<MarginalSource, 'plan'>, vars: readonly Variable[]) => {
      const best = this._marginalSource.get(v);
      if (best && best.size <= source.size) return;
      const target = createFactor([v], new Float64Array(0));
      this._marginalSource.set(v, { ...source, plan: createLoopPlan(vars, target) });
    };
    for (let i = 0; i < cliques.length; i++) {
      for (const v of cliques[i]) consider(v, { clique: i, size: this._cliqueSizes[i] }, cliques[i]);
    }
    this._edges.forEach((edge, e) => {
      for (const v of edge.vars) consider(v, { edge: e, size: edge.spare.length }, edge.vars);
    });

    this._potentials = cliques.map(() => null);
    if (options?.cacheInitialPotentials) this._buildCollectedPrior();
  }

  /** Compute and keep the prior potentials after a collect pass over every component. */
  private _buildCollectedPrior(): void {
    const base = this._cliques.map((_, i) => this._buildInitial(i, new Float64Array(this._cliqueSizes[i])));
    base.forEach((pot, i) => (this._potentials[i] = pot));
    for (const { order, parent } of this._rootedFull) {
      for (let k = order.length - 1; k > 0; k--) this._send(order[k], parent.get(order[k])!);
    }
    this._baseSep = this._edges.map(edge => edge.sep.slice());
    this._base = base;
    this._potentials.fill(null);
    for (const edge of this._edges) edge.hasSep = false;
  }

  // ── Structure helpers ──

  private _root(root: number): Rooted {
    const order = [root];
    const parent = new Map<number, number>([[root, -1]]);
    for (let head = 0; head < order.length; head++) {
      for (const [, n] of this._adjacent[order[head]]) {
        if (parent.has(n)) continue;
        parent.set(n, order[head]);
        order.push(n);
      }
    }
    return { order, parent };
  }

  /** Write the product of the CPTs assigned to clique `i` into `out`. */
  private _buildInitial(i: number, out: Float64Array): Float64Array {
    out.fill(1);
    for (const { factor, plan } of this._assigned[i]) multiplyInto(out, plan, factor.values);
    return out;
  }

  private _likelihoodPlan(v: Variable, clique: number): LoopPlan {
    return createLoopPlan(this._cliques[clique], createFactor([v], new Float64Array(0)));
  }

  /** Whether the tree contains a variable. */
  has(v: Variable): boolean {
    return this._home.has(v);
  }

  // ── Calibration ──

  /**
   * Calibrate the tree for the given evidence and return P(evidence).
   * Throws `ImpossibleEvidenceError` if it is zero (the tree is then
   * re-initialised from scratch by the next call). Likelihoods of variables
   * the tree does not contain are ignored.
   */
  calibrate(likelihoods: Likelihoods): number {
    const next: Likelihoods = new Map();
    for (const [v, w] of likelihoods) if (this._home.has(v)) next.set(v, w);

    // Classify the change per component.
    const absorb: Array<Array<[Variable, Float64Array]>> = this._components.map(() => []);
    const reinit = new Set<number>();
    const changed = new Set<Variable>([...this._likelihoods.keys(), ...next.keys()]);
    for (const v of changed) {
      const comp = this._componentOf[this._home.get(v)!];
      const oldW = this._likelihoods.get(v);
      const newW = next.get(v);
      if (!this._componentValid[comp]) {
        reinit.add(comp);
        continue;
      }
      const ratio = likelihoodRatio(oldW, newW, v.outcomes.length);
      if (ratio === 'same') continue;
      if (ratio === null) reinit.add(comp);
      else absorb[comp].push([v, ratio]);
    }
    for (let comp = 0; comp < this._components.length; comp++) {
      if (!this._componentValid[comp]) reinit.add(comp);
    }

    if (reinit.size > 0 || absorb.some(a => a.length > 0)) this._flushSnapshot();
    for (const comp of reinit) this._componentValid[comp] = false;
    this._likelihoods = next;

    try {
      for (const comp of reinit) this._reinitialize(comp);
      for (let comp = 0; comp < this._components.length; comp++) {
        if (absorb[comp].length > 0 && !reinit.has(comp)) this._absorb(comp, absorb[comp]);
      }
    } catch (e) {
      // Leave no half-propagated state behind: everything is rebuilt by the next call.
      this._componentValid.fill(false);
      throw e;
    }
    let p = 1;
    for (const t of this._componentTotal) p *= t;
    return p;
  }

  /** Reset a component to its prior, add its likelihoods, and propagate in full. */
  private _reinitialize(comp: number): void {
    const cliques = this._components[comp];
    const base = this._base;
    for (const i of cliques) {
      const pot = (this._potentials[i] ??= new Float64Array(this._cliqueSizes[i]));
      if (base) pot.set(base[i]);
      else this._buildInitial(i, pot);
    }
    this._edges.forEach((edge, e) => {
      if (this._componentOf[edge.a] !== comp) return;
      edge.hasSep = base !== null;
      if (base) edge.sep.set(this._baseSep![e]);
    });
    // Without a collected prior every clique has to send its message.
    const dirty = new Set<number>(base ? [] : cliques);
    for (const [v, w] of this._likelihoods) {
      const home = this._home.get(v)!;
      if (this._componentOf[home] !== comp) continue;
      this._multiplyLikelihood(v, home, w);
      dirty.add(home);
    }
    const { order, parent } = this._rootedFull[comp];
    this._collectDirty(order, parent, dirty);
    this._finish(comp, order[0], order, parent);
  }

  /** Multiply extra likelihood into a calibrated component and re-calibrate with one outward pass. */
  private _absorb(comp: number, extras: Array<[Variable, Float64Array]>): void {
    const dirty = new Set<number>();
    for (const [v, ratio] of extras) {
      const home = this._home.get(v)!;
      this._multiplyLikelihood(v, home, ratio);
      dirty.add(home);
    }
    // Root at a dirty clique; only paths from other dirty cliques need a collect message.
    const root = dirty.values().next().value as number;
    const { order, parent } = this._root(root);
    this._collectDirty(order, parent, dirty);
    this._finish(comp, root, order, parent);
  }

  /** Send collect messages from every dirty clique, and every clique on its path, towards the root. */
  private _collectDirty(order: number[], parent: Map<number, number>, dirty: Set<number>): void {
    for (let k = order.length - 1; k > 0; k--) {
      const c = order[k];
      if (!dirty.has(c)) continue;
      const p = parent.get(c)!;
      this._send(c, p);
      dirty.add(p);
    }
  }

  /** Check the root's total, then distribute from the root to every other clique. */
  private _finish(comp: number, root: number, order: number[], parent: Map<number, number>): void {
    const total = sum(this._potentials[root]!);
    if (!(total > 0)) {
      this._componentValid[comp] = false;
      throw new ImpossibleEvidenceError();
    }
    for (let k = 1; k < order.length; k++) this._send(parent.get(order[k])!, order[k]);
    this._componentTotal[comp] = total;
    this._componentValid[comp] = true;
  }

  private _multiplyLikelihood(v: Variable, clique: number, w: Float64Array): void {
    multiplyInto(this._potentials[clique]!, this._likelihoodPlan(v, clique), w);
  }

  /** Hugin message: update the separator from `from`, and multiply the change into `to`. */
  private _send(from: number, to: number): void {
    const [e] = this._adjacent[from].find(([, n]) => n === to)!;
    const edge = this._edges[e];
    const [fromPlan, toPlan] = edge.a === from ? [edge.planA, edge.planB] : [edge.planB, edge.planA];
    const message = edge.spare;
    message.fill(0);
    sumInto(this._potentials[from]!, fromPlan, message);
    if (edge.hasSep) {
      // ratio = new / old with 0/0 = 0, computed in place over the old separator.
      const ratio = edge.sep;
      for (let i = 0; i < ratio.length; i++) ratio[i] = ratio[i] === 0 ? 0 : message[i] / ratio[i];
      multiplyInto(this._potentials[to]!, toPlan, ratio);
      edge.spare = ratio;
    } else {
      multiplyInto(this._potentials[to]!, toPlan, message);
      edge.hasSep = true;
      edge.spare = edge.sep;
    }
    edge.sep = message;
  }

  // ── Reading results ──

  /** Normalised posterior marginal of a variable (call after `calibrate`). */
  marginal(v: Variable): Distribution | undefined {
    const source = this._marginalSource.get(v);
    if (!source) return undefined;
    const table = source.clique !== undefined ? this._potentials[source.clique]! : this._edges[source.edge!].sep!;
    const values = new Float64Array(v.outcomes.length);
    sumInto(table, source.plan, values);
    const total = sum(values);
    const dist = new Map<string, number>();
    for (let i = 0; i < values.length; i++) dist.set(v.outcomes[i], total > 0 ? values[i] / total : values[i]);
    return dist;
  }

  /** Every clique potential, normalised to sum to 1. Always a snapshot: later queries do not change it. */
  normalizedCliquePotentials(): Map<number, Factor> {
    const result = new Map<number, Factor>();
    this._cliques.forEach((vars, i) => {
      const pot = this._potentials[i];
      if (!pot) {
        result.set(i, createFactor(vars, new Float64Array(this._cliqueSizes[i])));
        return;
      }
      const total = sum(pot);
      const values = new Float64Array(pot.length);
      const scale = total === 0 ? 1 : 1 / total;
      for (let k = 0; k < values.length; k++) values[k] = pot[k] * scale;
      result.set(i, createFactor(vars, values));
    });
    return result;
  }

  /**
   * Define `cliquePotentials` on a result as a lazily computed, memoised
   * property (normalising every clique is a full pass over the tree, and most
   * callers only read posteriors). The value is forced before the tree is next
   * modified, so it always reflects the query that produced the result.
   */
  defineCliquePotentials(result: object): void {
    if (!this._snapshot) {
      let value: Map<number, Factor> | undefined;
      this._snapshot = () => (value ??= this.normalizedCliquePotentials());
    }
    const snapshot = this._snapshot;
    Object.defineProperty(result, 'cliquePotentials', { get: snapshot, enumerable: true, configurable: true });
  }

  private _flushSnapshot(): void {
    this._snapshot?.();
    this._snapshot = null;
  }
}

function sum(values: Float64Array): number {
  return sumRange(values, 0, values.length);
}

/**
 * The vector `r` with new = old * r, if one exists: 'same' if nothing changed,
 * null if some outcome with weight 0 is given a non-zero weight (information
 * would have to be recovered, which needs re-initialisation).
 */
function likelihoodRatio(
  oldW: Float64Array | undefined,
  newW: Float64Array | undefined,
  card: number,
): Float64Array | 'same' | null {
  let same = true;
  const ratio = new Float64Array(card);
  for (let i = 0; i < card; i++) {
    const o = oldW ? oldW[i] : 1;
    const n = newW ? newW[i] : 1;
    if (o !== n) same = false;
    if (o === 0) {
      if (n !== 0) return null;
      ratio[i] = 1; // stays impossible; the potential is already 0 there
    } else {
      ratio[i] = n / o;
    }
  }
  return same ? 'same' : ratio;
}
