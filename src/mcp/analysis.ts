/**
 * Analysis cores behind the MCP tools: pure functions over a parsed network
 * that return concise text (for the model) plus structured data.
 *
 * Every function is stateless with respect to evidence: callers pass the full
 * hard (`{var: outcome}`) and soft (`{var: {outcome: weight}}`) evidence.
 */
import { BayesianNetwork } from '../lib/network.js';
import type { Variable, CPT, Evidence, LikelihoodEvidence, Distribution } from '../lib/types.js';
import { DEFAULT_MAX_CLIQUE_ENTRIES } from '../lib/inference.js';
import type { CostEstimate } from '../lib/graph.js';
import { validateEvidence, ImpossibleEvidenceError } from '../lib/evidence.js';
import { kBestExplanations } from '../lib/mpe.js';
import { valueOfInformation, multiQueryVOI, entropy } from '../lib/voi.js';
import { CachedInferenceEngine } from '../lib/cached-inference.js';
import { topInfluentialAnalytic, evalCurve } from '../lib/analytic-sensitivity.js';
import { tornadoAnalysis } from '../lib/sensitivity.js';
import { mutilateNetwork, averageCausalEffect, type Intervention } from '../lib/causal-inference.js';
import { likelihoodWeighting, sampledMarginals } from '../lib/sampling.js';
import { parseCSV, learnStructure, type DataColumn } from '../lib/structure-learning.js';

/** Error whose message is shown verbatim to the model. */
export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolError';
  }
}

export interface AnalysisLimits {
  /** Largest junction-tree clique (table entries) allowed for exact inference. */
  maxCliqueEntries: number;
}

export const DEFAULT_LIMITS: AnalysisLimits = { maxCliqueEntries: DEFAULT_MAX_CLIQUE_ENTRIES };

// ─── Formatting ─────────────────────────────────────────────────────

export function pct(p: number): string {
  const x = p * 100;
  if (x === 0) return '0%';
  if (x >= 99.95 || x <= 0.05) return `${+x.toPrecision(3)}%`;
  return `${x.toFixed(1)}%`;
}

function signedPts(delta: number): string {
  const x = delta * 100;
  const s = Math.abs(x) < 0.05 ? '0' : Math.abs(x) < 10 ? x.toFixed(1) : x.toFixed(0);
  return (x > 0.05 ? '+' : '') + s;
}

function list(xs: readonly string[], max = 15): string {
  return xs.length <= max ? xs.join(', ') : `${xs.slice(0, max).join(', ')}, … (${xs.length} total)`;
}

const MAX_OUTCOMES_SHOWN = 8;

/** `a 62.3% (+12.1), b 37.7% (-12.1)`; shows the top outcomes for wide variables. */
function formatDist(v: Variable, dist: Distribution, prior?: Distribution): string {
  let entries = v.outcomes.map(o => ({ o, p: dist.get(o) ?? 0 }));
  let more = 0;
  if (entries.length > MAX_OUTCOMES_SHOWN) {
    more = entries.length - MAX_OUTCOMES_SHOWN;
    entries = [...entries].sort((a, b) => b.p - a.p).slice(0, MAX_OUTCOMES_SHOWN);
  }
  const parts = entries.map(({ o, p }) => {
    const delta = prior ? ` (${signedPts(p - (prior.get(o) ?? 0))})` : '';
    return `${o} ${pct(p)}${delta}`;
  });
  return parts.join(', ') + (more ? `, … +${more} more outcomes` : '');
}

export function describeEvidence(evidence: Evidence, soft: LikelihoodEvidence): string {
  const parts = [...evidence].map(([k, v]) => `${k}=${v}`);
  for (const [k, w] of soft) parts.push(`${k}~{${[...w].map(([o, x]) => `${o}:${x}`).join(', ')}}`);
  return parts.length ? parts.join(', ') : '(none)';
}

// ─── Inputs ─────────────────────────────────────────────────────────

export type RawEvidence = Record<string, string | number | boolean> | undefined;
export type RawSoftEvidence = Record<string, Record<string, number>> | undefined;

export function toEvidence(raw: RawEvidence): Evidence {
  return new Map(Object.entries(raw ?? {}).map(([k, v]) => [k, String(v)]));
}

