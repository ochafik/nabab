/**
 * Shared viewer state.
 *
 * One mutable store object (`S`) instead of scattered module-level `let`s, so
 * every viewer module reads and writes the same live state without cycles.
 */
import { CachedInferenceEngine } from '../lib/cached-inference.js';
import type { BayesianNetwork } from '../lib/network.js';
import { mutilateNetwork } from '../lib/causal-inference.js';
import type { Variable, Evidence, LikelihoodEvidence, Distribution } from '../lib/types.js';
import type { AnalyticSensitivityResult } from '../lib/analytic-sensitivity.js';
import type { VOIResult } from '../lib/voi.js';

// Compile-time flag: set to true by vite.config.mcp.ts, false otherwise.
declare const __MCP_APP__: boolean;
export const IS_MCP = typeof __MCP_APP__ !== 'undefined' && __MCP_APP__;

export type NetworkSource = { type: 'builtin'; name: string } | { type: 'custom'; xmlbif: string };

/** Compact serialized form persisted to the URL hash (standalone) or localStorage (MCP App). */
export interface SerializedState {
  s: { t: 'b'; n: string } | { t: 'c'; x: string }; // source
  h?: Record<string, string>;                          // hard evidence
  e?: Record<string, Record<string, number>>;          // soft evidence
  o?: string[];                                        // enabled observations
  d?: Record<string, string>;                          // interventions do(X=x)
  z?: { x: number; y: number; k: number };             // zoom transform (translateX, translateY, scale)
  p?: Record<string, { x: number; y: number }>;        // node positions (if manually moved)
  sel?: string[];                                       // selected nodes
}

export const S = {
  network: null as BayesianNetwork | null,
  cachedEngine: null as CachedInferenceEngine | null,
  hardEvidence: new Map() as Evidence,
  softEvidence: new Map() as LikelihoodEvidence,
  observationEnabled: new Set<string>(),
  rememberedHard: new Map<string, string>(),
  rememberedSoft: new Map<string, Map<string, number>>(),
  /** Which outcomes have been explicitly tweaked by the user (bold labels). */
  tweakedOutcomes: new Map<string, Set<string>>(),
  nodePositions: new Map<string, { x: number; y: number }>(),
  selectedNodes: new Set<string>(),

  /** do(X=x) interventions: variable name -> forced outcome. */
  interventions: new Map<string, string>(),
  /** Hover what-if preview enabled (toolbar toggle). */
  previewEnabled: true,
  /** Posteriors of the last render, by variable name (baseline for preview deltas). */
  lastPosteriors: new Map<string, Distribution>() as Map<string, Distribution>,
  /** Set when exact inference is infeasible for the current network (structure-only view). */
  inferenceError: null as string | null,
  /** Wall time of the last full inference in render(), ms. */
  lastInferMs: 0,
  /** Probability of the evidence from the last render (undefined without evidence). */
  lastProbabilityOfEvidence: undefined as number | undefined,

  // Sensitivity analysis state
  sensitivityMode: false,
  sensitivityQuery: null as string | null, // query variable name
  sensitivityInfluence: null as Map<string, number> | null, // variable → max |derivative|
  sensitivityResults: null as AnalyticSensitivityResult[] | null,
  voiResults: null as VOIResult[] | null,

  // Track current source for hash serialization
  currentSource: { type: 'builtin', name: 'dogproblem.xmlbif' } as NetworkSource,

  /** Jeffrey's rule prior cache — reset whenever the network changes. */
  priorCache: null as Map<Variable, Distribution> | null,
};

/** Reset all evidence-related state (called when a network is loaded). */
export function resetEvidenceState(): void {
  S.hardEvidence = new Map();
  S.softEvidence = new Map();
  S.observationEnabled = new Set();
  S.rememberedHard = new Map();
  S.rememberedSoft = new Map();
  S.tweakedOutcomes = new Map();
  S.interventions = new Map();
  S.priorCache = null;
}

/** Replace the active network and derived caches. */
export function setNetwork(net: BayesianNetwork): void {
  S.network = net;
  S.cachedEngine = new CachedInferenceEngine(net);
  S.priorCache = null; // reset Jeffrey's rule prior cache
  S.interventions = new Map();
  _active = null;
}

// ─── Active (possibly mutilated) network ─────────────────────────────

let _active: { key: string; net: BayesianNetwork; engine: CachedInferenceEngine } | null = null;

/** Canonical key of the current interventions ('' when none). */
export function interventionKey(m: ReadonlyMap<string, string> = S.interventions): string {
  return [...m].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join(',');
}

/**
 * The network inference should run on: the loaded one, or its mutilated
 * version under the current do() interventions (graph surgery). Engines are
 * cached per intervention set; the Jeffrey prior cache follows the active
 * network.
 */
export function getActive(): { key: string; net: BayesianNetwork; engine: CachedInferenceEngine } | null {
  if (!S.network || !S.cachedEngine) return null;
  const key = interventionKey();
  if (key === '') return { key, net: S.network, engine: S.cachedEngine };
  if (_active && _active.key === key) return _active;
  const net = mutilateNetwork(S.network, [...S.interventions].map(([variable, value]) => ({ variable, value })));
  _active = { key, net, engine: new CachedInferenceEngine(net) };
  S.priorCache = null;
  return _active;
}

/** Set / clear an intervention and invalidate derived caches. */
export function setIntervention(name: string, outcome: string | null): void {
  if (outcome === null) S.interventions.delete(name);
  else S.interventions.set(name, outcome);
  S.priorCache = null;
}
