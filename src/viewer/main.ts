import * as d3 from 'd3';
import dagre from '@dagrejs/dagre';
import { BayesianNetwork } from '../lib/network.js';
import { CachedInferenceEngine } from '../lib/cached-inference.js';
import type { Variable, CPT, Evidence, LikelihoodEvidence, Distribution } from '../lib/types.js';
import { parseCSV, learnStructure } from '../lib/structure-learning.js';
import { toXmlBif } from '../lib/xmlbif-writer.js';
import { toJSON } from '../lib/json-export.js';
import { analyticSensitivity, variableInfluenceMap, topInfluentialAnalytic, type AnalyticSensitivityResult } from '../lib/analytic-sensitivity.js';
import { valueOfInformation, multiQueryVOI, type VOIResult } from '../lib/voi.js';

// Compile-time flag: set to true by vite.config.mcp.ts, false otherwise.
declare const __MCP_APP__: boolean;
const IS_MCP = typeof __MCP_APP__ !== 'undefined' && __MCP_APP__;
const ARR_LEN = 7; // rendered arrowhead length in px

let network: BayesianNetwork | null = null;
let cachedEngine: CachedInferenceEngine | null = null;
let hardEvidence: Evidence = new Map();
let softEvidence: LikelihoodEvidence = new Map();
let observationEnabled = new Set<string>();
let rememberedHard = new Map<string, string>();
let rememberedSoft = new Map<string, Map<string, number>>();
/** Which outcomes have been explicitly tweaked by the user (bold labels). */
let tweakedOutcomes = new Map<string, Set<string>>();
let nodePositions = new Map<string, { x: number; y: number }>();
let selectedNodes = new Set<string>();

// ─── Sensitivity analysis state ─────────────────────────────────────
let sensitivityMode = false;
let sensitivityQuery: string | null = null; // query variable name
let sensitivityInfluence: Map<string, number> | null = null; // variable → max |derivative|
let sensitivityResults: AnalyticSensitivityResult[] | null = null;
let voiResults: VOIResult[] | null = null;

// Track current source for hash serialization
let currentSource: { type: 'builtin'; name: string } | { type: 'custom'; xmlbif: string } =
  { type: 'builtin', name: 'dogproblem.xmlbif' };

// ─── Hash state persistence ─────────────────────────────────────────

interface SerializedState {
  s: { t: 'b'; n: string } | { t: 'c'; x: string }; // source
  h?: Record<string, string>;                          // hard evidence
  e?: Record<string, Record<string, number>>;          // soft evidence
  o?: string[];                                        // enabled observations
  z?: { x: number; y: number; k: number };             // zoom transform (translateX, translateY, scale)
  p?: Record<string, { x: number; y: number }>;        // node positions (if manually moved)
  sel?: string[];                                       // selected nodes
}

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

let hashWriteTimeout: ReturnType<typeof setTimeout> | null = null;

function saveStateToHash() {
  // Debounce to avoid hammering the hash on rapid slider drags
  if (hashWriteTimeout) clearTimeout(hashWriteTimeout);
  hashWriteTimeout = setTimeout(async () => {
    const state: SerializedState = {
      s: currentSource.type === 'builtin' ? { t: 'b', n: currentSource.name } : { t: 'c', x: currentSource.xmlbif },
    };
    if (hardEvidence.size > 0) {
      state.h = {};
      for (const [k, v] of hardEvidence) if (observationEnabled.has(k)) state.h[k] = v;
      if (Object.keys(state.h).length === 0) delete state.h;
    }
    if (softEvidence.size > 0) {
      state.e = {};
      for (const [k, v] of softEvidence) if (observationEnabled.has(k)) state.e[k] = Object.fromEntries(v);
      if (Object.keys(state.e).length === 0) delete state.e;
    }
    if (observationEnabled.size > 0) state.o = [...observationEnabled];
    // Zoom transform
    if (_svg) {
      const t = d3.zoomTransform(_svg.node()!);
      if (t.k !== 1 || t.x !== 0 || t.y !== 0) state.z = { x: Math.round(t.x), y: Math.round(t.y), k: +t.k.toFixed(3) };
    }
    // Node positions (only if any were manually moved)
    if (nodePositions.size > 0) {
      state.p = {};
      for (const [k, v] of nodePositions) state.p[k] = { x: Math.round(v.x), y: Math.round(v.y) };
    }
    if (selectedNodes.size > 0) state.sel = [...selectedNodes];
    try {
      const encoded = await compress(JSON.stringify(state));
      history.replaceState(null, '', '#' + encoded);
    } catch { /* ignore compression failures */ }
  }, 300);
}

async function loadStateFromHash(): Promise<boolean> {
  const hash = location.hash.slice(1);
  if (!hash) return false;
  try {
    const json = await decompress(hash);
    const state: SerializedState = JSON.parse(json);

    // Load network
    if (state.s.t === 'b') {
      currentSource = { type: 'builtin', name: state.s.n };
      const select = document.getElementById('example-select') as HTMLSelectElement;
      select.value = state.s.n;
      const resp = await fetch(exampleUrl(state.s.n));
      if (!resp.ok) return false;
      network = BayesianNetwork.parse(await resp.text());
    } else {
      currentSource = { type: 'custom', xmlbif: state.s.x };
      network = BayesianNetwork.parse(state.s.x);
    }
    cachedEngine = new CachedInferenceEngine(network);
  _priorCache = null; // reset Jeffrey's rule prior cache

    // Restore evidence
    hardEvidence = new Map(Object.entries(state.h ?? {}));
    softEvidence = new Map(Object.entries(state.e ?? {}).map(([k, v]) => [k, new Map(Object.entries(v))]));
    observationEnabled = new Set(state.o ?? []);
    rememberedHard = new Map(); rememberedSoft = new Map(); tweakedOutcomes = new Map();
    selectedNodes = new Set(state.sel ?? []);

    // Restore node positions (or auto-layout if none saved)
    if (state.p) {
      nodePositions = new Map(Object.entries(state.p));
    } else {
      nodePositions = new Map();
    }

    document.getElementById('network-name')!.textContent = network.name;
    if (nodePositions.size === 0) autoLayout();
    else render();

    // Restore zoom transform after render creates the SVG
    if (state.z && _svg && _zoomBehavior) {
      const t = d3.zoomIdentity.translate(state.z.x, state.z.y).scale(state.z.k);
      _svg.call(_zoomBehavior.transform, t);
    }

    return true;
  } catch {
    return false;
  }
}

// ─── localStorage state persistence (MCP App mode) ──────────────────

let lsWriteTimeout: ReturnType<typeof setTimeout> | null = null;

function buildSerializedState(): SerializedState {
  const state: SerializedState = {
    s: currentSource.type === 'builtin' ? { t: 'b', n: currentSource.name } : { t: 'c', x: currentSource.xmlbif },
  };
  if (hardEvidence.size > 0) {
    state.h = {};
    for (const [k, v] of hardEvidence) if (observationEnabled.has(k)) state.h[k] = v;
    if (Object.keys(state.h).length === 0) delete state.h;
  }
  if (softEvidence.size > 0) {
    state.e = {};
    for (const [k, v] of softEvidence) if (observationEnabled.has(k)) state.e[k] = Object.fromEntries(v);
    if (Object.keys(state.e).length === 0) delete state.e;
  }
  if (observationEnabled.size > 0) state.o = [...observationEnabled];
  if (nodePositions.size > 0) {
    state.p = {};
    for (const [k, v] of nodePositions) state.p[k] = { x: Math.round(v.x), y: Math.round(v.y) };
  }
  if (selectedNodes.size > 0) state.sel = [...selectedNodes];
  return state;
}

function saveStateToLocalStorage() {
  if (lsWriteTimeout) clearTimeout(lsWriteTimeout);
  lsWriteTimeout = setTimeout(() => {
    try {
      localStorage.setItem('nabab-state', JSON.stringify(buildSerializedState()));
    } catch { /* quota exceeded or unavailable */ }
  }, 300);
}

function restoreSerializedState(state: SerializedState): boolean {
  try {
    if (state.s.t === 'b') {
      currentSource = { type: 'builtin', name: state.s.n };
      // In MCP mode we can't fetch example files — need the XMLBIF inline
      if (!state.s.n.includes('<')) return false;
    } else {
      currentSource = { type: 'custom', xmlbif: state.s.x };
    }
    const content = state.s.t === 'c' ? state.s.x : null;
    if (!content) return false;
    network = BayesianNetwork.parse(content);
    cachedEngine = new CachedInferenceEngine(network);
    _priorCache = null;
    hardEvidence = new Map(Object.entries(state.h ?? {}));
    softEvidence = new Map(Object.entries(state.e ?? {}).map(([k, v]) => [k, new Map(Object.entries(v))]));
    observationEnabled = new Set(state.o ?? []);
    rememberedHard = new Map(); rememberedSoft = new Map(); tweakedOutcomes = new Map();
    selectedNodes = new Set(state.sel ?? []);
    nodePositions = state.p ? new Map(Object.entries(state.p)) : new Map();
    document.getElementById('network-name')!.textContent = network.name;
    if (nodePositions.size === 0) autoLayout(); else render();
    return true;
  } catch {
    return false;
  }
}

function loadStateFromLocalStorage(): boolean {
  try {
    const saved = localStorage.getItem('nabab-state');
    if (!saved) return false;
    return restoreSerializedState(JSON.parse(saved));
  } catch {
    return false;
  }
}

// ─── Loading ─────────────────────────────────────────────────────────

