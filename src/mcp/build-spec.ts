/**
 * Build a BayesianNetwork from a compact JSON spec (the `build_network` tool).
 *
 * An LLM writes parameters, not full tables: each variable lists its outcomes,
 * parents and a `cpt` that is either an explicit table, a set of conditional
 * rules, or a template backed by the library helpers (`noisyOrCPT`,
 * `gatedLogisticCPT`, `priorCPT`, `temporalVariable`, `hazardPrior`,
 * `delayShifts`).
 *
 * Validation collects every problem it can find (not just the first) and the
 * messages say what was expected, so a model can fix the whole spec in one go.
 */
import { BayesianNetwork } from '../lib/network.js';
import type { Variable, CPT, Distribution } from '../lib/types.js';
import { noisyOrCPT, gatedLogisticCPT, type GateClause, type LogOddsShift } from '../lib/cpt-templates.js';
import {
  temporalVariable, hazardPrior, priorCPT, delayShifts, TEMPORAL_SEPARATOR, DEFAULT_NULL_OUTCOME,
} from '../lib/temporal.js';

export const MAX_SPEC_VARIABLES = 300;
export const MAX_CPT_ENTRIES = 2_000_000;
const SUM_TOLERANCE = 0.01;

export class SpecError extends Error {
  constructor(readonly problems: string[]) {
    super(
      `Invalid network spec (${problems.length} problem${problems.length === 1 ? '' : 's'}):\n` +
      problems.slice(0, 25).map(p => `  - ${p}`).join('\n') +
      (problems.length > 25 ? `\n  … and ${problems.length - 25} more` : ''),
    );
    this.name = 'SpecError';
  }
}

/** Thrown inside one variable's CPT builder; caught and prefixed by the caller. */
class Problem extends Error {}

export interface BuiltNetwork {
  network: BayesianNetwork;
  /** Per variable: how its CPT was specified (table, noisyOr, …). */
  kinds: Map<string, string>;
}

const list = (xs: readonly string[], max = 12): string =>
  xs.length <= max ? xs.join(', ') : `${xs.slice(0, max).join(', ')}, … (${xs.length} total)`;

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

function str(x: unknown, what: string): string {
  if (typeof x === 'string') return x;
  if (typeof x === 'number' || typeof x === 'boolean') return String(x);
  throw new Problem(`${what} must be a string, got ${JSON.stringify(x)}`);
}

function num(x: unknown, what: string): number {
  if (isNum(x)) return x;
  throw new Problem(`${what} must be a finite number, got ${JSON.stringify(x)}`);
}

/** A number, or "-Infinity"/"-inf" (JSON cannot carry infinities) meaning "forbidden". */
function logOddsNum(x: unknown, what: string): number {
  if (isNum(x)) return x;
  if (typeof x === 'string' && /^[-−]\s*inf(inity)?$/i.test(x.trim())) return -Infinity;
  throw new Problem(`${what} must be a finite number or "-Infinity" (to forbid the outcome), got ${JSON.stringify(x)}`);
}

// ─── Distributions ──────────────────────────────────────────────────

/** Parse an array / outcome→number map into a vector aligned with the outcomes. */
function parseVector(v: Variable, x: unknown, what: string, convert: (x: unknown, w: string) => number = num): number[] {
  if (Array.isArray(x)) {
    if (x.length !== v.outcomes.length) {
      throw new Problem(`${what} has ${x.length} entries but "${v.name}" has ${v.outcomes.length} outcomes (${list(v.outcomes)}), in that order`);
    }
    return x.map((e, i) => convert(e, `${what}[${i}] (${v.outcomes[i]})`));
  }
  if (isObj(x)) {
    const out = new Array<number>(v.outcomes.length).fill(0);
    for (const [k, val] of Object.entries(x)) {
      const i = v.outcomes.indexOf(k);
      if (i < 0) throw new Problem(`${what}: "${k}" is not an outcome of "${v.name}". Valid outcomes: ${list(v.outcomes)}`);
      out[i] = convert(val, `${what}.${k}`);
    }
    return out;
  }
  throw new Problem(`${what} must be an array of ${v.outcomes.length} numbers (${list(v.outcomes)}) or an {outcome: number} object`);
}

function checkNonNegative(vec: number[], v: Variable, what: string): void {
  vec.forEach((p, i) => {
    if (p < 0) throw new Problem(`${what}: negative probability ${p} for ${v.name}=${v.outcomes[i]}`);
  });
}