export function toSoftEvidence(raw: RawSoftEvidence): LikelihoodEvidence {
  return new Map(Object.entries(raw ?? {}).map(([k, w]) => [k, new Map(Object.entries(w))]));
}

/** Validate evidence (messages list the valid variables / outcomes). */
export function checkEvidence(network: BayesianNetwork, ev: Evidence, soft: LikelihoodEvidence): void {
  try {
    validateEvidence(network.variables, ev, soft);
  } catch (e) {
    throw new ToolError((e instanceof Error ? e.message : String(e)).replace(/^nabab: /, ''));
  }
  for (const k of ev.keys()) {
    if (soft.has(k)) throw new ToolError(`Variable "${k}" appears in both evidence and softEvidence; use one of them.`);
  }
}

export function requireVariable(network: BayesianNetwork, name: string, what = 'variable'): Variable {
  const v = network.getVariable(name);
  if (!v) {
    throw new ToolError(
      `Unknown ${what} "${name}". Variables: ${list(network.variables.map(x => x.name), 40)}. ` +
      'Use describe_network to see the structure.',
    );
  }
  return v;
}

function requireVariables(network: BayesianNetwork, names: readonly string[]): Variable[] {
  return names.map(n => requireVariable(network, n));
}

// ─── Cost guard ─────────────────────────────────────────────────────

const costCache = new WeakMap<BayesianNetwork, CostEstimate>();

export function networkCost(network: BayesianNetwork): CostEstimate {
  let c = costCache.get(network);
  if (!c) {
    c = network.estimateInferenceCost();
    costCache.set(network, c);
  }
  return c;
}

export function exactAffordable(network: BayesianNetwork, limits: AnalysisLimits): boolean {
  return networkCost(network).maxCliqueEntries <= limits.maxCliqueEntries;
}

function costDescription(network: BayesianNetwork, limits: AnalysisLimits): string {
  const c = networkCost(network);
  return `"${network.name}" has ${network.variables.length} variables, treewidth ${c.treewidth}; its largest junction-tree clique would need ` +
    `${c.maxCliqueEntries.toExponential(2)} table entries (budget ${limits.maxCliqueEntries.toLocaleString()})`;
}

/** Throw a model-friendly error when exact inference is too expensive. */
export function guardExact(network: BayesianNetwork, limits: AnalysisLimits, tool: string, canSample: boolean): void {
  if (exactAffordable(network, limits)) return;
  const advice = canSample
    ? 'Use method:"sampling" (likelihood weighting, approximate) or method:"auto", and list only the variables you need in `variables` to keep the output short.'
    : `${tool} needs exact inference. Use query with method:"sampling" for approximate marginals, or reduce the network (fewer parents / outcomes per variable, or drop variables irrelevant to the question).`;
  throw new ToolError(`Exact inference is too expensive: ${costDescription(network, limits)}. ${advice}`);
}

function wrapImpossible<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof ImpossibleEvidenceError) {
      throw new ToolError('The evidence has probability zero under this network (contradictory or impossible observations), so no posterior is defined. Remove or change some evidence.');
    }
    throw e;
  }
}

// ─── query ──────────────────────────────────────────────────────────

export type QueryMethod = 'exact' | 'sampling' | 'auto';

export interface QueryOptions {
  evidence: Evidence;
  soft: LikelihoodEvidence;
  variables?: readonly string[];
  method: QueryMethod;
  samples: number;
  seed?: number;
  limits: AnalysisLimits;
  /** Cached exact priors for the network, if any. */
  priors?: Map<Variable, Distribution>;
}

export interface QueryOutcome {
  text: string;
  posteriors: Record<string, Record<string, number>>;
  method: 'exact' | 'sampling';
  probabilityOfEvidence?: number;
  /** Exact priors computed along the way (callers may cache them). */
  priors?: Map<Variable, Distribution>;
}

const MAX_VARS_LISTED = 40;