function exampleUrl(filename: string): string {
  if (filename.startsWith('bench/')) {
    // BIF benchmark models live in /bench/models/, CSV samples in /bench/samples/
    const rest = filename.slice('bench/'.length);
    if (rest.endsWith('.csv')) return `/bench/samples/${rest}`;
    return `/bench/models/${rest}`;
  }
  return new URL(`../examples/${filename}`, import.meta.url).href;
}

async function loadExampleFile(filename: string) {
  const resp = await fetch(exampleUrl(filename));
  if (!resp.ok) throw new Error(`Failed to load ${filename}: ${resp.status}`);
  const content = await resp.text();
  if (filename.endsWith('.csv')) {
    // Structure learning from CSV
    const statusEl = document.getElementById('network-name')!;
    statusEl.textContent = 'Learning structure\u2026';
    await new Promise(r => setTimeout(r, 0)); // let the UI update
    const data = parseCSV(content);
    const parsed = learnStructure(data);
    const bn = new BayesianNetwork(parsed);
    network = bn;
    cachedEngine = new CachedInferenceEngine(network);
    _priorCache = null;
    hardEvidence = new Map(); softEvidence = new Map();
    observationEnabled = new Set();
    rememberedHard = new Map(); rememberedSoft = new Map();
    nodePositions = new Map();
    currentSource = { type: 'builtin', name: filename };
    statusEl.textContent = network.name;
    autoLayout();
  } else {
    currentSource = { type: 'builtin', name: filename };
    loadNetwork(content, false);
  }
}

async function loadExample() {
  const select = document.getElementById('example-select') as HTMLSelectElement;
  await loadExampleFile(select.value);
}

function loadNetwork(content: string, isCustom = true) {
  network = BayesianNetwork.parse(content);
  cachedEngine = new CachedInferenceEngine(network);
  _priorCache = null; // reset Jeffrey's rule prior cache
  hardEvidence = new Map(); softEvidence = new Map();
  observationEnabled = new Set();
  rememberedHard = new Map(); rememberedSoft = new Map();
  nodePositions = new Map();
  if (isCustom) currentSource = { type: 'custom', xmlbif: content };
  document.getElementById('network-name')!.textContent = network.name;
  autoLayout();
}

/** Serialize a ParsedNetwork to minimal XMLBIF for hash persistence. */
function parsedNetworkToXmlBif(p: { name: string; variables: readonly Variable[]; cpts: readonly CPT[] }): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let xml = `<?xml version="1.0"?>\n<BIF VERSION="0.3">\n<NETWORK>\n<NAME>${esc(p.name)}</NAME>\n`;
  for (const v of p.variables) {
    xml += `<VARIABLE TYPE="nature">\n  <NAME>${esc(v.name)}</NAME>\n`;
    for (const o of v.outcomes) xml += `  <OUTCOME>${esc(o)}</OUTCOME>\n`;
    xml += `</VARIABLE>\n`;
  }
  for (const cpt of p.cpts) {
    const forAttr = [cpt.variable.name, ...cpt.parents.map(p => p.name)].map(esc).join(' ');
    xml += `<DEFINITION>\n  <FOR>${forAttr}</FOR>\n`;
    xml += `  <TABLE>${Array.from(cpt.table).join(' ')}</TABLE>\n</DEFINITION>\n`;
  }
  xml += `</NETWORK>\n</BIF>`;
  return xml;
}

// ─── Selection ───────────────────────────────────────────────────────

function selectNode(name: string, additive: boolean) {
  // In sensitivity mode, single-click sets the query target
  if (sensitivityMode && !additive) {
    sensitivityQuery = name;
    selectedNodes.clear();
    selectedNodes.add(name);
    render();
    return;
  }
  if (additive) {
    if (selectedNodes.has(name)) selectedNodes.delete(name);
    else selectedNodes.add(name);
  } else {
    if (selectedNodes.has(name) && selectedNodes.size === 1) selectedNodes.clear();
    else { selectedNodes.clear(); selectedNodes.add(name); }
  }
  render();
}

function clearSelection() {
  if (selectedNodes.size > 0) { selectedNodes.clear(); render(); }
}

// Space: cycle eyes on selected nodes
document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || selectedNodes.size === 0) return;
  if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return;
  e.preventDefault();
  const names = [...selectedNodes];
  const allOn = names.every(n => observationEnabled.has(n));
  const allOff = names.every(n => !observationEnabled.has(n));
  for (const name of names) {
    const v = network?.getVariable(name);
    if (!v) continue;
    if (allOff) {
      // All off → turn all on
      observationEnabled.add(name);
      if (!hardEvidence.has(name) && !softEvidence.has(name)) {
        if (rememberedHard.has(name)) hardEvidence.set(name, rememberedHard.get(name)!);
        else if (rememberedSoft.has(name)) softEvidence.set(name, rememberedSoft.get(name)!);
        else hardEvidence.set(name, v.outcomes[0]);
      }
    } else {
      // Some or all on → turn all off (remember state)
      if (hardEvidence.has(name)) rememberedHard.set(name, hardEvidence.get(name)!);
      if (softEvidence.has(name)) rememberedSoft.set(name, softEvidence.get(name)!);
      observationEnabled.delete(name);
    }
  }
  render();
});

// ─── Event listeners ─────────────────────────────────────────────────

if (!IS_MCP) {
  document.getElementById('btn-load-example')!.addEventListener('click', loadExample);
  document.getElementById('example-select')!.addEventListener('change', loadExample);
  document.getElementById('btn-layout')!.addEventListener('click', autoLayout);
  document.getElementById('btn-fit')!.addEventListener('click', fitView);

  // Export
  const exportMenu = document.getElementById('export-menu')!;
  document.getElementById('btn-export')!.addEventListener('click', () => exportMenu.classList.toggle('visible'));
  document.addEventListener('click', (e) => {
    if (!(e.target as HTMLElement).closest('.export-wrapper')) exportMenu.classList.remove('visible');
  });

  function downloadFile(filename: string, content: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  document.getElementById('btn-export-xmlbif')!.addEventListener('click', () => {
    if (!network) return;
    downloadFile(`${network.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.xmlbif`, toXmlBif(network), 'application/xml');
    exportMenu.classList.remove('visible');
  });
  document.getElementById('btn-export-json')!.addEventListener('click', () => {
    if (!network) return;
    downloadFile(`${network.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`, JSON.stringify(toJSON(network), null, 2), 'application/json');
    exportMenu.classList.remove('visible');
  });

  // Paste XMLBIF
  document.body.addEventListener('paste', (e: ClipboardEvent) => {
    const t = e.clipboardData?.getData('text');
    if (t && (t.includes('<BIF') || t.trimStart().startsWith('network'))) { e.preventDefault(); loadNetwork(t); }
  });

  // Drag-and-drop
  const container = document.getElementById('graph-container')!;
  container.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer!.dropEffect = 'copy'; });
  container.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result !== 'string') return;
        const content = reader.result;
        const ext = file.name.toLowerCase();
        const isCSV = ext.endsWith('.csv') || ext.endsWith('.tsv')
          || (!content.trimStart().startsWith('<') && /[,\t;]/.test(content.split('\n')[0]));
        if (isCSV) {
          const statusEl = document.getElementById('network-name')!;
          statusEl.textContent = 'Learning structure\u2026';
          setTimeout(() => {
            try {
              const data = parseCSV(content);
              const parsed = learnStructure(data);
              const bn = new BayesianNetwork(parsed);
              network = bn;
              cachedEngine = new CachedInferenceEngine(network);
              _priorCache = null;
              hardEvidence = new Map(); softEvidence = new Map();
              observationEnabled = new Set();
              rememberedHard = new Map(); rememberedSoft = new Map();
              nodePositions = new Map();
              currentSource = { type: 'custom', xmlbif: parsedNetworkToXmlBif(parsed) };
              statusEl.textContent = network.name;
              autoLayout();
            } catch (err) {
              statusEl.textContent = 'Error: ' + (err instanceof Error ? err.message : String(err));
            }
          }, 0);
        } else {
          loadNetwork(content);
        }
      };
      reader.readAsText(file);
    }
  });
  window.addEventListener('message', (e) => {
    if (e.data?.type === 'nabab-set-evidence') {
      hardEvidence = new Map(Object.entries(e.data.evidence));
      for (const k of hardEvidence.keys()) observationEnabled.add(k);
      render();
    } else if (e.data?.type === 'nabab-load-network') loadNetwork(e.data.xmlbif);
  });
}

// Clear evidence button works in both modes
document.getElementById('btn-clear-evidence')?.addEventListener('click', () => {
  hardEvidence = new Map(); softEvidence = new Map();
  observationEnabled = new Set(); render();
});

// ─── Layout ──────────────────────────────────────────────────────────

function autoLayout() {
  if (!network) return;
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 50, ranksep: 70, marginx: 30, marginy: 30 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const v of network.variables) g.setNode(v.name, { width: nodeW(v), height: nodeH(v) });
  for (const cpt of network.cpts)
    for (const p of cpt.parents) g.setEdge(p.name, cpt.variable.name);
  dagre.layout(g);
  const c = document.getElementById('graph-container')!;
  const gw = (g.graph() as any).width ?? c.clientWidth;
  const gh = (g.graph() as any).height ?? c.clientHeight;
  const ox = Math.max(0, (c.clientWidth - gw) / 2);
  const oy = Math.max(0, (c.clientHeight - gh) / 2);
  for (const v of network.variables) {
    const n = g.node(v.name);
    nodePositions.set(v.name, { x: n.x + ox, y: n.y + oy });
  }
  render();
}