/** Probability row: non-negative, sums to 1 (±1%), renormalised. */
function probabilityRow(v: Variable, x: unknown, what: string): number[] {
  const vec = parseVector(v, x, what);
  checkNonNegative(vec, v, what);
  const sum = vec.reduce((a, b) => a + b, 0);
  if (!(sum > 0)) throw new Problem(`${what} has no positive probability (sum is ${sum})`);
  if (Math.abs(sum - 1) > SUM_TOLERANCE) {
    throw new Problem(`${what} must sum to 1 but sums to ${+sum.toFixed(6)} (${vec.map((p, i) => `${v.outcomes[i]}=${p}`).join(', ')})`);
  }
  return vec.map(p => p / sum);
}

/** Non-negative weights (need not sum to 1), as a Distribution. */
function weightDist(v: Variable, x: unknown, what: string): Distribution {
  const vec = parseVector(v, x, what);
  checkNonNegative(vec, v, what);
  if (!vec.some(p => p > 0)) throw new Problem(`${what} has no positive entry`);
  return new Map(v.outcomes.map((o, i) => [o, vec[i]]));
}

// ─── Context ────────────────────────────────────────────────────────

interface VarSpec {
  readonly name: string;
  readonly raw: Record<string, unknown>;
  variable?: Variable;
  parents: Variable[];
  temporal?: { outcomes: string[]; buckets: string[]; nullOutcome: string };
}

function parentConfigs(parents: readonly Variable[]): string[] {
  const rows = parents.reduce((n, p) => n * p.outcomes.length, 1);
  const out: string[] = [];
  const idx = new Array<number>(parents.length).fill(0);
  for (let r = 0; r < rows; r++) {
    out.push(parents.map((p, i) => `${p.name}=${p.outcomes[idx[i]]}`).join(', '));
    for (let j = parents.length - 1; j >= 0; j--) {
      if (++idx[j] < parents[j].outcomes.length) break;
      idx[j] = 0;
    }
  }
  return out;
}

function rowCount(parents: readonly Variable[]): number {
  return parents.reduce((n, p) => n * p.outcomes.length, 1);
}

function parentByName(vs: VarSpec, name: unknown, what: string): { p: Variable; index: number } {
  const n = str(name, `${what}.parent`);
  const index = vs.parents.findIndex(p => p.name === n);
  if (index < 0) {
    throw new Problem(
      `${what}: "${n}" is not a parent of "${vs.name}". ` +
      (vs.parents.length ? `Parents are: ${list(vs.parents.map(p => p.name))}` : `"${vs.name}" has no parents; add it to "parents"`),
    );
  }
  return { p: vs.parents[index], index };
}

function outcomeOf(p: Variable, x: unknown, what: string): string {
  const o = str(x, what);
  if (!p.outcomes.includes(o)) throw new Problem(`${what}: "${o}" is not an outcome of "${p.name}". Valid outcomes: ${list(p.outcomes)}`);
  return o;
}

// ─── CPT builders ───────────────────────────────────────────────────

function tableCpt(vs: VarSpec, table: unknown): CPT {
  const v = vs.variable!;
  const card = v.outcomes.length;
  const rows = rowCount(vs.parents);
  const configs = () => parentConfigs(vs.parents);
  const where = vs.parents.length
    ? `rows are ordered by parent configuration with the first parent (${vs.parents[0].name}) varying slowest: ${list(configs(), 6)}; each row lists ${v.name} = ${list(v.outcomes)}`
    : `a single row listing ${v.name} = ${list(v.outcomes)}`;
  if (!Array.isArray(table)) throw new Problem(`table must be an array of numbers or an array of rows. Expected ${rows} row(s) x ${card}: ${where}`);
  let rowsData: unknown[];
  if (table.length > 0 && Array.isArray(table[0])) {
    if (table.length !== rows) throw new Problem(`table has ${table.length} row(s) but ${rows} are needed (one per parent configuration): ${where}`);
    rowsData = table;
  } else {
    if (table.length !== rows * card) {
      throw new Problem(`flat table has ${table.length} numbers but ${rows * card} are needed (${rows} row(s) x ${card} outcomes): ${where}`);
    }
    rowsData = Array.from({ length: rows }, (_, r) => table.slice(r * card, (r + 1) * card));
  }
  const cfg = vs.parents.length ? configs() : ['(no parents)'];
  const out = new Float64Array(rows * card);
  rowsData.forEach((row, r) => {
    const vec = probabilityRow(v, row, `table row ${r} [${cfg[r]}]`);
    out.set(vec, r * card);
  });
  return { variable: v, parents: vs.parents, table: out };
}

