/**
 * Persistence: serialize viewer state and write it to the URL hash
 * (standalone mode) or localStorage (MCP App mode).
 *
 * Restoring lives in loading.ts (it orchestrates network loading + layout).
 */
import type { ZoomTransform } from 'd3';
import { S, type SerializedState } from './state.js';

async function compress(data: string): Promise<string> {
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate'));
  const buf = await new Response(stream).arrayBuffer();
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

async function decompress(b64: string): Promise<string> {
  const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const stream = new Blob([bin]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Response(stream).text();
}

export { decompress };

export function buildSerializedState(): SerializedState {
  const state: SerializedState = {
    s: S.currentSource.type === 'builtin' ? { t: 'b', n: S.currentSource.name } : { t: 'c', x: S.currentSource.xmlbif },
  };
  if (S.hardEvidence.size > 0) {
    state.h = {};
    for (const [k, v] of S.hardEvidence) if (S.observationEnabled.has(k)) state.h[k] = v;
    if (Object.keys(state.h).length === 0) delete state.h;
  }
  if (S.softEvidence.size > 0) {
    state.e = {};
    for (const [k, v] of S.softEvidence) if (S.observationEnabled.has(k)) state.e[k] = Object.fromEntries(v);
    if (Object.keys(state.e).length === 0) delete state.e;
  }
  if (S.observationEnabled.size > 0) state.o = [...S.observationEnabled];
  if (S.interventions.size > 0) state.d = Object.fromEntries(S.interventions);
  if (S.nodePositions.size > 0) {
    state.p = {};
    for (const [k, v] of S.nodePositions) state.p[k] = { x: Math.round(v.x), y: Math.round(v.y) };
  }
  if (S.selectedNodes.size > 0) state.sel = [...S.selectedNodes];
  return state;
}

/** Restore evidence, interventions and selection from a serialized state (inverse of buildSerializedState). */
export function applySerializedEvidence(state: SerializedState): void {
  S.hardEvidence = new Map(Object.entries(state.h ?? {}));
  S.softEvidence = new Map(Object.entries(state.e ?? {}).map(([k, v]) => [k, new Map(Object.entries(v))]));
  S.observationEnabled = new Set(state.o ?? []);
  // Drop interventions that don't fit the loaded network (stale hash).
  S.interventions = new Map(Object.entries(state.d ?? {}).filter(([k, x]) =>
    !S.network || S.network.getVariable(k)?.outcomes.includes(x)));
  S.priorCache = null;
  S.rememberedHard = new Map(); S.rememberedSoft = new Map(); S.tweakedOutcomes = new Map();
  S.selectedNodes = new Set(state.sel ?? []);
}

let hashWriteTimeout: ReturnType<typeof setTimeout> | null = null;

/** Persist current state to the URL hash (debounced). Zoom is passed by the caller. */
export function saveStateToHash(zoom?: ZoomTransform | null): void {
  // Debounce to avoid hammering the hash on rapid slider drags
  if (hashWriteTimeout) clearTimeout(hashWriteTimeout);
  hashWriteTimeout = setTimeout(async () => {
    const state = buildSerializedState();
    if (zoom && (zoom.k !== 1 || zoom.x !== 0 || zoom.y !== 0)) {
      state.z = { x: Math.round(zoom.x), y: Math.round(zoom.y), k: +zoom.k.toFixed(3) };
    }
    try {
      const encoded = await compress(JSON.stringify(state));
      history.replaceState(null, '', '#' + encoded);
    } catch { /* ignore compression failures */ }
  }, 300);
}

let lsWriteTimeout: ReturnType<typeof setTimeout> | null = null;

export function saveStateToLocalStorage(): void {
  if (lsWriteTimeout) clearTimeout(lsWriteTimeout);
  lsWriteTimeout = setTimeout(() => {
    try {
      localStorage.setItem('nabab-state', JSON.stringify(buildSerializedState()));
    } catch { /* quota exceeded or unavailable */ }
  }, 300);
}