// ─── Evidence ────────────────────────────────────────────────────────

/**
 * Convert user-set target marginals to likelihood evidence via Jeffrey's rule.
 * User sets "I want P(X=ok)=0.19" but the engine needs likelihood weights.
 * Jeffrey's rule: likelihood(x) = target(x) / prior(x).
 * We compute priors once (no evidence), then divide.
 */
let _priorCache: Map<Variable, Distribution> | null = null;

function effectiveEvidence(): [Evidence | undefined, LikelihoodEvidence | undefined] {
  if (!network) return [undefined, undefined];
  const he = new Map<string, string>();
  const se = new Map<string, Map<string, number>>();

  for (const [k, v] of hardEvidence) if (observationEnabled.has(k)) he.set(k, v);

  // For soft evidence, apply Jeffrey's rule: L(x) = target(x) / prior(x)
  if (softEvidence.size > 0) {
    // Compute priors once (cached until network changes)
    if (!_priorCache) {
      const priorResult = network.infer();
      _priorCache = priorResult.posteriors;
    }
    for (const [k, targetWeights] of softEvidence) {
      if (!observationEnabled.has(k)) continue;
      const variable = network.getVariable(k);
      if (!variable) continue;
      const prior = _priorCache.get(variable);
      if (!prior) { se.set(k, targetWeights); continue; }

      // Jeffrey's rule: likelihood = target / prior
      const likelihood = new Map<string, number>();
      for (const [outcome, targetP] of targetWeights) {
        const priorP = prior.get(outcome) ?? 0;
        likelihood.set(outcome, priorP > 1e-10 ? targetP / priorP : targetP > 0 ? 1e6 : 0);
      }
      se.set(k, likelihood);
    }
  }

  return [he.size ? he : undefined, se.size ? se : undefined];
}

function toggleEye(v: Variable) {
  if (observationEnabled.has(v.name)) {
    observationEnabled.delete(v.name);
    tweakedOutcomes.delete(v.name);
    if (hardEvidence.has(v.name)) rememberedHard.set(v.name, hardEvidence.get(v.name)!);
    if (softEvidence.has(v.name)) rememberedSoft.set(v.name, softEvidence.get(v.name)!);
  } else {
    observationEnabled.add(v.name);
    if (!hardEvidence.has(v.name) && !softEvidence.has(v.name)) {
      if (rememberedHard.has(v.name)) hardEvidence.set(v.name, rememberedHard.get(v.name)!);
      else if (rememberedSoft.has(v.name)) softEvidence.set(v.name, rememberedSoft.get(v.name)!);
      else hardEvidence.set(v.name, v.outcomes[0]);
    }
  }
  render();
}

function eyeTooltip(v: Variable): string {
  const on = observationEnabled.has(v.name);
  if (on && hardEvidence.has(v.name)) return `Observing ${v.name} = ${hardEvidence.get(v.name)}. Click to disable.`;
  if (on && softEvidence.has(v.name)) return `Soft evidence on ${v.name}. Click to disable.`;
  if (on) return 'Observation active. Click to disable.';
  if (rememberedHard.has(v.name)) return `Click to restore: ${v.name} = ${rememberedHard.get(v.name)}`;
  if (rememberedSoft.has(v.name)) return `Click to restore soft evidence`;
  return `Click to observe ${v.name}`;
}

function cycleObservation(v: Variable) {
  const cur = hardEvidence.get(v.name);
  if (!observationEnabled.has(v.name)) {
    observationEnabled.add(v.name);
    hardEvidence.set(v.name, v.outcomes[0]);
    softEvidence.delete(v.name);
    tweakedOutcomes.set(v.name, new Set([v.outcomes[0]]));
  } else if (cur) {
    const idx = v.outcomes.indexOf(cur);
    if (idx < v.outcomes.length - 1) {
      hardEvidence.set(v.name, v.outcomes[idx + 1]);
      tweakedOutcomes.set(v.name, new Set([v.outcomes[idx + 1]]));
    } else {
      hardEvidence.delete(v.name); softEvidence.delete(v.name);
      observationEnabled.delete(v.name); tweakedOutcomes.delete(v.name);
    }
  } else {
    hardEvidence.set(v.name, v.outcomes[0]); softEvidence.delete(v.name);
    tweakedOutcomes.set(v.name, new Set([v.outcomes[0]]));
  }
  render();
}

function setSlider(v: Variable, trueRatio: number) {
  hardEvidence.delete(v.name); observationEnabled.add(v.name);
  const t = Math.max(0, Math.min(1, trueRatio));
  if (t > 0.995) { hardEvidence.set(v.name, v.outcomes[0]); softEvidence.delete(v.name); }
  else if (t < 0.005) { hardEvidence.set(v.name, v.outcomes[1]); softEvidence.delete(v.name); }
  else softEvidence.set(v.name, new Map([[v.outcomes[0], t], [v.outcomes[1], 1 - t]]));
  render();
}

function cycleOutcome(v: Variable, i: number) {
  const o = v.outcomes[i];
  if (!observationEnabled.has(v.name)) {
    // Not observed → set this outcome to 100%, only it is tweaked
    hardEvidence.set(v.name, o); softEvidence.delete(v.name); observationEnabled.add(v.name);
    tweakedOutcomes.set(v.name, new Set([o]));
    render(); return;
  }
  // If this outcome is tweaked → un-tweak it
  const tweaked = tweakedOutcomes.get(v.name);
  if (tweaked?.has(o)) {
    clearOutcomeTweak(v, i);
    return;
  }
  // Not tweaked → set to 100%, mark only this one tweaked
  hardEvidence.set(v.name, o); softEvidence.delete(v.name);
  tweakedOutcomes.set(v.name, new Set([o]));
  render();
}

/** Get current weights for a multi-class variable (evidence or posterior). */
function getWeights(v: Variable, posteriors?: Map<Variable, Distribution>): Map<string, number> {
  if (hardEvidence.has(v.name)) {
    const h = hardEvidence.get(v.name)!;
    return new Map(v.outcomes.map(o => [o, o === h ? 1 : 0]));
  }
  if (softEvidence.has(v.name)) return new Map(softEvidence.get(v.name)!);
  // Fall back to posteriors or uniform
  if (posteriors) {
    const dist = posteriors.get(v);
    if (dist) return new Map(dist);
  }
  return new Map(v.outcomes.map(o => [o, 1 / v.outcomes.length]));
}

/** Set a single outcome's weight, rescale floating (non-tweaked) outcomes. */
function setMultiWeight(v: Variable, outcomeIdx: number, value: number) {
  const o = v.outcomes[outcomeIdx];
  hardEvidence.delete(v.name);
  observationEnabled.add(v.name);

  // Init weights from current state if needed
  const w = softEvidence.has(v.name) ? new Map(softEvidence.get(v.name)!) : getWeights(v);
  if (!tweakedOutcomes.has(v.name)) tweakedOutcomes.set(v.name, new Set());
  const tweaked = tweakedOutcomes.get(v.name)!;
  tweaked.add(o);

  // Set this outcome
  w.set(o, value);

  // Remaining budget for floating outcomes
  let tweakedSum = 0;
  for (const t of tweaked) tweakedSum += w.get(t) ?? 0;
  const remaining = Math.max(0, 1 - tweakedSum);

  // Distribute remaining among floating (non-tweaked) outcomes
  const floating = v.outcomes.filter(x => !tweaked.has(x));
  if (floating.length > 0) {
    const floatSum = floating.reduce((s, x) => s + (w.get(x) ?? 0), 0);
    for (const f of floating) {
      w.set(f, floatSum > 0 ? (w.get(f) ?? 0) / floatSum * remaining : remaining / floating.length);
    }
  } else if (tweakedSum !== 1) {
    // All tweaked but don't sum to 1 — scale all proportionally
    for (const t of tweaked) w.set(t, (w.get(t) ?? 0) / tweakedSum);
  }

  // Snap to hard evidence if one is ~100%
  for (const x of v.outcomes) {
    if ((w.get(x) ?? 0) > 0.995) {
      hardEvidence.set(v.name, x); softEvidence.delete(v.name);
      tweakedOutcomes.set(v.name, new Set(v.outcomes));
      render(); return;
    }
  }

  softEvidence.set(v.name, w);
  render();
}

/** Clear a single outcome's tweak (make it floating). */
function clearOutcomeTweak(v: Variable, outcomeIdx: number) {
  const tweaked = tweakedOutcomes.get(v.name);
  if (!tweaked) return;
  tweaked.delete(v.outcomes[outcomeIdx]);

  if (tweaked.size === 0) {
    // No tweaks left → clear observation entirely
    hardEvidence.delete(v.name); softEvidence.delete(v.name);
    observationEnabled.delete(v.name); tweakedOutcomes.delete(v.name);
  } else {
    // Redistribute: un-tweaked outcome becomes floating
    const w = softEvidence.has(v.name) ? new Map(softEvidence.get(v.name)!) : getWeights(v);
    let tweakedSum = 0;
    for (const t of tweaked) tweakedSum += w.get(t) ?? 0;
    const remaining = Math.max(0, 1 - tweakedSum);
    const floating = v.outcomes.filter(x => !tweaked.has(x));
    const floatSum = floating.reduce((s, x) => s + (w.get(x) ?? 0), 0);
    for (const f of floating) {
      w.set(f, floatSum > 0 ? (w.get(f) ?? 0) / floatSum * remaining : remaining / floating.length);
    }
    softEvidence.set(v.name, w);
  }
  render();
}

// ─── CPT Panel ──────────────────────────────────────────────────────