function conditionalCpt(vs: VarSpec, c: Record<string, unknown>): CPT {
  const v = vs.variable!;
  const card = v.outcomes.length;
  if (!Array.isArray(c.rows)) {
    throw new Problem('conditional CPT needs "rows": [{ "when": {Parent: outcome, ...}, "probs": {outcome: p, ...} }, ...] and optionally "default"');
  }
  const rules = c.rows.map((r, i) => {
    if (!isObj(r)) throw new Problem(`rows[${i}] must be an object {when, probs}`);
    const when = new Map<number, number>();
    if (r.when !== undefined) {
      if (!isObj(r.when)) throw new Problem(`rows[${i}].when must be an object {Parent: outcome}`);
      for (const [pn, po] of Object.entries(r.when)) {
        const { p, index } = parentByName(vs, pn, `rows[${i}].when`);
        when.set(index, p.outcomes.indexOf(outcomeOf(p, po, `rows[${i}].when.${pn}`)));
      }
    }
    return { when, probs: probabilityRow(v, r.probs, `rows[${i}].probs`) };
  });
  const dflt = c.default !== undefined ? probabilityRow(v, c.default, 'default') : undefined;
  const rows = rowCount(vs.parents);
  const out = new Float64Array(rows * card);
  const idx = new Array<number>(vs.parents.length).fill(0);
  const missing: string[] = [];
  const cfgs = parentConfigs(vs.parents);
  for (let r = 0; r < rows; r++) {
    const rule = rules.find(x => [...x.when].every(([pi, oi]) => idx[pi] === oi));
    const probs = rule?.probs ?? dflt;
    if (probs) out.set(probs, r * card);
    else missing.push(cfgs[r]);
    for (let j = vs.parents.length - 1; j >= 0; j--) {
      if (++idx[j] < vs.parents[j].outcomes.length) break;
      idx[j] = 0;
    }
  }
  if (missing.length) {
    throw new Problem(`no row (and no "default") matches ${missing.length} parent configuration(s), e.g. ${list(missing.map(m => `[${m}]`), 5)}. The first matching row wins.`);
  }
  return { variable: v, parents: vs.parents, table: out };
}

function priorFromMap(vs: VarSpec, probs: unknown): CPT {
  const v = vs.variable!;
  if (vs.parents.length) {
    throw new Problem(`a prior distribution cannot be used for a variable with parents (${list(vs.parents.map(p => p.name))}); use a "table", "conditional", "noisyOr" or "gatedLogistic" CPT`);
  }
  return { variable: v, parents: [], table: Float64Array.from(probabilityRow(v, probs, 'probs')) };
}

function hazardDist(vs: VarSpec, h: Record<string, unknown>, what: string): Distribution {
  const t = vs.temporal;
  if (!t) throw new Problem(`${what}: hazard priors only apply to a temporal variable (declare "temporal": {outcomes, buckets} instead of "outcomes")`);
  const pOccur = num(h.pOccur, `${what}.pOccur`);
  if (pOccur < 0 || pOccur > 1) throw new Problem(`${what}.pOccur must be in [0, 1], got ${pOccur}`);
  if (!Array.isArray(h.hazard)) throw new Problem(`${what}.hazard must be an array with one number per bucket (${list(t.buckets)})`);
  if (h.hazard.length !== t.buckets.length) {
    throw new Problem(`${what}.hazard has ${h.hazard.length} entries but there are ${t.buckets.length} buckets (${list(t.buckets)})`);
  }
  const hazard = h.hazard.map((x, i) => num(x, `${what}.hazard[${i}]`));
  const mode = h.hazardMode ?? 'weights';
  if (mode !== 'weights' && mode !== 'rates') throw new Problem(`${what}.hazardMode must be "weights" or "rates"`);
  let outcomes = new Map<string, number>(t.outcomes.map(o => [o, 1]));
  if (h.outcomes !== undefined) {
    if (!isObj(h.outcomes)) throw new Problem(`${what}.outcomes must be an {outcome: weight} object over ${list(t.outcomes)}`);
    outcomes = new Map();
    for (const [k, w] of Object.entries(h.outcomes)) {
      if (!t.outcomes.includes(k)) throw new Problem(`${what}.outcomes: "${k}" is not one of the temporal outcomes ${list(t.outcomes)}`);
      outcomes.set(k, num(w, `${what}.outcomes.${k}`));
    }
  }
  try {
    return hazardPrior({ outcomes, pOccur, buckets: t.buckets, hazard, hazardMode: mode, nullOutcome: t.nullOutcome });
  } catch (e) {
    throw new Problem(`${what}: ${(e as Error).message}`);
  }
}