function sampledPosteriors(
  network: BayesianNetwork, ev: Evidence, soft: LikelihoodEvidence, n: number, seed?: number,
): { posteriors: Map<Variable, Distribution>; pEvidence: number; ess: number } {
  const r = likelihoodWeighting(network.variables, network.cpts, ev, soft, n, { seed });
  if (!(r.totalWeight > 0)) {
    throw new ToolError(
      'Sampling found no sample consistent with the evidence (it is impossible or extremely unlikely). ' +
      'Check the evidence, or raise `samples`.',
    );
  }
  let sq = 0;
  for (let i = 0; i < r.n; i++) sq += r.weights[i] * r.weights[i];
  return { posteriors: sampledMarginals(r), pEvidence: r.totalWeight / r.n, ess: (r.totalWeight * r.totalWeight) / sq };
}

export function queryNetwork(network: BayesianNetwork, handle: string, o: QueryOptions): QueryOutcome {
  checkEvidence(network, o.evidence, o.soft);
  const selected = o.variables?.length ? requireVariables(network, o.variables) : [...network.variables];
  const exactOk = exactAffordable(network, o.limits);
  let method: 'exact' | 'sampling';
  if (o.method === 'exact') {
    guardExact(network, o.limits, 'query', true);
    method = 'exact';
  } else if (o.method === 'sampling') {
    method = 'sampling';
  } else {
    method = exactOk ? 'exact' : 'sampling';
  }

  let posteriors: Map<Variable, Distribution>;
  let priors: Map<Variable, Distribution> | undefined = o.priors;
  let pEvidence: number | undefined;
  let note = '';
  const hasEvidence = o.evidence.size > 0 || o.soft.size > 0;
  if (method === 'exact') {
    const r = wrapImpossible(() => network.infer(o.evidence, o.soft, { maxCliqueEntries: o.limits.maxCliqueEntries }));
    posteriors = r.posteriors;
    pEvidence = r.probabilityOfEvidence;
    if (hasEvidence && !priors) priors = network.infer(undefined, undefined, { maxCliqueEntries: o.limits.maxCliqueEntries }).posteriors;
    if (!hasEvidence) priors = posteriors;
  } else {
    const r = sampledPosteriors(network, o.evidence, o.soft, o.samples, o.seed);
    posteriors = r.posteriors;
    pEvidence = hasEvidence ? r.pEvidence : undefined;
    priors = undefined;
    if (hasEvidence) priors = sampledPosteriors(network, new Map(), new Map(), o.samples, o.seed).posteriors;
    note = `Method: sampling (likelihood weighting, ${o.samples.toLocaleString()} samples, effective sample size ${Math.round(r.ess).toLocaleString()}); values are approximate (typical error ~${(100 / Math.sqrt(Math.max(r.ess, 1))).toFixed(1)} pts worst case).` +
      (r.ess < 100 ? ' Warning: low effective sample size, the evidence is unlikely; raise `samples`.' : '') +
      (o.method === 'auto' ? ' (Exact inference was too expensive for this network.)' : '');
  }

  const lines: string[] = [];
  lines.push(`Network "${network.name}" [${handle}], ${network.variables.length} variables. Evidence: ${describeEvidence(o.evidence, o.soft)}`);
  if (note) lines.push(note);
  if (pEvidence !== undefined) {
    lines.push(`P(evidence) = ${pEvidence < 0.001 ? pEvidence.toExponential(3) : pEvidence.toFixed(4)}${method === 'sampling' ? ' (estimate)' : ''}`);
  }
  lines.push(hasEvidence ? 'Posteriors (change vs prior in percentage points):' : 'Prior marginals:');
  const shown = selected.slice(0, MAX_VARS_LISTED);
  for (const v of shown) {
    const d = posteriors.get(v);
    if (!d) continue;
    const observed = o.evidence.has(v.name) ? ' [observed]' : o.soft.has(v.name) ? ' [soft evidence]' : '';
    lines.push(`  ${v.name}${observed}: ${formatDist(v, d, hasEvidence && !observed ? priors?.get(v) : undefined)}`);
  }
  if (selected.length > shown.length) {
    lines.push(`  … ${selected.length - shown.length} more variables not shown; pass \`variables\` to choose which ones.`);
  }

  const out: Record<string, Record<string, number>> = {};
  for (const v of selected) {
    const d = posteriors.get(v);
    if (d) out[v.name] = Object.fromEntries(d);
  }
  return { text: lines.join('\n'), posteriors: out, method, probabilityOfEvidence: pEvidence, priors: method === 'exact' ? priors : undefined };
}

// ─── explain ────────────────────────────────────────────────────────