/** Build CPT HTML for a single variable. */
function buildCptHtml(varName: string): string {
  if (!network) return '';
  const cpt = network.cpts.find(c => c.variable.name === varName);
  if (!cpt) return '';

  const v = cpt.variable;
  const parents = cpt.parents;
  const outcomes = v.outcomes;
  const parentNames = parents.map(p => p.name).join(', ');
  const title = parents.length > 0 ? `P(${v.name} | ${parentNames})` : `P(${v.name})`;

  let html = `<div class="cpt-title">${escapeHtml(title)}</div><table class="cpt-table">`;

  if (parents.length === 0) {
    html += '<thead><tr>';
    for (const o of outcomes) html += `<th>${escapeHtml(o)}</th>`;
    html += '</tr></thead><tbody><tr>';
    for (let i = 0; i < outcomes.length; i++) html += `<td>${formatProb(cpt.table[i])}</td>`;
    html += '</tr></tbody>';
  } else {
    html += '<thead><tr>';
    for (const p of parents) html += `<th class="cpt-parent-col">${escapeHtml(p.name)}</th>`;
    html += `<th></th>`;
    for (const o of outcomes) html += `<th>${escapeHtml(o)}</th>`;
    html += '</tr></thead><tbody>';
    const parentSizes = parents.map(p => p.outcomes.length);
    const numCombinations = parentSizes.reduce((a, b) => a * b, 1);
    const numOutcomes = outcomes.length;
    for (let row = 0; row < numCombinations; row++) {
      html += '<tr>';
      let remainder = row;
      for (let pi = parents.length - 1; pi >= 0; pi--) {
        const pSize = parentSizes[pi];
        html += `<td class="cpt-parent-col">${escapeHtml(parents[pi].outcomes[remainder % pSize])}</td>`;
        remainder = Math.floor(remainder / pSize);
      }
      html += `<td class="cpt-separator"></td>`;
      for (let oi = 0; oi < numOutcomes; oi++) html += `<td>${formatProb(cpt.table[row * numOutcomes + oi])}</td>`;
      html += '</tr>';
    }
    html += '</tbody>';
  }
  html += '</table>';
  return html;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatProb(p: number): string {
  if (p === 0) return '0';
  if (p === 1) return '1';
  // Show up to 4 decimal places, remove trailing zeros
  return p.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

// ─── Rendering ───────────────────────────────────────────────────────

function render() {
  if (!network || !cachedEngine) return;
  const [he, se] = effectiveEvidence();
  const result = cachedEngine.infer(he, se);

  // Sensitivity heat-map: only when mode is active and a query is selected
  if (sensitivityMode && sensitivityQuery && network.getVariable(sensitivityQuery)) {
    const qVar = network.getVariable(sensitivityQuery)!;
    const qOutcome = qVar.outcomes[0];
    try {
      sensitivityResults = analyticSensitivity(network, sensitivityQuery, qOutcome, he.size > 0 ? he : undefined);
      sensitivityInfluence = variableInfluenceMap(sensitivityResults);
    } catch {
      sensitivityResults = null;
      sensitivityInfluence = null;
    }
  } else {
    sensitivityInfluence = null;
    sensitivityResults = null;
  }

  // VOI: compute whenever any node is selected (no sensitivity mode needed)
  // Query targets = selected nodes (makes sense for both observed and unobserved:
  // "what else could I observe to learn more about these variables?")
  if (selectedNodes.size > 0 && cachedEngine) {
    try {
      voiResults = multiQueryVOI(network, [...selectedNodes], he ?? new Map(), cachedEngine);
    } catch (e) {
      console.warn('VOI computation failed:', e);
      voiResults = null;
    }
  } else {
    voiResults = null;
  }

  renderGraph(network, result.posteriors);
  renderInfoPanel();

  if (IS_MCP) {
    saveStateToLocalStorage();
  } else {
    saveStateToHash();
    if (window.parent !== window) {
      const d: Record<string, Record<string, number>> = {};
      for (const [v, dist] of result.posteriors) d[v.name] = Object.fromEntries(dist);
      window.parent.postMessage({ type: 'nabab-posteriors', d }, '*');
    }
  }
}

// Material Design icon paths (24x24 viewBox)
const ICON_VIS = 'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z';
const ICON_VIS_OFF = 'M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z';

const NODE_W_MIN = 140;
const NODE_PAD = 48; // eye icon (28) + margins (20)
const NODE_H_BOOL = 56;
const NODE_H_BOOL_LABELS = 68;
const NODE_H_MULTI_BASE = 30;
const NODE_H_PER_OUTCOME = 24;

const BOOL_PATTERNS = /^(true|false|yes|no|t|f|y|n)$/i;

function isBoolVar(v: Variable): boolean {
  return v.outcomes.length === 2 && BOOL_PATTERNS.test(v.outcomes[0]) && BOOL_PATTERNS.test(v.outcomes[1]);
}

function isSliderVar(v: Variable): boolean {
  return v.outcomes.length === 2;
}

// Measured text widths — populated at start of each render
let _measuredWidths = new Map<string, number>();

/** Measure actual SVG text widths for all variables. */
function measureTextWidths(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  net: BayesianNetwork,
  posteriors: Map<Variable, Distribution>,
) {
  _measuredWidths = new Map();
  const measureG = svg.append('g').attr('opacity', 0);

  for (const v of net.variables) {
    const dist = posteriors.get(v);
    // Measure header text
    let headerText = v.name;
    if (dist && isSliderVar(v)) {
      // Measure worst case: longest outcome name + "100%"
      const longest = v.outcomes[0].length > v.outcomes[1].length ? v.outcomes[0] : v.outcomes[1];
      headerText += `: 100% ${longest}`;
    } else if (dist) {
      const longest = v.outcomes.reduce((a, b) => a.length > b.length ? a : b);
      headerText += `: 100% ${longest}`;
    }
    const headerEl = measureG.append('text')
      .attr('font-size', '12px').attr('font-weight', '600').text(headerText);
    const headerW = (headerEl.node() as SVGTextElement).getBBox().width;

    // Measure outcome labels
    let labelsW = 0;
    if (isSliderVar(v) && !isBoolVar(v)) {
      for (const o of v.outcomes) {
        const el = measureG.append('text').attr('font-size', '9px').text(o);
        labelsW = Math.max(labelsW, (el.node() as SVGTextElement).getBBox().width);
      }
      labelsW = labelsW * 2 + 60; // both labels + slider gap
    } else if (!isSliderVar(v)) {
      for (const o of v.outcomes) {
        const el = measureG.append('text').attr('font-size', '10px').text(o);
        labelsW = Math.max(labelsW, (el.node() as SVGTextElement).getBBox().width);
      }
      labelsW += 100; // slider + percentage column
    }

    _measuredWidths.set(v.name, Math.max(NODE_W_MIN, headerW + NODE_PAD, labelsW + 16));
  }

  measureG.remove();
}

function nodeW(v: Variable): number {
  return _measuredWidths.get(v.name) ?? NODE_W_MIN;
}

function nodeH(v: Variable): number {
  if (isSliderVar(v)) return isBoolVar(v) ? NODE_H_BOOL : NODE_H_BOOL_LABELS;
  return NODE_H_MULTI_BASE + v.outcomes.length * NODE_H_PER_OUTCOME;
}

let _edgeGroup: d3.Selection<SVGGElement, unknown, null, undefined> | null = null;
let _zoomBehavior: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null;
let _svg: d3.Selection<SVGSVGElement, unknown, null, undefined> | null = null;
let _savedTransform: d3.ZoomTransform = d3.zoomIdentity;

function fitView() {
  if (!network || !_zoomBehavior || !_svg) return;
  const container = document.getElementById('graph-container')!;
  const W = container.clientWidth, H = container.clientHeight;
  if (nodePositions.size === 0) return;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const v of network.variables) {
    const p = nodePositions.get(v.name);
    if (!p) continue;
    const h = nodeH(v);
    const w = nodeW(v);
    minX = Math.min(minX, p.x - w / 2);
    maxX = Math.max(maxX, p.x + w / 2);
    minY = Math.min(minY, p.y - h / 2);
    maxY = Math.max(maxY, p.y + h / 2);
  }
  const pad = 30;
  const bw = maxX - minX + pad * 2, bh = maxY - minY + pad * 2;
  const scale = Math.min(W / bw, H / bh, 2);
  const tx = W / 2 - (minX + maxX) / 2 * scale;
  const ty = H / 2 - (minY + maxY) / 2 * scale;
  _svg.transition().duration(300).call(
    _zoomBehavior.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
}

function renderGraph(net: BayesianNetwork, posteriors: Map<Variable, Distribution>) {
  const container = document.getElementById('graph-container')!;
  // Preserve zoom transform across re-renders
  if (_svg) _savedTransform = d3.zoomTransform(_svg.node()!);
  container.innerHTML = '';
  const W = container.clientWidth, H = container.clientHeight;
  _svg = d3.select(container).append('svg').attr('width', W).attr('height', H)
    .style('user-select', 'none');
  const svg = _svg;
  const defs = svg.append('defs');
  // Measure text widths to size nodes correctly
  measureTextWidths(svg, net, posteriors);

  // Drop shadow for nodes
  const shadow = defs.append('filter').attr('id', 'node-shadow').attr('x', '-10%').attr('y', '-10%').attr('width', '130%').attr('height', '140%');
  shadow.append('feDropShadow').attr('dx', 0).attr('dy', 2).attr('stdDeviation', 4).attr('flood-opacity', 0.15);

  defs.append('marker').attr('id', 'arr')
    .attr('viewBox', '0 -4 8 8').attr('refX', 8).attr('refY', 0)
    .attr('markerWidth', ARR_LEN).attr('markerHeight', ARR_LEN).attr('orient', 'auto')
    .append('path').attr('d', 'M0,-3.5L8,0L0,3.5').attr('fill', 'var(--edge)');

  // Ensure fallback positions
  for (const v of net.variables)
    if (!nodePositions.has(v.name))
      nodePositions.set(v.name, v.position ? { x: v.position.x * 2 + 80, y: v.position.y * 2 + 40 } : { x: W / 2, y: H / 2 });

  // Zoomable/pannable content group
  const contentG = svg.append('g');
  _zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.1, 4])
    .on('zoom', (ev) => contentG.attr('transform', ev.transform));
  svg.call(_zoomBehavior);
  svg.on('click', (ev) => { if (ev.target === svg.node()) clearSelection(); });
  // Restore previous zoom transform
  if (_savedTransform !== d3.zoomIdentity) {
    svg.call(_zoomBehavior.transform, _savedTransform);
  }

  _edgeGroup = contentG.append('g');
  drawEdges(net);

  for (const v of net.variables) {
    const pos = nodePositions.get(v.name)!;
    const dist = posteriors.get(v);
    const w = nodeW(v);
    const h = nodeH(v);
    const isObs = observationEnabled.has(v.name);
    const isHard = isObs && hardEvidence.has(v.name);
    const isSoft = isObs && softEvidence.has(v.name);

    // Detect degenerate posteriors (all zeros or NaN = inconsistent evidence)
    const isDegenerate = dist ? [...dist.values()].every(p => p === 0 || isNaN(p)) : false;

    const ng = contentG.append('g').attr('transform', `translate(${pos.x},${pos.y})`);

    // Background
    // Pastel color per variable (HSL, evenly spaced hue)
    const varIdx = net.variables.indexOf(v);
    const hue = (varIdx / net.variables.length) * 360;
    const isDark = matchMedia('(prefers-color-scheme: dark)').matches;
    // Sensitivity heat-map: tint node by influence on the query variable
    const influenceVal = sensitivityInfluence?.get(v.name) ?? 0;
    const isQueryNode = sensitivityMode && sensitivityQuery === v.name;
    const maxInfluence = sensitivityInfluence ? Math.max(...sensitivityInfluence.values(), 0.01) : 1;
    const influenceNorm = Math.min(1, influenceVal / maxInfluence); // 0..1

    let bgFill: string;
    let borderCol: string;
    if (isQueryNode) {
      bgFill = isDark ? '#1a2a3a' : '#eff6ff';
      borderCol = 'var(--accent)';
    } else if (sensitivityMode && sensitivityInfluence) {
      // Heat-map: interpolate from neutral to warm orange/red by influence
      const sat = Math.round(20 + influenceNorm * 60);
      const lit = isDark ? Math.round(15 + (1 - influenceNorm) * 10) : Math.round(95 - influenceNorm * 15);
      bgFill = `hsl(${Math.round(30 - influenceNorm * 20)}, ${sat}%, ${lit}%)`;
      borderCol = influenceNorm > 0.3
        ? `hsl(${Math.round(20 - influenceNorm * 15)}, ${Math.round(50 + influenceNorm * 40)}%, ${isDark ? 55 : 45}%)`
        : 'var(--border-node)';
    } else if (isDegenerate) {
      bgFill = isDark ? '#2a1a1a' : '#fef2f2';
      borderCol = 'var(--accent-hard)';
    } else if (isObs) {
      bgFill = `hsl(${hue}, ${isHard ? 20 : 25}%, ${isDark ? 20 : 92}%)`;
      borderCol = isHard ? 'var(--accent-hard)' : isSoft ? 'var(--accent-soft)' : 'var(--border-node)';
    } else {
      bgFill = 'var(--bg-node)';
      borderCol = 'var(--border-node)';
    }
    // Accent for sliders: colored when observed, neutral when not
    const nodeAccent = isObs
      ? (isHard ? 'var(--accent-hard)' : isSoft ? 'var(--accent-soft)' : `hsl(${hue}, 55%, ${isDark ? 55 : 45}%)`)
      : 'var(--accent)';

    const isSel = selectedNodes.has(v.name);

    // Selection highlight (behind the node)
    if (isSel) {
      ng.append('rect').attr('x', -w / 2 - 3).attr('y', -h / 2 - 3)
        .attr('width', w + 6).attr('height', h + 6).attr('rx', 10)
        .attr('fill', 'none').attr('stroke', 'var(--accent)').attr('stroke-width', 2.5)
        .attr('stroke-dasharray', '4,2').attr('opacity', 0.8);
    }

    const bgRect = ng.append('rect').attr('x', -w / 2).attr('y', -h / 2)
      .attr('width', w).attr('height', h).attr('rx', 8)
      .attr('fill', bgFill).attr('stroke', borderCol).attr('stroke-width', 1.5)
      .attr('filter', 'url(#node-shadow)');
    if (isDegenerate) {
      bgRect.attr('stroke-dasharray', '4,3').attr('opacity', 0.7);
    }

    // Node drag (moves all selected if this node is selected)
    let dragMoved = false;
    ng.call(d3.drag<SVGGElement, unknown>()
      .filter((ev) => !(ev.target as SVGElement).classList.contains('slider-thumb') && !(ev.target as SVGElement).closest('.cz'))
      .on('start', () => { dragMoved = false; })
      .on('drag', (ev) => {
        if (!dragMoved) {
          // First drag event: commit selection so the right nodes move
          dragMoved = true;
          if (!isSel) { selectedNodes.clear(); selectedNodes.add(v.name); }
        }
        const toMove = selectedNodes.has(v.name) ? [...selectedNodes] : [v.name];
        for (const name of toMove) {
          const p = nodePositions.get(name);
          if (p) { p.x += ev.dx; p.y += ev.dy; nodePositions.set(name, { ...p }); }
        }
        contentG.selectAll<SVGGElement, unknown>('.node-g').each(function () {
          const gEl = d3.select(this);
          const name = gEl.attr('data-var');
          if (name && toMove.includes(name)) {
            const p = nodePositions.get(name)!;
            gEl.attr('transform', `translate(${p.x},${p.y})`);
          }
        });
        drawEdges(net);
      })
      .on('end', () => { if (dragMoved) render(); })
    ).attr('cursor', 'grab');

    ng.attr('class', 'node-g').attr('data-var', v.name);

    // Click: only fires for non-drag interactions
    ng.on('click', (ev) => {
      if (dragMoved) return;
      if ((ev.target as SVGElement).closest('.cz') || (ev.target as SVGElement).classList.contains('slider-thumb')) return;
      selectNode(v.name, ev.shiftKey);
    });

    // ── Row 1: eye icon + "label: XX%" ──
    const ry = -h / 2 + 14;
    // Compute display weights (same source as sliders: evidence when observed, posterior when not)
    const dw = isObs ? getWeights(v) : dist ? new Map(v.outcomes.map(o => [o, dist.get(o) ?? 0])) : null;
    let labelSuffix: string;
    if (isDegenerate && !isObs) {
      labelSuffix = ': inconsistent';
    } else if (isHard) {
      labelSuffix = ` = ${hardEvidence.get(v.name)}`;
    } else if (dw && isSliderVar(v)) {
      const p0 = dw.get(v.outcomes[0]) ?? 0;
      const pct0 = Math.round(p0 * 100);
      if (isBoolVar(v)) {
        const trueIdx = /^(true|yes|t|y)$/i.test(v.outcomes[0]) ? 0 : 1;
        const pctTrue = trueIdx === 0 ? pct0 : 100 - pct0;
        labelSuffix = (pctTrue === 100 || pctTrue === 0) && !isObs ? '' : `: ${pctTrue}%`;
      } else if (pct0 === 0) {
        labelSuffix = `: ${v.outcomes[1]}`;
      } else if (pct0 === 100) {
        labelSuffix = `: ${v.outcomes[0]}`;
      } else {
        labelSuffix = `: ${pct0}% ${v.outcomes[0]}`;
      }
    } else if (dw) {
      let maxOut = v.outcomes[0], maxP = 0;
      for (const o of v.outcomes) { const p = dw.get(o) ?? 0; if (p > maxP) { maxP = p; maxOut = o; } }
      const maxPct = Math.round(maxP * 100);
      labelSuffix = maxPct === 100 ? `: ${maxOut}` : `: ${maxPct}% ${maxOut}`;
    } else {
      labelSuffix = '';
    }

    // Eye icon (Material Design Visibility / VisibilityOff)
    const eyeG = ng.append('g').attr('class', 'cz').attr('cursor', 'pointer')
      .attr('transform', `translate(${-w / 2 + 18},${ry})`)
      .on('click', (ev) => { ev.stopPropagation(); toggleEye(v); });
    eyeG.append('rect').attr('x', -10).attr('y', -10).attr('width', 20).attr('height', 20).attr('fill', 'transparent');
    const eyeColor = isObs ? (isHard ? 'var(--accent-hard)' : isSoft ? 'var(--accent-soft)' : 'var(--accent)') : 'var(--text-dim)';
    eyeG.append('path').attr('d', isObs ? ICON_VIS : ICON_VIS_OFF)
      .attr('fill', eyeColor).attr('transform', 'translate(-8,-8) scale(0.67)');
    eyeG.append('title').text(eyeTooltip(v));

    // Name + percentage
    const nameG = ng.append('g').attr('class', 'cz').attr('cursor', 'pointer')
      .attr('transform', `translate(${-w / 2 + 32},${ry})`)
      .on('click', (ev) => { ev.stopPropagation(); cycleObservation(v); });
    nameG.append('rect').attr('x', -2).attr('y', -10).attr('width', w - 48).attr('height', 20).attr('fill', 'transparent');
    const nameColor = isObs ? (isHard ? 'var(--accent-hard)' : 'var(--accent-soft)') : 'var(--text)';
    nameG.append('text').attr('y', 4).attr('font-size', '12px').attr('font-weight', '600').attr('fill', nameColor)
      .text(v.name + labelSuffix);

    // ── Row 2: slider or bars ──
    if (dist) {
      if (isSliderVar(v)) boolSlider(ng, v, dist, w, h, nodeAccent);
      else multiNode(ng, v, dist, w, h, nodeAccent);
    }
  }
}