function noisyOrSpec(vs: VarSpec, c: Record<string, unknown>): CPT {
  const v = vs.variable!;
  if (v.outcomes.length !== 2) {
    throw new Problem(`noisyOr needs a binary child but "${v.name}" has ${v.outcomes.length} outcomes (${list(v.outcomes)}); use "gatedLogistic" or a "table"`);
  }
  if (!vs.parents.length) throw new Problem('noisyOr needs at least one parent');
  const leak = c.leak === undefined ? 0 : num(c.leak, 'leak');
  let weights: number[];
  if (Array.isArray(c.weights)) {
    if (c.weights.length !== vs.parents.length) {
      throw new Problem(`weights has ${c.weights.length} entries but "${v.name}" has ${vs.parents.length} parents (${list(vs.parents.map(p => p.name))}), in that order`);
    }
    weights = c.weights.map((w, i) => num(w, `weights[${i}]`));
  } else if (isObj(c.weights)) {
    const given = new Map<string, number>();
    for (const [k, w] of Object.entries(c.weights)) {
      parentByName(vs, k, 'weights');
      given.set(k, num(w, `weights.${k}`));
    }
    const missing = vs.parents.filter(p => !given.has(p.name)).map(p => p.name);
    if (missing.length) throw new Problem(`weights is missing parent(s): ${list(missing)}`);
    weights = vs.parents.map(p => given.get(p.name)!);
  } else {
    throw new Problem(`noisyOr needs "weights": {parent: P(child active | only that parent active)} (parents: ${list(vs.parents.map(p => p.name))})`);
  }
  let parentActiveOutcomes: string[] | undefined;
  if (c.activeOutcomes !== undefined) {
    if (!isObj(c.activeOutcomes)) throw new Problem('activeOutcomes must be an object {parent: outcome that counts as active}');
    for (const k of Object.keys(c.activeOutcomes)) parentByName(vs, k, 'activeOutcomes');
    parentActiveOutcomes = vs.parents.map(p => {
      const given = (c.activeOutcomes as Record<string, unknown>)[p.name];
      return given === undefined ? p.outcomes[1] : outcomeOf(p, given, `activeOutcomes.${p.name}`);
    });
  } else {
    const nonBinary = vs.parents.filter(p => p.outcomes.length !== 2);
    if (nonBinary.length) {
      throw new Problem(`parent(s) ${list(nonBinary.map(p => p.name))} are not binary: add "activeOutcomes": {parent: active outcome}`);
    }
  }
  const nullOutcome = c.nullOutcome === undefined ? undefined : outcomeOf(v, c.nullOutcome, 'nullOutcome');
  try {
    return noisyOrCPT({ variable: v, parents: vs.parents, leak, weights, nullOutcome, parentActiveOutcomes });
  } catch (e) {
    throw new Problem(`noisyOr: ${(e as Error).message}`);
  }
}