export interface ExplainOptions {
  evidence: Evidence;
  soft: LikelihoodEvidence;
  k: number;
  variables?: readonly string[];
  limits: AnalysisLimits;
}

export function explainNetwork(network: BayesianNetwork, handle: string, o: ExplainOptions): { text: string; explanations: Array<{ probability: number; assignment: Record<string, string> }> } {
  checkEvidence(network, o.evidence, o.soft);
  guardExact(network, o.limits, 'explain', false);
  const shownVars = o.variables?.length ? requireVariables(network, o.variables).map(v => v.name) : undefined;
  const k = Math.min(Math.max(1, Math.floor(o.k)), 20);
  const pe = wrapImpossible(() => network.infer(o.evidence, o.soft, { maxCliqueEntries: o.limits.maxCliqueEntries }).probabilityOfEvidence);
  const best = wrapImpossible(() => kBestExplanations(network.variables, network.cpts, k, o.evidence, o.soft));
  const logPe = Math.log(pe);
  const explanations = best.map(e => ({
    probability: Math.exp(e.logProbability - logPe),
    assignment: Object.fromEntries(e.assignment),
  }));

  const lines: string[] = [];
  lines.push(`Network "${network.name}" [${handle}]. Evidence: ${describeEvidence(o.evidence, o.soft)}`);
  const names = network.variables.map(v => v.name).filter(n => !o.evidence.has(n) && (!shownVars || shownVars.includes(n)));
  const first = explanations[0];
  if (!first) return { text: lines.concat('No consistent explanation found.').join('\n'), explanations };
  lines.push(k === 1
    ? `Most probable explanation (joint probability of this full assignment given the evidence: ${pct(first.probability)}):`
    : `${explanations.length} most probable explanations (each is a FULL joint assignment; probabilities are conditional on the evidence):`);
  const shownCap = 60;
  const fmtAssign = (a: Record<string, string>, only?: string[]) =>
    (only ?? names).map(n => `${n}=${a[n]}`).join(', ');
  if (k === 1) {
    lines.push(`  ${fmtAssign(first.assignment, names.slice(0, shownCap))}${names.length > shownCap ? `, … ${names.length - shownCap} more (use \`variables\`)` : ''}`);
  } else {
    explanations.forEach((e, i) => {
      lines.push(`  #${i + 1} ${pct(e.probability)}`);
      if (i === 0) {
        lines.push(`      ${fmtAssign(e.assignment, names.slice(0, shownCap))}${names.length > shownCap ? ', …' : ''}`);
      } else {
        const diff = names.filter(n => e.assignment[n] !== first.assignment[n]);
        lines.push(`      differs from #1 in: ${diff.length ? diff.slice(0, shownCap).map(n => `${n}=${e.assignment[n]}`).join(', ') : '(only in hidden variables)'}`);
      }
    });
  }
  return { text: lines.join('\n'), explanations };
}

// ─── what_to_observe ────────────────────────────────────────────────

const MAX_VOI_INFERENCES = 1500;

export interface VoiOptions {
  targets: readonly string[];
  evidence: Evidence;
  candidates?: readonly string[];
  top: number;
  limits: AnalysisLimits;
}

