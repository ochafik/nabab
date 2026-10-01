/**
 * Shared viewer state.
 *
 * One mutable store object (`S`) instead of scattered module-level `let`s, so
 * every viewer module reads and writes the same live state without cycles.
 */
import { CachedInferenceEngine } from '../lib/cached-inference.js';
import type { BayesianNetwork } from '../lib/network.js';
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
}

/** Replace the active network and derived caches. */
export function setNetwork(net: BayesianNetwork): void {
  S.network = net;
  S.cachedEngine = new CachedInferenceEngine(net);
  S.priorCache = null; // reset Jeffrey's rule prior cache
}