function gatedLogisticSpec(vs: VarSpec, c: Record<string, unknown>, all: Map<string, VarSpec>): CPT {
  const v = vs.variable!;
  const nullOutcome = c.nullOutcome === undefined
    ? (vs.temporal?.nullOutcome ?? undefined)
    : outcomeOf(v, c.nullOutcome, 'nullOutcome');

  // base
  let base: Distribution | number[];
  if (c.base === undefined) {
    base = new Array(v.outcomes.length).fill(1);
  } else if (isObj(c.base) && 'hazard' in c.base) {
    base = hazardDist(vs, c.base, 'base');
  } else {
    base = [...weightDist(v, c.base, 'base').values()];
  }

  // gate
  const gate: GateClause[][] = [];
  if (c.gate !== undefined) {
    if (!Array.isArray(c.gate)) throw new Problem('gate must be an array of OR-groups; each group is an array of {parent, outcomes}. The gate is satisfied when every group has a satisfied clause.');
    c.gate.forEach((group, gi) => {
      const clauses = Array.isArray(group) ? group : [group];
      if (clauses.length === 0) throw new Problem(`gate[${gi}] is an empty OR-group`);
      gate.push(clauses.map((cl, ci) => {
        const w = `gate[${gi}][${ci}]`;
        if (!isObj(cl)) throw new Problem(`${w} must be {parent, outcomes: [...]}`);
        const { p } = parentByName(vs, cl.parent, w);
        const outs = Array.isArray(cl.outcomes) ? cl.outcomes : [cl.outcomes ?? cl.outcome];
        if (outs.length === 0 || outs[0] === undefined) throw new Problem(`${w} needs "outcomes": [...] (valid for ${p.name}: ${list(p.outcomes)})`);
        return { parent: p.name, outcomes: outs.map((o, oi) => outcomeOf(p, o, `${w}.outcomes[${oi}]`)) };
      }));
    });
  }

  // shifts
  const shifts: LogOddsShift[] = [];
  if (c.shifts !== undefined) {
    if (!Array.isArray(c.shifts)) throw new Problem('shifts must be an array of {parent, outcome, logOdds}');
    c.shifts.forEach((s, si) => {
      const w = `shifts[${si}]`;
      if (!isObj(s)) throw new Problem(`${w} must be {parent, outcome, logOdds}`);
      const { p } = parentByName(vs, s.parent, w);
      const outcome = outcomeOf(p, s.outcome, `${w}.outcome`);
      const vec = parseVector(v, s.logOdds, `${w}.logOdds`, logOddsNum);
      shifts.push({ parent: p.name, outcome, logOdds: vec });
    });
  }

  // delays (temporal parent -> temporal child)
  if (c.delays !== undefined) {
    if (!Array.isArray(c.delays)) throw new Problem('delays must be an array of {parent, delay} (delay in buckets)');
    c.delays.forEach((d, di) => {
      const w = `delays[${di}]`;
      if (!isObj(d)) throw new Problem(`${w} must be {parent, delay}`);
      const { p } = parentByName(vs, d.parent, w);
      const pt = all.get(p.name)?.temporal;
      if (!pt || !vs.temporal) {
        throw new Problem(`${w}: delays need both "${p.name}" and "${vs.name}" to be temporal variables (declared with "temporal")`);
      }
      if (pt.buckets.join('\u0000') !== vs.temporal.buckets.join('\u0000')) {
        throw new Problem(`${w}: "${p.name}" and "${vs.name}" must use identical bucket lists (${list(pt.buckets)} vs ${list(vs.temporal.buckets)})`);
      }
      const delay = d.delay === undefined ? 0 : num(d.delay, `${w}.delay`);
      if (!Number.isInteger(delay) || delay < 0) throw new Problem(`${w}.delay must be a non-negative integer number of buckets`);
      shifts.push(...delayShifts({ parent: p, child: v, buckets: vs.temporal.buckets, delay }));
    });
  }

  try {
    return gatedLogisticCPT({ variable: v, parents: vs.parents, nullOutcome, gate, base, shifts });
  } catch (e) {
    throw new Problem(`gatedLogistic: ${(e as Error).message}`);
  }
}