function drawEdges(net: BayesianNetwork) {
  if (!_edgeGroup) return;
  _edgeGroup.selectAll('*').remove();

  type Side = 'top' | 'bottom' | 'left' | 'right';

  function pickSide(ax: number, ay: number, aw: number, ah: number,
                    bx: number, by: number): Side {
    const dx = bx - ax, dy = by - ay;
    if (Math.abs(dy) * aw > Math.abs(dx) * ah) return dy > 0 ? 'bottom' : 'top';
    return dx > 0 ? 'right' : 'left';
  }

  function tangent(s: Side): [number, number] {
    return (s === 'top' || s === 'bottom') ? [1, 0] : [0, 1];
  }

  function slotXY(cx: number, cy: number, w: number, h: number,
                  side: Side, idx: number, count: number): [number, number] {
    const hw = w / 2, hh = h / 2, sp = 12;
    if (count <= 1) {
      if (side === 'top') return [cx, cy - hh];
      if (side === 'bottom') return [cx, cy + hh];
      if (side === 'left') return [cx - hw, cy];
      return [cx + hw, cy];
    }
    if (side === 'top' || side === 'bottom') {
      const span = Math.min(w - 20, (count - 1) * sp);
      return [cx - span / 2 + span * idx / (count - 1), cy + (side === 'bottom' ? hh : -hh)];
    }
    const span = Math.min(h - 10, (count - 1) * sp);
    return [cx + (side === 'right' ? hw : -hw), cy - span / 2 + span * idx / (count - 1)];
  }

  // Build edges with side info
  interface E { pn: string; cn: string; ps: Side; cs: Side; }
  const allEdges: E[] = [];
  for (const cpt of net.cpts) {
    for (const p of cpt.parents) {
      const fp = nodePositions.get(p.name)!, tp = nodePositions.get(cpt.variable.name)!;
      allEdges.push({
        pn: p.name, cn: cpt.variable.name,
        ps: pickSide(fp.x, fp.y, nodeW(p), nodeH(p), tp.x, tp.y),
        cs: pickSide(tp.x, tp.y, nodeW(cpt.variable), nodeH(cpt.variable), fp.x, fp.y),
      });
    }
  }

  // Group by (node, side) — all connections on the same side share slots
  const groups = new Map<string, number[]>();
  for (let i = 0; i < allEdges.length; i++) {
    const e = allEdges[i];
    const fk = e.pn + '|' + e.ps;
    const tk = e.cn + '|' + e.cs;
    if (!groups.has(fk)) groups.set(fk, []);
    groups.get(fk)!.push(i);
    if (!groups.has(tk)) groups.set(tk, []);
    // Avoid duplicate if same edge maps to same key (self-loop edge, unlikely)
    if (fk !== tk || !groups.get(tk)!.includes(i)) groups.get(tk)!.push(i);
  }

  // Sort each group by projection of other-endpoint onto tangent
  for (const [key, indices] of groups) {
    const [nodeName, side] = key.split('|') as [string, Side];
    const np = nodePositions.get(nodeName)!;
    const [tx, ty] = tangent(side);
    indices.sort((ai, bi) => {
      const a = allEdges[ai], b = allEdges[bi];
      const oa = nodePositions.get(a.pn === nodeName ? a.cn : a.pn)!;
      const ob = nodePositions.get(b.pn === nodeName ? b.cn : b.pn)!;
      return ((oa.x - np.x) * tx + (oa.y - np.y) * ty)
           - ((ob.x - np.x) * tx + (ob.y - np.y) * ty);
    });
  }

  // Build slot index lookup: edgeIdx → { fromSlot, fromCount, toSlot, toCount }
  const slots = allEdges.map((e, i) => {
    const fk = e.pn + '|' + e.ps;
    const tk = e.cn + '|' + e.cs;
    const fg = groups.get(fk)!;
    const tg = groups.get(tk)!;
    return {
      fi: fg.indexOf(i), fc: fg.length,
      ti: tg.indexOf(i), tc: tg.length,
    };
  });

  // Draw
  for (let i = 0; i < allEdges.length; i++) {
    const e = allEdges[i], s = slots[i];
    const fp = nodePositions.get(e.pn)!, tp = nodePositions.get(e.cn)!;
    const pv = net.getVariable(e.pn)!, cv = net.getVariable(e.cn)!;
    const [x1, y1] = slotXY(fp.x, fp.y, nodeW(pv), nodeH(pv), e.ps, s.fi, s.fc);
    const [x2, y2] = slotXY(tp.x, tp.y, nodeW(cv), nodeH(cv), e.cs, s.ti, s.tc);
    const dx = x2 - x1, dy = y2 - y1, len = Math.sqrt(dx * dx + dy * dy) || 1;
    const ex = x2, ey = y2;
    // Cubic bezier: control points blend side normal (70%) with edge direction (30%)
    // so the curve arrives at a natural angle, not perfectly perpendicular
    const cOff = Math.min(len * 0.4, 80);
    const sideDir = (side: Side): [number, number] =>
      side === 'bottom' ? [0, 1] : side === 'top' ? [0, -1] : side === 'right' ? [1, 0] : [-1, 0];
    const [sdx1, sdy1] = sideDir(e.ps);
    const [sdx2, sdy2] = sideDir(e.cs);
    const nx = dx / len, ny = dy / len;
    const b = 0.3; // blend factor: 0 = pure side normal, 1 = pure edge direction
    const cx1 = x1 + (sdx1 * (1 - b) + nx * b) * cOff;
    const cy1 = y1 + (sdy1 * (1 - b) + ny * b) * cOff;
    const cx2 = ex + (sdx2 * (1 - b) - nx * b) * cOff;
    const cy2 = ey + (sdy2 * (1 - b) - ny * b) * cOff;
    _edgeGroup.append('path')
      .attr('d', `M${x1},${y1} C${cx1},${cy1} ${cx2},${cy2} ${ex},${ey}`)
      .attr('fill', 'none')
      .attr('stroke', 'var(--edge)').attr('stroke-width', 1.5).attr('marker-end', 'url(#arr)');
  }
}
/**
 * Snap-zone targets at slider endpoints (only when NOT already snapped).
 * When snapped, the handle itself shows an X on hover; click-without-drag clears.
 */