export function whatToObserve(network: BayesianNetwork, handle: string, o: VoiOptions) {
  if (o.targets.length === 0) throw new ToolError('`target` must name at least one variable of interest.');
  requireVariables(network, o.targets);
  const candidateSet = o.candidates?.length ? new Set(requireVariables(network, o.candidates).map(v => v.name)) : undefined;
  checkEvidence(network, o.evidence, new Map());
  guardExact(network, o.limits, 'what_to_observe', false);
  const work = network.variables.reduce((n, v) => n + v.outcomes.length, 0) * o.targets.length;
  if (work > MAX_VOI_INFERENCES * 4) {
    throw new ToolError(
      `Value-of-information would need about ${work.toLocaleString()} inferences for "${network.name}" (${network.variables.length} variables, ${o.targets.length} target(s)), which is too many. ` +
      'Use a smaller network, or fewer targets.',
    );
  }
  const engine = new CachedInferenceEngine(network);
  let results = wrapImpossible(() =>
    o.targets.length === 1
      ? valueOfInformation(network, o.targets[0], o.evidence, engine)
      : multiQueryVOI(network, [...o.targets], o.evidence, engine));
  if (candidateSet) results = results.filter(r => candidateSet.has(r.variable));
  const top = results.slice(0, Math.min(Math.max(1, o.top), 50));

  const baseH = results[0]?.baseEntropy ?? wrapImpossible(() => {
    return o.targets.reduce((h, t) => h + entropy(network.query(t, o.evidence)), 0);
  });
  const lines: string[] = [];
  lines.push(`Network "${network.name}" [${handle}]. Target: ${o.targets.join(', ')}. Evidence: ${describeEvidence(o.evidence, new Map())}`);
  lines.push(`Current uncertainty (entropy): ${baseH.toFixed(3)} bits. Ranked by expected entropy reduction if the variable were observed next:`);
  if (top.length === 0) {
    lines.push('  No unobserved variable carries information about the target (all are d-separated from it or already observed).');
  }
  top.forEach((r, i) => {
    const frac = r.baseEntropy > 0 ? ` (${(100 * r.voi / r.baseEntropy).toFixed(0)}% of current)` : '';
    const outs = r.outcomes.filter(x => x.probability > 0.005).slice(0, 4)
      .map(x => `${x.outcome} ${pct(x.probability)}`).join(', ');
    lines.push(`  ${i + 1}. ${r.variable}: -${r.voi.toFixed(3)} bits${frac}; would read: ${outs}`);
  });
  return {
    text: lines.join('\n'),
    ranking: top.map(r => ({ variable: r.variable, voi: r.voi, baseEntropy: r.baseEntropy })),
  };
}

// ─── sensitivity ────────────────────────────────────────────────────

const MAX_SENSITIVITY_PARAMS = 800;

export interface SensitivityOptions {
  target: string;
  outcome?: string;
  evidence: Evidence;
  top: number;
  mode: 'derivative' | 'tornado';
  limits: AnalysisLimits;
}

export function sensitivityReport(network: BayesianNetwork, handle: string, o: SensitivityOptions) {
  const tv = requireVariable(network, o.target, 'target variable');
  const outcome = o.outcome ?? tv.outcomes[0];
  if (!tv.outcomes.includes(outcome)) {
    throw new ToolError(`"${outcome}" is not an outcome of "${tv.name}". Valid outcomes: ${tv.outcomes.join(', ')}`);
  }
  checkEvidence(network, o.evidence, new Map());
  guardExact(network, o.limits, 'sensitivity', false);
  const params = network.cpts.reduce((n, c) => n + c.table.length, 0);
  if (params > MAX_SENSITIVITY_PARAMS) {
    throw new ToolError(
      `Sensitivity analysis re-runs inference for every CPT parameter; "${network.name}" has ${params.toLocaleString()} parameters (limit ${MAX_SENSITIVITY_PARAMS.toLocaleString()}). ` +
      'Use a smaller network (or a sub-network containing the target and its relevant ancestors).',
    );
  }
  const top = Math.min(Math.max(1, o.top), 50);
  const base = wrapImpossible(() => network.query(tv.name, o.evidence).get(outcome) ?? 0);
  const lines: string[] = [];
  lines.push(`Network "${network.name}" [${handle}]. Target: P(${tv.name}=${outcome}) = ${pct(base)} given ${describeEvidence(o.evidence, new Map())}`);
  let rows: Array<Record<string, unknown>>;
  if (o.mode === 'tornado') {
    const res = wrapImpossible(() => tornadoAnalysis(network, tv.name, outcome, o.evidence, 5)).slice(0, top);
    lines.push('Most influential CPT parameters (tornado: P(target) when the parameter is swept 0..1, others unchanged):');
    res.forEach((r, i) => lines.push(
      `  ${i + 1}. P(${r.variable}=${r.outcome} | ${r.parentConfig}): target ranges ${pct(Math.min(...r.queryValues))}..${pct(Math.max(...r.queryValues))} (range ${pct(r.range)})`));
    rows = res.map(r => ({ ...r }));
  } else {
    const res = wrapImpossible(() => topInfluentialAnalytic(network, tv.name, outcome, top, o.evidence));
    lines.push('Most influential CPT parameters by |d P(target) / d parameter| (exact derivative at the current value):');
    res.forEach((r, i) => {
      const at0 = evalCurve(r, 0), at1 = evalCurve(r, 1);
      lines.push(
        `  ${i + 1}. P(${r.variable}=${r.outcome} | ${r.parentConfig}) = ${+r.currentValue.toFixed(4)}: slope ${r.derivative >= 0 ? '+' : ''}${r.derivative.toFixed(3)}; target would be ${pct(at0)} at 0 and ${pct(at1)} at 1`);
    });
    rows = res.map(r => ({ variable: r.variable, parentConfig: r.parentConfig, outcome: r.outcome, currentValue: r.currentValue, derivative: r.derivative, range: r.range }));
  }
  lines.push('Slopes are per unit change of the parameter alone (other entries of its row are not renormalised).');
  return { text: lines.join('\n'), parameters: rows };
}