function buildCpt(vs: VarSpec, all: Map<string, VarSpec>): { cpt: CPT; kind: string } {
  const c = vs.raw.cpt;
  if (c === undefined || c === null) {
    throw new Problem(
      `missing "cpt". Give an explicit table (e.g. "cpt": [0.3, 0.7]), or {"type": "prior" | "table" | "conditional" | "noisyOr" | "gatedLogistic" | "hazardPrior" | "uniform", ...}`,
    );
  }
  if (Array.isArray(c)) return { cpt: tableCpt(vs, c), kind: 'table' };
  if (!isObj(c)) throw new Problem('"cpt" must be an array (explicit table) or an object with a "type"');
  const type = c.type ?? (c.table !== undefined ? 'table'
    : c.rows !== undefined ? 'conditional'
    : c.hazard !== undefined ? 'hazardPrior'
    : c.weights !== undefined ? 'noisyOr'
    : c.probs !== undefined ? 'prior'
    : !vs.parents.length && Object.values(c).every(isNum) ? 'priorMap'
    : undefined);
  switch (type) {
    case 'table':
      return { cpt: tableCpt(vs, c.table), kind: 'table' };
    case 'prior':
      return { cpt: priorFromMap(vs, c.probs), kind: 'prior' };
    case 'priorMap':
      return { cpt: priorFromMap(vs, c), kind: 'prior' };
    case 'uniform': {
      const v = vs.variable!;
      const t = new Float64Array(rowCount(vs.parents) * v.outcomes.length).fill(1 / v.outcomes.length);
      return { cpt: { variable: v, parents: vs.parents, table: t }, kind: 'uniform' };
    }
    case 'conditional':
      return { cpt: conditionalCpt(vs, c), kind: 'conditional' };
    case 'noisyOr':
      return { cpt: noisyOrSpec(vs, c), kind: 'noisyOr' };
    case 'gatedLogistic':
      return { cpt: gatedLogisticSpec(vs, c, all), kind: 'gatedLogistic' };
    case 'hazardPrior': {
      if (vs.parents.length) {
        throw new Problem('hazardPrior is a prior and cannot have parents; for a temporal variable with parents use "gatedLogistic" with "base": {pOccur, hazard, ...}');
      }
      return { cpt: priorCPT(vs.variable!, hazardDist(vs, c, 'cpt')), kind: 'hazardPrior' };
    }
    default:
      throw new Problem(
        type === undefined
          ? `could not infer the CPT kind from keys {${Object.keys(c).join(', ')}}; set "type" to one of: table, prior, conditional, noisyOr, gatedLogistic, hazardPrior, uniform`
          : `unknown CPT type "${String(type)}". Use one of: table, prior, conditional, noisyOr, gatedLogistic, hazardPrior, uniform`,
      );
  }
}

// ─── Entry point ────────────────────────────────────────────────────