function addSnapZones(
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  bx: number, by: number, bw: number, barH: number,
  zones: Array<{ x: number; label: string; isSnapped: boolean; snap: () => void }>,
) {
  for (const z of zones) {
    if (z.isSnapped) continue; // snapped → clear is on the handle, not here
    const sz = g.append('g')
      .attr('transform', `translate(${z.x},${by + barH / 2})`)
      .attr('pointer-events', 'none').attr('opacity', 0);
    sz.append('circle').attr('r', 9).attr('fill', 'var(--accent)').attr('opacity', 0.25);
    sz.append('circle').attr('r', 5).attr('fill', 'var(--accent)').attr('opacity', 0.5);
    sz.append('title').text(z.label);

    // Hover hit area (clickable)
    const hit = g.append('rect').attr('class', 'cz')
      .attr('x', z.x - 16).attr('y', by - 6).attr('width', 32).attr('height', barH + 12)
      .attr('fill', 'transparent').attr('cursor', 'pointer')
      .on('mouseenter', () => sz.attr('opacity', 1))
      .on('mouseleave', () => sz.attr('opacity', 0))
      .on('click', (ev) => { ev.stopPropagation(); z.snap(); });
    hit.append('title').text(z.label);
  }
}

/**
 * Create a draggable slider thumb.
 * When observation is active (isObs), hovering shows an X overlay;
 * clicking without dragging clears the observation.
 */