// ─── intervene ──────────────────────────────────────────────────────

export interface InterveneOptions {
  interventions: Record<string, string | number | boolean>;
  observations: Evidence;
  variables?: readonly string[];
  effect?: string;
  limits: AnalysisLimits;
}

export function interveneReport(network: BayesianNetwork, handle: string, o: InterveneOptions) {
  const ivs: Intervention[] = Object.entries(o.interventions).map(([variable, value]) => ({ variable, value: String(value) }));
  if (ivs.length === 0) throw new ToolError('`interventions` must set at least one variable, e.g. {"Treatment": "yes"}.');
  for (const iv of ivs) {
    const v = requireVariable(network, iv.variable, 'intervention variable');
    if (!v.outcomes.includes(iv.value)) {
      throw new ToolError(`do(${iv.variable}=${iv.value}): "${iv.value}" is not an outcome of "${iv.variable}". Valid outcomes: ${v.outcomes.join(', ')}`);
    }
    if (o.observations.has(iv.variable)) {
      throw new ToolError(`"${iv.variable}" is both intervened on and observed; remove it from evidence.`);
    }
  }
  checkEvidence(network, o.observations, new Map());
  guardExact(network, o.limits, 'intervene', false);

  const mutilated = mutilateNetwork(network, ivs);
  const interEv = new Map(o.observations);
  const obsEv = new Map(o.observations);
  for (const iv of ivs) { interEv.set(iv.variable, iv.value); obsEv.set(iv.variable, iv.value); }
  const doRes = wrapImpossible(() => mutilated.infer(interEv, undefined, { maxCliqueEntries: o.limits.maxCliqueEntries }));
  const seeRes = wrapImpossible(() => network.infer(obsEv, undefined, { maxCliqueEntries: o.limits.maxCliqueEntries }));
  const doBy = new Map([...doRes.posteriors].map(([v, d]) => [v.name, d]));
  const seeBy = new Map([...seeRes.posteriors].map(([v, d]) => [v.name, d]));

  const doNames = new Set(ivs.map(i => i.variable));
  const selected = (o.variables?.length ? requireVariables(network, o.variables) : network.variables.filter(v => !doNames.has(v.name)))
    .filter(v => !doNames.has(v.name));
  const doText = ivs.map(i => `do(${i.variable}=${i.value})`).join(', ');
  const lines: string[] = [];
  lines.push(`Network "${network.name}" [${handle}]. ${doText}; other evidence: ${describeEvidence(o.observations, new Map())}`);
  lines.push('P(variable | do(...)) vs. observing the same values, P(variable | X=x). They differ when X has common causes (confounding):');
  const post: Record<string, { do: Record<string, number>; observe: Record<string, number> }> = {};
  const shown = selected.slice(0, MAX_VARS_LISTED);
  for (const v of shown) {
    const d = doBy.get(v.name);
    const s = seeBy.get(v.name);
    if (!d || !s) continue;
    const gap = Math.max(...v.outcomes.map(oc => Math.abs((d.get(oc) ?? 0) - (s.get(oc) ?? 0))));
    lines.push(`  ${v.name}: do: ${formatDist(v, d)}${gap > 0.005 ? `\n      observe: ${formatDist(v, s)}  <- differs by up to ${(gap * 100).toFixed(1)} pts` : '   (same as observing)'}`);
  }
  for (const v of selected) {
    const d = doBy.get(v.name), s = seeBy.get(v.name);
    if (d && s) post[v.name] = { do: Object.fromEntries(d), observe: Object.fromEntries(s) };
  }
  if (selected.length > shown.length) lines.push(`  … ${selected.length - shown.length} more variables not shown; pass \`variables\`.`);

  let ace: number | undefined;
  if (o.effect !== undefined) {
    const ev = requireVariable(network, o.effect, 'effect variable');
    if (ivs.length !== 1) throw new ToolError('`effect` (causal effect table) needs exactly one intervention variable.');
    const cause = requireVariable(network, ivs[0].variable);
    if (cause.name === ev.name) throw new ToolError('`effect` must differ from the intervened variable.');
    lines.push(`Causal effect of ${cause.name} on ${ev.name} (other evidence ignored here), P(${ev.name} | do(${cause.name}=x)):`);
    for (const x of cause.outcomes) {
      const d = wrapImpossible(() => mutilateNetwork(network, [{ variable: cause.name, value: x }])
        .query(ev.name, new Map([[cause.name, x]])));
      lines.push(`  do(${cause.name}=${x}): ${formatDist(ev, d)}`);
    }
    if (cause.outcomes.length >= 2) {
      ace = averageCausalEffect(network, cause.name, ev.name);
      lines.push(`  Average causal effect = P(${ev.name}=${ev.outcomes[0]} | do(${cause.name}=${cause.outcomes[0]})) - P(${ev.name}=${ev.outcomes[0]} | do(${cause.name}=${cause.outcomes[1]})) = ${ace >= 0 ? '+' : ''}${(ace * 100).toFixed(1)} pts`);
    }
  }
  return { text: lines.join('\n'), posteriors: post, averageCausalEffect: ace };
}