/** Build and validate a network from a spec; throws `SpecError` listing every problem. */
export function buildNetworkFromSpec(spec: unknown): BuiltNetwork {
  const problems: string[] = [];
  if (!isObj(spec)) throw new SpecError(['spec must be an object {name?, variables: [...]}']);
  if (!Array.isArray(spec.variables) || spec.variables.length === 0) {
    throw new SpecError(['spec.variables must be a non-empty array of {name, outcomes, parents?, cpt}']);
  }
  if (spec.variables.length > MAX_SPEC_VARIABLES) {
    throw new SpecError([`spec has ${spec.variables.length} variables; the limit is ${MAX_SPEC_VARIABLES}`]);
  }
  const name = spec.name === undefined ? 'network' : String(spec.name);

  // Pass 1: variables
  const specs: VarSpec[] = [];
  const byName = new Map<string, VarSpec>();
  spec.variables.forEach((raw: unknown, i: number) => {
    const at = `variables[${i}]`;
    if (!isObj(raw)) { problems.push(`${at} must be an object {name, outcomes, parents?, cpt}`); return; }
    const vname = typeof raw.name === 'string' ? raw.name.trim() : '';
    if (!vname) { problems.push(`${at} needs a non-empty string "name"`); return; }
    const label = `${at} "${vname}"`;
    if (byName.has(vname)) { problems.push(`${label}: duplicate variable name`); return; }
    const vs: VarSpec = { name: vname, raw, parents: [] };
    specs.push(vs);
    byName.set(vname, vs);
    try {
      if (raw.temporal !== undefined) {
        if (raw.outcomes !== undefined) throw new Problem('give either "outcomes" or "temporal", not both (temporal outcomes are generated: none, o@bucket, ...)');
        if (!isObj(raw.temporal)) throw new Problem('"temporal" must be {outcomes: [...], buckets: [...], nullOutcome?}');
        const t = raw.temporal;
        if (!Array.isArray(t.outcomes) || t.outcomes.length === 0) throw new Problem('temporal.outcomes must be a non-empty array of strings (the non-null outcomes, e.g. ["success", "failure"])');
        if (!Array.isArray(t.buckets) || t.buckets.length === 0) throw new Problem('temporal.buckets must be a non-empty chronological array of strings (e.g. ["Q1", "Q2", "Q3"])');
        const outs = t.outcomes.map((o, k) => str(o, `temporal.outcomes[${k}]`));
        const buckets = t.buckets.map((b, k) => str(b, `temporal.buckets[${k}]`));
        if (new Set(buckets).size !== buckets.length) throw new Problem('temporal.buckets must be unique');
        if (new Set(outs).size !== outs.length) throw new Problem('temporal.outcomes must be unique');
        for (const x of [...outs, ...buckets]) {
          if (x.includes(TEMPORAL_SEPARATOR)) throw new Problem(`temporal labels cannot contain "${TEMPORAL_SEPARATOR}" (found in "${x}")`);
        }
        const nullOutcome = t.nullOutcome === undefined ? DEFAULT_NULL_OUTCOME : str(t.nullOutcome, 'temporal.nullOutcome');
        vs.temporal = { outcomes: outs.filter(o => o !== nullOutcome), buckets, nullOutcome };
        vs.variable = temporalVariable({ name: vname, outcomes: outs, buckets, nullOutcome });
      } else {
        if (!Array.isArray(raw.outcomes)) throw new Problem('"outcomes" must be an array of at least 2 distinct strings (or declare a "temporal" variable)');
        const outs = raw.outcomes.map((o, k) => str(o, `outcomes[${k}]`));
        if (outs.length < 2) throw new Problem(`needs at least 2 outcomes, got ${outs.length}`);
        const dup = outs.find((o, k) => outs.indexOf(o) !== k);
        if (dup !== undefined) throw new Problem(`duplicate outcome "${dup}"`);
        vs.variable = { name: vname, outcomes: outs };
      }
    } catch (e) {
      if (e instanceof Problem || e instanceof Error) problems.push(`${label}: ${e.message}`);
    }
  });

  // Pass 2: parents and acyclicity
  for (const vs of specs) {
    const raw = vs.raw.parents;
    if (raw === undefined) continue;
    const label = `variable "${vs.name}"`;
    if (!Array.isArray(raw)) { problems.push(`${label}: "parents" must be an array of variable names`); continue; }
    const seen = new Set<string>();
    for (const pn of raw) {
      if (typeof pn !== 'string' || !byName.has(pn)) {
        problems.push(`${label}: parent ${JSON.stringify(pn)} is not a variable in the spec. Variables: ${list([...byName.keys()])}`);
      } else if (pn === vs.name) {
        problems.push(`${label}: a variable cannot be its own parent`);
      } else if (seen.has(pn)) {
        problems.push(`${label}: duplicate parent "${pn}"`);
      } else {
        seen.add(pn);
        const pv = byName.get(pn)!.variable;
        if (pv) vs.parents.push(pv);
      }
    }
  }
  const cycle = findCycle(specs);
  if (cycle) problems.push(`the parent relation has a cycle: ${cycle.join(' -> ')}. A Bayesian network must be a DAG; remove one of these edges`);

  // Pass 3: CPTs
  const cpts: CPT[] = [];
  const kinds = new Map<string, string>();
  {
    for (const vs of specs) {
      const label = `variable "${vs.name}"`;
      if (!vs.variable) continue;
      if (vs.parents.length !== (Array.isArray(vs.raw.parents) ? vs.raw.parents.length : 0)) continue; // parent error already reported
      const entries = rowCount(vs.parents) * vs.variable.outcomes.length;
      if (entries > MAX_CPT_ENTRIES) {
        problems.push(`${label}: its CPT would have ${entries.toLocaleString()} entries (limit ${MAX_CPT_ENTRIES.toLocaleString()}). Reduce parents or outcomes, or introduce intermediate variables`);
        continue;
      }
      try {
        const { cpt, kind } = buildCpt(vs, byName);
        cpts.push(cpt);
        kinds.set(vs.name, kind);
      } catch (e) {
        problems.push(`${label} cpt: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  if (problems.length) throw new SpecError(problems);
  return { network: new BayesianNetwork({ name, variables: specs.map(s => s.variable!), cpts }), kinds };
}

/** Return a cycle as a list of names (first == last), or null. */
function findCycle(specs: readonly VarSpec[]): string[] | null {
  const parents = new Map(specs.map(s => [s.name, s.parents.map(p => p.name)]));
  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const visit = (n: string): string[] | null => {
    state.set(n, 1);
    stack.push(n);
    for (const p of parents.get(n) ?? []) {
      if (state.get(p) === 1) return [...stack.slice(stack.indexOf(p)), p].reverse();
      if (!state.get(p)) {
        const c = visit(p);
        if (c) return c;
      }
    }
    stack.pop();
    state.set(n, 2);
    return null;
  };
  for (const s of specs) {
    if (!state.get(s.name)) {
      const c = visit(s.name);
      if (c) return c;
    }
  }
  return null;
}