function addSliderThumb(
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  cx: number, cy: number, r: number,
  fillVar: string, isObs: boolean,
  onDrag: (x: number) => void, onEnd: (x: number) => void, onClear: () => void,
  minX: number, maxX: number,
) {
  const thumbG = g.append('g').attr('class', 'slider-thumb');

  const circle = thumbG.append('circle')
    .attr('cx', cx).attr('cy', cy).attr('r', r)
    .attr('fill', 'var(--bg-node)').attr('stroke', fillVar).attr('stroke-width', 2.5)
    .attr('cursor', 'ew-resize').attr('opacity', isObs ? 1 : 0.4)
    .attr('filter', isObs ? 'drop-shadow(0 1px 3px rgba(0,0,0,0.3))' : '');

  // Subtle X inside thumb (shown on hover when observed)
  const s = Math.max(2, r * 0.4); // X arm size, proportional to thumb
  const xOverlay = thumbG.append('g')
    .attr('transform', `translate(${cx},${cy})`)
    .attr('opacity', 0).attr('pointer-events', 'none');
  xOverlay.append('line').attr('x1', -s).attr('y1', -s).attr('x2', s).attr('y2', s)
    .attr('stroke', 'var(--accent-hard)').attr('stroke-width', 1.5).attr('stroke-linecap', 'round');
  xOverlay.append('line').attr('x1', s).attr('y1', -s).attr('x2', -s).attr('y2', s)
    .attr('stroke', 'var(--accent-hard)').attr('stroke-width', 1.5).attr('stroke-linecap', 'round');

  if (isObs) {
    circle
      .on('mouseenter', () => xOverlay.attr('opacity', 1))
      .on('mouseleave', () => xOverlay.attr('opacity', 0));
    circle.append('title').text('Click to clear observation');
  }

  let dragged = false;
  circle.call(d3.drag<SVGCircleElement, unknown>()
    .on('start', (e) => { e.sourceEvent?.stopPropagation(); dragged = false; })
    .on('drag', function (e) {
      dragged = true;
      const nx = Math.max(minX, Math.min(maxX, e.x));
      d3.select(this).attr('cx', nx);
      xOverlay.attr('transform', `translate(${nx},${cy})`);
      onDrag(nx);
    })
    .on('end', function (e) {
      if (!dragged && isObs) { onClear(); return; }
      if (dragged) { onEnd(Math.max(minX, Math.min(maxX, e.x))); }
    })
  );
}

function boolSlider(g: d3.Selection<SVGGElement, unknown, null, undefined>, v: Variable, dist: Distribution, w: number, h: number, accent: string) {
  const showLabels = !isBoolVar(v);
  const bw = w - 34, bx = -bw / 2, by = -h / 2 + 33;
  const isObs = observationEnabled.has(v.name);
  const fillVar = isObs ? (hardEvidence.has(v.name) ? 'var(--accent-hard)' : 'var(--accent-soft)') : accent;

  // Unified: bar = thumb = display value (evidence when observed, posterior when not)
  const displayW = isObs ? getWeights(v) : new Map(v.outcomes.map(o => [o, dist.get(o) ?? 0]));
  const tr = displayW.get(v.outcomes[0]) ?? 0; // right side = outcomes[0]
  const rx = 5; // bar corner radius — thumb/snap range is inset by rx
  const thumbMin = bx + rx, thumbMax = bx + bw - rx, thumbRange = thumbMax - thumbMin;

  // Bar background (also a click target to jump the slider)
  const barBg = g.append('rect').attr('x', bx).attr('y', by - 4).attr('width', bw).attr('height', 18)
    .attr('rx', rx).attr('fill', 'transparent').attr('cursor', 'pointer').attr('class', 'cz');
  g.append('rect').attr('x', bx).attr('y', by).attr('width', bw).attr('height', 10)
    .attr('rx', rx).attr('fill', 'var(--bg-bar)').attr('pointer-events', 'none');
  if (tr > 0.005)
    g.append('rect').attr('x', bx).attr('y', by).attr('width', 2 * rx + thumbRange * tr).attr('height', 10)
      .attr('rx', rx).attr('fill', fillVar).attr('opacity', 0.6).attr('pointer-events', 'none');
  barBg.on('click', (ev) => {
    ev.stopPropagation();
    const pt = (ev.target as SVGElement).ownerSVGElement!.createSVGPoint();
    pt.x = ev.clientX; pt.y = ev.clientY;
    const local = pt.matrixTransform((ev.target as SVGGraphicsElement).getScreenCTM()!.inverse());
    setSlider(v, Math.max(0, Math.min(1, (local.x - thumbMin) / thumbRange)));
  });

  // Show outcome labels for non-boolean 2-outcome vars: Cat1 <slider> Cat2
  if (showLabels) {
    g.append('text').attr('x', bx).attr('y', by + 20)
      .attr('font-size', '9px').attr('fill', 'var(--text-dim)').attr('text-anchor', 'start')
      .text(v.outcomes[1]); // left = "false" equivalent
    g.append('text').attr('x', bx + bw).attr('y', by + 20)
      .attr('font-size', '9px').attr('fill', 'var(--text-dim)').attr('text-anchor', 'end')
      .text(v.outcomes[0]); // right = "true" equivalent
  }

  // Thumb (click-without-drag = clear when observed)
  const clearObs = () => { hardEvidence.delete(v.name); softEvidence.delete(v.name); observationEnabled.delete(v.name); render(); };
  addSliderThumb(g, thumbMin + thumbRange * tr, by + 5, 7, fillVar, isObs,
    () => {}, (x) => setSlider(v, (x - thumbMin) / thumbRange), clearObs, thumbMin, thumbMax);

  // Snap zones at endpoints (only shown when not already snapped there)
  const snappedFalse = isObs && hardEvidence.get(v.name) === v.outcomes[1];
  const snappedTrue = isObs && hardEvidence.get(v.name) === v.outcomes[0];
  addSnapZones(g, bx, by, bw, 10, [
    { x: thumbMin, label: `Click to observe as ${v.outcomes[1]}`, isSnapped: snappedFalse,
      snap: () => { hardEvidence.set(v.name, v.outcomes[1]); softEvidence.delete(v.name); observationEnabled.add(v.name); render(); } },
    { x: thumbMax, label: `Click to observe as ${v.outcomes[0]}`, isSnapped: snappedTrue,
      snap: () => { hardEvidence.set(v.name, v.outcomes[0]); softEvidence.delete(v.name); observationEnabled.add(v.name); render(); } },
  ]);
}

function multiNode(g: d3.Selection<SVGGElement, unknown, null, undefined>, v: Variable, dist: Distribution, w: number, h: number, accent: string) {
  const isObs = observationEnabled.has(v.name);
  const tweaked = tweakedOutcomes.get(v.name) ?? new Set<string>();

  // Get display weights: evidence weights when observed, posteriors when not
  const weights = getWeights(v, undefined);
  // When observed, use evidence weights; when not, use posteriors
  const displayW = isObs ? weights : new Map(v.outcomes.map(o => [o, dist.get(o) ?? 0]));

  // Layout columns
  const pctColW = 38;
  const labelColW = Math.max(...v.outcomes.map(o => o.length)) * 6.5 + 14;
  const barPad = 6;
  const thumbR = 5;
  const bw = w - 16 - labelColW - barPad - pctColW - thumbR;
  const bx = -w / 2 + 8 + labelColW + barPad;

  let y = -h / 2 + 30;

  for (let i = 0; i < v.outcomes.length; i++) {
    const o = v.outcomes[i];
    const val = displayW.get(o) ?? 0; // bar = thumb = % = this value
    const pct = Math.round(val * 100);
    const by = y + 2;
    const textY = by + 3;
    const isTweaked = tweaked.has(o);

    // Label (right-aligned, clickable, bold if tweaked)
    const lg = g.append('g').attr('class', 'cz').attr('cursor', 'pointer')
      .on('click', (ev) => { ev.stopPropagation(); cycleOutcome(v, i); });
    lg.append('rect').attr('x', -w / 2 + 6).attr('y', by - 8).attr('width', labelColW + 4).attr('height', 16).attr('fill', 'transparent');
    lg.append('text').attr('x', bx - barPad).attr('y', textY)
      .attr('font-size', '10px')
      .attr('fill', isTweaked ? 'var(--text)' : 'var(--text-secondary)')
      .attr('font-weight', isTweaked ? '700' : '400')
      .attr('text-anchor', 'end').attr('dominant-baseline', 'central').text(o);

    // Percentage
    g.append('text').attr('x', w / 2 - 8).attr('y', textY)
      .attr('font-size', '10px').attr('font-weight', '600').attr('fill', 'var(--text)')
      .attr('text-anchor', 'end').attr('dominant-baseline', 'central')
      .text(`${pct}%`);

    // Bar background (click-to-jump)
    const mrx = 3; // bar corner radius — thumb/snap inset by mrx
    const mThumbMin = bx + mrx, mThumbMax = bx + bw - mrx, mThumbRange = mThumbMax - mThumbMin;
    const barHit = g.append('rect').attr('x', bx).attr('y', by - 4).attr('width', bw).attr('height', 14)
      .attr('fill', 'transparent').attr('cursor', 'pointer').attr('class', 'cz');
    g.append('rect').attr('x', bx).attr('y', by).attr('width', bw).attr('height', 6)
      .attr('rx', mrx).attr('fill', 'var(--bg-bar)').attr('pointer-events', 'none');
    if (val > 0.005)
      g.append('rect').attr('x', bx).attr('y', by).attr('width', 2 * mrx + mThumbRange * val).attr('height', 6)
        .attr('rx', mrx).attr('fill', accent).attr('opacity', 0.6).attr('pointer-events', 'none');

    const idx = i;
    barHit.on('click', (ev) => {
      ev.stopPropagation();
      const pt = (ev.target as SVGElement).ownerSVGElement!.createSVGPoint();
      pt.x = ev.clientX; pt.y = ev.clientY;
      const local = pt.matrixTransform((ev.target as SVGGraphicsElement).getScreenCTM()!.inverse());
      setMultiWeight(v, idx, Math.max(0, Math.min(1, (local.x - mThumbMin) / mThumbRange)));
    });

    // Thumb: clear-on-click clears THIS outcome's tweak only (if tweaked)
    const clearThis = isTweaked ? () => clearOutcomeTweak(v, idx) : () => {};
    addSliderThumb(g, mThumbMin + mThumbRange * val, by + 3, 5, accent, isTweaked,
      () => {}, (x) => setMultiWeight(v, idx, (x - mThumbMin) / mThumbRange), clearThis, mThumbMin, mThumbMax);

    // Snap zones
    const isSnapped100 = isObs && hardEvidence.get(v.name) === o;
    const isSnapped0 = val < 0.01 && isTweaked;
    addSnapZones(g, bx, by, bw, 6, [
      { x: mThumbMin, label: `Click to exclude ${o}`, isSnapped: isSnapped0,
        snap: () => setMultiWeight(v, i, 0) },
      { x: mThumbMax, label: `Click to observe as ${o}`, isSnapped: isSnapped100,
        snap: () => { hardEvidence.set(v.name, o); softEvidence.delete(v.name); observationEnabled.add(v.name); tweakedOutcomes.set(v.name, new Set(v.outcomes)); render(); } },
    ]);

    y += NODE_H_PER_OUTCOME;
  }
}