// ─── learn_from_csv ─────────────────────────────────────────────────

export const MAX_CSV_COLUMNS = 60;
export const MAX_CSV_ROWS = 200_000;
export const MAX_CSV_CARDINALITY = 25;

export interface LearnOptions {
  name?: string;
  maxParents?: number;
  scoreFunction?: 'bic' | 'aic' | 'k2';
  restarts?: number;
}

export function learnFromCsvText(csv: string, o: LearnOptions): { network: BayesianNetwork; text: string } {
  let data: DataColumn[];
  try {
    data = parseCSV(csv);
  } catch (e) {
    throw new ToolError(`Could not parse CSV: ${e instanceof Error ? e.message : String(e)}. Expected a header row of variable names followed by one row per observation.`);
  }
  if (data.length < 2) throw new ToolError('The CSV needs at least 2 columns (header row of variable names).');
  if (data.length > MAX_CSV_COLUMNS) throw new ToolError(`The CSV has ${data.length} columns; the limit is ${MAX_CSV_COLUMNS}. Drop irrelevant columns.`);
  const rows = data[0].values.length;
  if (rows > MAX_CSV_ROWS) throw new ToolError(`The CSV has ${rows.toLocaleString()} rows; the limit is ${MAX_CSV_ROWS.toLocaleString()}. Subsample it.`);
  const names = data.map(c => c.name);
  const dupName = names.find((n, i) => !n || names.indexOf(n) !== i);
  if (dupName !== undefined) throw new ToolError(`Column names must be non-empty and unique (offending: "${dupName}").`);
  let blanks = 0;
  for (const c of data) {
    c.values = c.values.map(v => { if (v === '') { blanks++; return 'missing'; } return v; });
    const distinct = new Set(c.values).size;
    if (distinct > MAX_CSV_CARDINALITY) {
      throw new ToolError(`Column "${c.name}" has ${distinct} distinct values; learning needs categorical data (at most ${MAX_CSV_CARDINALITY} per column). Discretize it into bins first.`);
    }
    if (distinct < 2) throw new ToolError(`Column "${c.name}" has a single value ("${c.values[0]}"); drop it, it carries no information.`);
  }
  const parsed = learnStructure(data, {
    maxParents: o.maxParents ?? 3,
    scoreFunction: o.scoreFunction ?? 'bic',
    restarts: o.restarts ?? 0,
  });
  const network = new BayesianNetwork({ ...parsed, name: o.name ?? 'learned' });
  const edges = network.cpts.flatMap(c => c.parents.map(p => `${p.name} -> ${c.variable.name}`));
  const lines = [
    `Learned network "${network.name}" from ${rows.toLocaleString()} rows x ${data.length} columns (hill climbing, ${o.scoreFunction ?? 'bic'} score, max ${o.maxParents ?? 3} parents).`,
    `Edges (${edges.length}; learned structure is a statistical association, not necessarily causal, and edge directions may be arbitrary within an equivalence class): ${edges.length ? edges.join(', ') : '(none, columns look independent)'}`,
  ];
  if (blanks) lines.push(`${blanks} empty cell(s) were treated as the value "missing".`);
  return { network, text: lines.join('\n') };
}

// ─── describe_network ───────────────────────────────────────────────

export function describeNetwork(network: BayesianNetwork, handle: string, limits: AnalysisLimits, cptsFor: readonly string[] = []): string {
  const cost = networkCost(network);
  const lines: string[] = [];
  const edges = network.cpts.reduce((n, c) => n + c.parents.length, 0);
  lines.push(`Network "${network.name}" [${handle}]: ${network.variables.length} variables, ${edges} edges, treewidth ~${cost.treewidth}, exact inference ${cost.maxCliqueEntries <= limits.maxCliqueEntries ? 'feasible' : `too expensive (use method:"sampling")`}.`);
  const cap = 120;
  for (const v of network.variables.slice(0, cap)) {
    const parents = network.getParents(v).map(p => p.name);
    lines.push(`  ${v.name} [${list(v.outcomes, 10)}]${parents.length ? ` <- ${parents.join(', ')}` : ''}`);
  }
  if (network.variables.length > cap) lines.push(`  … ${network.variables.length - cap} more variables`);
  for (const name of cptsFor) {
    const v = requireVariable(network, name);
    const cpt = network.cpts.find(c => c.variable === v);
    if (cpt) lines.push('', formatCpt(cpt));
  }
  return lines.join('\n');
}

function formatCpt(cpt: CPT): string {
  const card = cpt.variable.outcomes.length;
  const rows = cpt.table.length / card;
  const idx = new Array<number>(cpt.parents.length).fill(0);
  const out = [`CPT of ${cpt.variable.name} (${cpt.variable.outcomes.join(' / ')}):`];
  const maxRows = 40;
  for (let r = 0; r < rows && r < maxRows; r++) {
    const cond = cpt.parents.map((p, i) => `${p.name}=${p.outcomes[idx[i]]}`).join(', ');
    const probs = cpt.variable.outcomes.map((o, c) => `${o} ${+cpt.table[r * card + c].toPrecision(4)}`).join(', ');
    out.push(`  ${cond ? `[${cond}] ` : ''}${probs}`);
    for (let j = cpt.parents.length - 1; j >= 0; j--) {
      if (++idx[j] < cpt.parents[j].outcomes.length) break;
      idx[j] = 0;
    }
  }
  if (rows > maxRows) out.push(`  … ${rows - maxRows} more rows`);
  return out.join('\n');
}

/** Summary used by build_network / learn_from_csv: structure plus prior marginals. */
export function summarizeBuilt(network: BayesianNetwork, handle: string, limits: AnalysisLimits, kinds?: Map<string, string>): string {
  const lines = [`Network "${network.name}" [${handle}]: ${network.variables.length} variables.`];
  for (const v of network.variables.slice(0, 80)) {
    const parents = network.getParents(v).map(p => p.name);
    const kind = kinds?.get(v.name);
    lines.push(`  ${v.name} [${list(v.outcomes, 8)}]${parents.length ? ` <- ${parents.join(', ')}` : ''}${kind ? ` (${kind})` : ''}`);
  }
  if (network.variables.length > 80) lines.push(`  … ${network.variables.length - 80} more variables`);
  if (exactAffordable(network, limits)) {
    const priors = network.infer(undefined, undefined, { maxCliqueEntries: limits.maxCliqueEntries }).posteriors;
    lines.push('Prior marginals (sanity check these against your intent):');
    for (const v of network.variables.slice(0, 25)) lines.push(`  ${v.name}: ${formatDist(v, priors.get(v)!)}`);
    if (network.variables.length > 25) lines.push(`  … ${network.variables.length - 25} more (use query)`);
  } else {
    lines.push(`Exact inference is too expensive for this network (${costDescription(network, limits)}); use query with method:"sampling".`);
  }
  return lines.join('\n');
}