// ─── Sensitivity panel rendering ────────────────────────────────────

let activeInfoTab = 'voi';

function renderInfoPanel() {
  const panel = document.getElementById('info-panel');
  if (!panel) return;

  if (!network || selectedNodes.size === 0) {
    panel.classList.remove('visible');
    return;
  }

  const selected = [...selectedNodes];
  const hasVoi = voiResults && voiResults.length > 0;
  const hasTornado = sensitivityMode && sensitivityResults && sensitivityResults.length > 0;

  // Build tabs: VOI (always when selected) + CPT per selected node + (optional) Parameters
  const tabs: Array<{ id: string; label: string }> = [];
  tabs.push({ id: 'voi', label: 'Value of Info' });
  for (const name of selected) tabs.push({ id: `cpt:${name}`, label: `P(${name})` });
  if (hasTornado) tabs.push({ id: 'params', label: 'Parameters' });

  if (tabs.length === 0) { panel.classList.remove('visible'); return; }

  // Ensure active tab is valid
  if (!tabs.find(t => t.id === activeInfoTab)) activeInfoTab = tabs[0].id;

  // Render tabs
  const tabsEl = document.getElementById('info-tabs')!;
  tabsEl.innerHTML = tabs.map(t =>
    `<button class="panel-tab${t.id === activeInfoTab ? ' active' : ''}" data-tab="${t.id}">${escapeHtml(t.label)}</button>`
  ).join('');

  // Tab click handlers
  for (const btn of tabsEl.querySelectorAll<HTMLElement>('.panel-tab')) {
    btn.addEventListener('click', () => {
      activeInfoTab = btn.dataset.tab!;
      renderInfoPanel(); // re-render with new active tab
    });
  }

  // Render active tab content
  const bodyEl = document.getElementById('info-body')!;
  let html = '<div class="panel-content">';

  if (activeInfoTab === 'voi') {
    const queryLabel = selected.length > 1 ? selected.join(', ') : selected[0];
    html += `<div class="panel-title">Best observations to learn about ${escapeHtml(queryLabel)}</div>`;
    if (hasVoi) {
      const maxVoi = voiResults![0].voi || 0.01;
      for (const r of voiResults!.slice(0, 15)) {
        const pct = Math.min(100, (r.voi / maxVoi) * 100);
        html += `<div class="voi-row" data-var="${r.variable}" title="VOI: ${r.voi.toFixed(4)} bits\nBase entropy: ${r.baseEntropy.toFixed(4)} bits">`;
        html += `<span class="voi-name">${r.variable}</span>`;
        html += `<span class="voi-bar"><span class="voi-bar-fill" style="width:${pct}%;background:var(--accent)"></span></span>`;
        html += `<span class="voi-value">${r.voi.toFixed(3)}</span></div>`;
      }
    } else {
      html += '<div style="color:var(--text-dim);padding:8px 0">No additional observations available</div>';
    }
  } else if (activeInfoTab.startsWith('cpt:')) {
    const varName = activeInfoTab.slice(4);
    html += buildCptHtml(varName);
  } else if (activeInfoTab === 'params' && hasTornado) {
    const top = [...sensitivityResults!].sort((a, b) => Math.abs(b.derivative) - Math.abs(a.derivative)).slice(0, 15);
    const maxDeriv = Math.abs(top[0]?.derivative) || 0.01;
    html += `<div class="panel-title">Top parameters for ${escapeHtml(sensitivityQuery ?? '')}</div>`;
    for (const r of top) {
      const pct = Math.min(100, (Math.abs(r.derivative) / maxDeriv) * 100);
      const sign = r.derivative >= 0 ? '+' : '';
      html += `<div class="tornado-row" data-var="${r.variable}" title="${r.variable} | ${r.parentConfig}\n${r.outcome}: ${r.currentValue.toFixed(3)}\nDerivative: ${sign}${r.derivative.toFixed(4)}">`;
      html += `<span class="tornado-param">${r.variable}.${r.outcome}</span>`;
      html += `<span class="tornado-range"><span class="tornado-range-fill" style="width:${pct}%;background:${r.derivative >= 0 ? 'var(--accent)' : 'var(--accent-hard)'}"></span></span>`;
      html += `<span class="voi-value">${sign}${r.derivative.toFixed(2)}</span></div>`;
    }
  }

  html += '</div>';
  bodyEl.innerHTML = html;

  // Click handlers on VOI/tornado rows
  for (const row of bodyEl.querySelectorAll<HTMLElement>('.voi-row, .tornado-row')) {
    row.addEventListener('click', () => {
      const name = row.dataset.var!;
      selectedNodes.clear();
      selectedNodes.add(name);
      render();
    });
  }

  panel.classList.add('visible');
}

// Sensitivity mode toggle
document.getElementById('btn-sensitivity')?.addEventListener('click', () => {
  sensitivityMode = !sensitivityMode;
  const btn = document.getElementById('btn-sensitivity')!;
  btn.classList.toggle('active', sensitivityMode);

  if (sensitivityMode) {
    // Use first selected node as query, or first variable
    if (selectedNodes.size === 1) {
      sensitivityQuery = [...selectedNodes][0];
    } else if (network) {
      sensitivityQuery = network.variables[0]?.name ?? null;
    }
  } else {
    sensitivityQuery = null;
    sensitivityInfluence = null;
    sensitivityResults = null;
    voiResults = null;
  }
  render();
});

// ─── MCP App lifecycle ──────────────────────────────────────────────

async function initMcpApp() {
  const { App, applyDocumentTheme, applyHostStyleVariables, applyHostFonts } =
    await import('@modelcontextprotocol/ext-apps');

  // Hide standalone-only toolbar items
  for (const id of ['btn-load-example', 'example-select', 'btn-export', 'btn-layout', 'btn-fit']) {
    const el = document.getElementById(id);
    if (el) (el.closest('.export-wrapper') ?? el).style.display = 'none';
  }
  // Hide hint text
  for (const el of document.querySelectorAll<HTMLElement>('.hint')) el.style.display = 'none';

  const app = new App({ name: 'Nabab Network Viewer', version: '1.0.0' });

  /** Try to load a network from tool args (input or partial input). */
  function tryLoadFromArgs(args: Record<string, unknown> | undefined, partial = false) {
    if (!args) return;
    const source = args.source as string | undefined;
    if (!source) return;

    // For URLs, we can't fetch client-side — wait for the server's tool result
    if (/^https?:\/\/|^file:\/\//.test(source)) {
      if (!partial) {
        document.getElementById('network-name')!.textContent = 'Loading from URL…';
      }
      return;
    }

    // Inline content: try to parse (may be incomplete during streaming)
    try {
      loadNetwork(source, true);
      if (!partial && args.evidence && typeof args.evidence === 'object') {
        hardEvidence = new Map(Object.entries(args.evidence as Record<string, string>));
        for (const k of hardEvidence.keys()) observationEnabled.add(k);
        render();
      }
    } catch {
      // Incomplete XML during streaming — show what we have so far
      if (partial) {
        document.getElementById('network-name')!.textContent = 'Streaming network…';
      }
    }
  }

  app.ontoolinputpartial = (params) => {
    tryLoadFromArgs(params.arguments as Record<string, unknown> | undefined, true);
  };

  app.ontoolinput = (params) => {
    tryLoadFromArgs(params.arguments as Record<string, unknown> | undefined, false);
  };

  app.ontoolresult = (result) => {
    const data = result.structuredContent as { source?: string; evidence?: Record<string, string> } | undefined;
    if (data?.source) {
      loadNetwork(data.source, true);
      if (data.evidence) {
        hardEvidence = new Map(Object.entries(data.evidence));
        for (const k of hardEvidence.keys()) observationEnabled.add(k);
        render();
      }
    }
  };

  app.onhostcontextchanged = (ctx) => {
    if (ctx.theme) applyDocumentTheme(ctx.theme);
    if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
    if (ctx.styles?.css?.fonts) applyHostFonts(ctx.styles.css.fonts);
    if (ctx.safeAreaInsets) {
      const { top, right, bottom, left } = ctx.safeAreaInsets;
      document.body.style.padding = `${top}px ${right}px ${bottom}px ${left}px`;
    }
  };

  app.onerror = console.error;
  app.onteardown = async () => ({});

  await app.connect();
  const ctx = app.getHostContext();
  if (ctx) app.onhostcontextchanged?.(ctx);

  // Try restoring from localStorage
  if (!loadStateFromLocalStorage()) {
    document.getElementById('network-name')!.textContent = 'Waiting for network…';
  }
}

// ─── Boot ───────────────────────────────────────────────────────────

if (IS_MCP) {
  initMcpApp().catch(console.error);
} else {
  loadStateFromHash().then(ok => { if (!ok) loadExampleFile('dogproblem.xmlbif'); });
}
