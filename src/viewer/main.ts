import * as d3 from 'd3';
import dagre from '@dagrejs/dagre';
import { BayesianNetwork } from '../lib/network.js';
import type { Variable, Evidence, LikelihoodEvidence, Distribution } from '../lib/types.js';

let network: BayesianNetwork | null = null;
let hardEvidence: Evidence = new Map();
let softEvidence: LikelihoodEvidence = new Map();
let observationEnabled = new Set<string>();
let rememberedHard = new Map<string, string>();
let rememberedSoft = new Map<string, Map<string, number>>();
let nodePositions = new Map<string, { x: number; y: number }>();
let selectedNodes = new Set<string>();

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
      network = BayesianNetwork.fromXmlBif(await resp.text());
    } else {
      currentSource = { type: 'custom', xmlbif: state.s.x };
      network = BayesianNetwork.fromXmlBif(state.s.x);
    }

    // Restore evidence
    hardEvidence = new Map(Object.entries(state.h ?? {}));
    softEvidence = new Map(Object.entries(state.e ?? {}).map(([k, v]) => [k, new Map(Object.entries(v))]));
    observationEnabled = new Set(state.o ?? []);
    rememberedHard = new Map(); rememberedSoft = new Map();

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

// ─── Loading ─────────────────────────────────────────────────────────

function exampleUrl(filename: string): string {
  return new URL(`../examples/${filename}`, import.meta.url).href;
}

async function loadExampleFile(filename: string) {
  const resp = await fetch(exampleUrl(filename));
  if (!resp.ok) throw new Error(`Failed to load ${filename}: ${resp.status}`);
  currentSource = { type: 'builtin', name: filename };
  loadNetwork(await resp.text(), false);
}

async function loadExample() {
  const select = document.getElementById('example-select') as HTMLSelectElement;
  await loadExampleFile(select.value);
}

function loadNetwork(xmlbif: string, isCustom = true) {
  network = BayesianNetwork.fromXmlBif(xmlbif);
  hardEvidence = new Map(); softEvidence = new Map();
  observationEnabled = new Set();
  rememberedHard = new Map(); rememberedSoft = new Map();
  nodePositions = new Map();
  if (isCustom) currentSource = { type: 'custom', xmlbif };
  document.getElementById('network-name')!.textContent = network.name;
  autoLayout();
}

// ─── Selection ───────────────────────────────────────────────────────

function selectNode(name: string, additive: boolean) {
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

document.getElementById('btn-load-example')!.addEventListener('click', loadExample);
document.getElementById('example-select')!.addEventListener('change', loadExample);
document.getElementById('btn-clear-evidence')!.addEventListener('click', () => {
  hardEvidence = new Map(); softEvidence = new Map();
  observationEnabled = new Set(); render();
});
document.getElementById('btn-layout')!.addEventListener('click', autoLayout);
document.getElementById('btn-fit')!.addEventListener('click', fitView);

// Paste XMLBIF
document.body.addEventListener('paste', (e: ClipboardEvent) => {
  const t = e.clipboardData?.getData('text');
  if (t?.includes('<BIF')) { e.preventDefault(); loadNetwork(t); }
});

// Drag-and-drop XMLBIF files
const container = document.getElementById('graph-container')!;
container.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer!.dropEffect = 'copy'; });
container.addEventListener('drop', (e) => {
  e.preventDefault();
  const file = e.dataTransfer?.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === 'string') loadNetwork(reader.result); };
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

function effectiveEvidence(): [Evidence | undefined, LikelihoodEvidence | undefined] {
  const he = new Map<string, string>(), se = new Map<string, Map<string, number>>();
  for (const [k, v] of hardEvidence) if (observationEnabled.has(k)) he.set(k, v);
  for (const [k, v] of softEvidence) if (observationEnabled.has(k)) se.set(k, v);
  return [he.size ? he : undefined, se.size ? se : undefined];
}

function toggleEye(v: Variable) {
  if (observationEnabled.has(v.name)) {
    observationEnabled.delete(v.name);
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
  } else if (cur) {
    const idx = v.outcomes.indexOf(cur);
    if (idx < v.outcomes.length - 1) hardEvidence.set(v.name, v.outcomes[idx + 1]);
    else { hardEvidence.delete(v.name); softEvidence.delete(v.name); observationEnabled.delete(v.name); }
  } else {
    hardEvidence.set(v.name, v.outcomes[0]); softEvidence.delete(v.name);
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
    hardEvidence.set(v.name, o); softEvidence.delete(v.name); observationEnabled.add(v.name);
  } else if (hardEvidence.get(v.name) === o) {
    hardEvidence.delete(v.name);
    const w = new Map<string, number>();
    v.outcomes.forEach((x, j) => w.set(x, j === i ? 0 : 1 / (v.outcomes.length - 1)));
    softEvidence.set(v.name, w);
  } else if (softEvidence.has(v.name) && (softEvidence.get(v.name)!.get(o) ?? 1) < 0.01) {
    hardEvidence.delete(v.name); softEvidence.delete(v.name); observationEnabled.delete(v.name);
  } else {
    hardEvidence.set(v.name, o); softEvidence.delete(v.name);
  }
  render();
}

// ─── Rendering ───────────────────────────────────────────────────────

function render() {
  if (!network) return;
  const [he, se] = effectiveEvidence();
  const result = network.infer(he, se);
  renderGraph(network, result.posteriors);
  saveStateToHash();
  if (window.parent !== window) {
    const d: Record<string, Record<string, number>> = {};
    for (const [v, dist] of result.posteriors) d[v.name] = Object.fromEntries(dist);
    window.parent.postMessage({ type: 'nabab-posteriors', d }, '*');
  }
}

// Material Design icon paths (24x24 viewBox)
const ICON_VIS = 'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z';
const ICON_VIS_OFF = 'M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z';

const NODE_W_MIN = 150;
const NODE_H_BOOL = 56;
const NODE_H_BOOL_LABELS = 68; // extra room when showing non-standard labels
const NODE_H_MULTI_BASE = 30;
const NODE_H_PER_OUTCOME = 24;
const CHAR_W = 6.5; // approx px per character at 10px font

const BOOL_PATTERNS = /^(true|false|yes|no|t|f|y|n)$/i;

/** Is this a boolean variable with standard true/false-like outcomes? */
function isBoolVar(v: Variable): boolean {
  return v.outcomes.length === 2 && BOOL_PATTERNS.test(v.outcomes[0]) && BOOL_PATTERNS.test(v.outcomes[1]);
}

/** Is this variable displayed as a single slider (2 outcomes)? */
function isSliderVar(v: Variable): boolean {
  return v.outcomes.length === 2;
}

/** Compute node width based on content. */
function nodeW(v: Variable): number {
  // Account for eye icon (28px) + padding (16px) + name + suffix
  const nameLen = v.name.length + 6; // ": XX%" or "= outcome"
  const headerW = 44 + nameLen * CHAR_W;

  if (isSliderVar(v)) {
    // Boolean-like: need room for labels if non-standard
    if (!isBoolVar(v)) {
      const labelW = 44 + Math.max(v.outcomes[0].length, v.outcomes[1].length) * CHAR_W * 2 + 40;
      return Math.max(NODE_W_MIN, headerW, labelW);
    }
    return Math.max(NODE_W_MIN, headerW);
  }

  // Multi-class: label (right-aligned) + slider + "100%"
  const maxLabel = Math.max(...v.outcomes.map(o => o.length));
  const tableW = maxLabel * CHAR_W + 80 + 40; // label + slider + pct
  return Math.max(NODE_W_MIN, headerW, tableW);
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
  // Drop shadow for nodes
  const shadow = defs.append('filter').attr('id', 'node-shadow').attr('x', '-10%').attr('y', '-10%').attr('width', '130%').attr('height', '140%');
  shadow.append('feDropShadow').attr('dx', 0).attr('dy', 2).attr('stdDeviation', 4).attr('flood-opacity', 0.15);

  defs.append('marker').attr('id', 'arr')
    .attr('viewBox', '0 -4 8 8').attr('refX', 4).attr('refY', 0)
    .attr('markerWidth', 5).attr('markerHeight', 5).attr('orient', 'auto')
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

    const ng = contentG.append('g').attr('transform', `translate(${pos.x},${pos.y})`);

    // Background
    // Pastel color per variable (HSL, evenly spaced hue)
    const varIdx = net.variables.indexOf(v);
    const hue = (varIdx / net.variables.length) * 360;
    const isDark = matchMedia('(prefers-color-scheme: dark)').matches;
    const bgFill = isObs ? `hsl(${hue}, ${isHard ? 20 : 25}%, ${isDark ? 20 : 92}%)` : 'var(--bg-node)';
    const borderCol = isHard ? 'var(--accent-hard)' : isSoft ? 'var(--accent-soft)' : 'var(--border-node)';
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

    ng.append('rect').attr('x', -w / 2).attr('y', -h / 2)
      .attr('width', w).attr('height', h).attr('rx', 8)
      .attr('fill', bgFill).attr('stroke', borderCol).attr('stroke-width', 1.5)
      .attr('filter', 'url(#node-shadow)');

    // Node drag (moves all selected if this node is selected)
    ng.call(d3.drag<SVGGElement, unknown>()
      .filter((ev) => !(ev.target as SVGElement).classList.contains('slider-thumb') && !(ev.target as SVGElement).closest('.cz'))
      .on('start', (ev) => {
        // Click-to-select (on mousedown, before drag begins)
        if (!ev.sourceEvent?.shiftKey && !isSel) { selectedNodes.clear(); }
        selectedNodes.add(v.name);
      })
      .on('drag', (ev) => {
        // Move all selected nodes together
        const toMove = selectedNodes.has(v.name) && selectedNodes.size > 0 ? [...selectedNodes] : [v.name];
        for (const name of toMove) {
          const p = nodePositions.get(name);
          if (p) { p.x += ev.dx; p.y += ev.dy; nodePositions.set(name, { ...p }); }
        }
        // Update all moved node group transforms
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
      .on('end', () => render()) // re-render to update selection visuals
    ).attr('cursor', 'grab');

    ng.attr('class', 'node-g').attr('data-var', v.name);

    // Click on node background to select (without starting drag)
    ng.on('click', (ev) => {
      if ((ev.target as SVGElement).closest('.cz') || (ev.target as SVGElement).classList.contains('slider-thumb')) return;
      selectNode(v.name, ev.shiftKey);
    });

    // ── Row 1: eye icon + "label: XX%" ──
    const ry = -h / 2 + 14;
    let labelSuffix: string;
    if (isHard) {
      labelSuffix = ` = ${hardEvidence.get(v.name)}`;
    } else if (dist && isSliderVar(v)) {
      // 2-outcome: show P(outcomes[0]) to match slider (right = outcomes[0])
      const p0 = Math.round((dist.get(v.outcomes[0]) ?? 0) * 100);
      labelSuffix = `: ${p0}%`;
    } else if (dist) {
      // Categorical: show most likely outcome
      let maxOut = v.outcomes[0], maxP = 0;
      for (const o of v.outcomes) { const p = dist.get(o) ?? 0; if (p > maxP) { maxP = p; maxOut = o; } }
      labelSuffix = `: ${maxOut} ${Math.round(maxP * 100)}%`;
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
  _edgeGroup.selectAll('line').remove();

  // Group edges by target (incoming) and source (outgoing) to distribute slots
  const incoming = new Map<string, Array<{ parent: Variable; child: Variable }>>();
  const outgoing = new Map<string, Array<{ parent: Variable; child: Variable }>>();
  for (const cpt of net.cpts) {
    for (const p of cpt.parents) {
      const edge = { parent: p, child: cpt.variable };
      if (!incoming.has(cpt.variable.name)) incoming.set(cpt.variable.name, []);
      incoming.get(cpt.variable.name)!.push(edge);
      if (!outgoing.has(p.name)) outgoing.set(p.name, []);
      outgoing.get(p.name)!.push(edge);
    }
  }

  // Sort each group by the OTHER endpoint's x-position to minimize crossings
  for (const [name, edges] of incoming) {
    edges.sort((a, b) => (nodePositions.get(a.parent.name)?.x ?? 0) - (nodePositions.get(b.parent.name)?.x ?? 0));
  }
  for (const [name, edges] of outgoing) {
    edges.sort((a, b) => (nodePositions.get(a.child.name)?.x ?? 0) - (nodePositions.get(b.child.name)?.x ?? 0));
  }

  // Compute slot position along the edge of a node
  function slotX(nodeX: number, nw: number, index: number, count: number): number {
    if (count <= 1) return nodeX;
    const span = Math.min(nw - 30, (count - 1) * 20);
    return nodeX - span / 2 + (span * index) / (count - 1);
  }

  // Draw each edge using its slot indices
  for (const cpt of net.cpts) {
    for (const p of cpt.parents) {
      const f = nodePositions.get(p.name)!, t = nodePositions.get(cpt.variable.name)!;

      const outEdges = outgoing.get(p.name)!;
      const outIdx = outEdges.findIndex(e => e.child === cpt.variable);
      const x1 = slotX(f.x, nodeW(p), outIdx, outEdges.length);

      const inEdges = incoming.get(cpt.variable.name)!;
      const inIdx = inEdges.findIndex(e => e.parent === p);
      const x2 = slotX(t.x, nodeW(cpt.variable), inIdx, inEdges.length);

      _edgeGroup.append('line')
        .attr('x1', x1).attr('y1', f.y + nodeH(p) / 2)
        .attr('x2', x2).attr('y2', t.y - nodeH(cpt.variable) / 2 - 4)
        .attr('stroke', 'var(--edge)').attr('stroke-width', 1.5).attr('marker-end', 'url(#arr)');
    }
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
    .attr('fill', 'var(--thumb)').attr('stroke', fillVar).attr('stroke-width', 2)
    .attr('cursor', 'ew-resize').attr('opacity', isObs ? 1 : 0.4);

  // X overlay (shown on hover when any observation is active)
  const xOverlay = thumbG.append('g')
    .attr('transform', `translate(${cx},${cy})`)
    .attr('opacity', 0).attr('pointer-events', 'none');
  xOverlay.append('circle').attr('r', r + 2).attr('fill', 'var(--accent-hard)').attr('opacity', 0.3);
  xOverlay.append('line').attr('x1', -3).attr('y1', -3).attr('x2', 3).attr('y2', 3)
    .attr('stroke', 'var(--accent-hard)').attr('stroke-width', 2).attr('stroke-linecap', 'round');
  xOverlay.append('line').attr('x1', 3).attr('y1', -3).attr('x2', -3).attr('y2', 3)
    .attr('stroke', 'var(--accent-hard)').attr('stroke-width', 2).attr('stroke-linecap', 'round');

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
  const probTrue = dist.get(v.outcomes[0]) ?? 0;
  const showLabels = !isBoolVar(v);
  const bw = w - 34, bx = -bw / 2, by = -h / 2 + 33;
  const isObs = observationEnabled.has(v.name);
  const fillVar = isObs ? (hardEvidence.has(v.name) ? 'var(--accent-hard)' : 'var(--accent-soft)') : accent;

  // Compute thumb position: evidence when observed, posterior otherwise
  let tr: number;
  if (isObs && hardEvidence.has(v.name)) tr = hardEvidence.get(v.name) === v.outcomes[0] ? 1 : 0;
  else if (isObs && softEvidence.has(v.name)) {
    const w = softEvidence.get(v.name)!;
    const a = w.get(v.outcomes[0]) ?? .5, b = w.get(v.outcomes[1]) ?? .5;
    tr = (a + b) > 0 ? a / (a + b) : .5;
  } else tr = probTrue;

  // Bar background (also a click target to jump the slider)
  const barBg = g.append('rect').attr('x', bx).attr('y', by - 4).attr('width', bw).attr('height', 18)
    .attr('rx', 5).attr('fill', 'transparent').attr('cursor', 'pointer').attr('class', 'cz');
  g.append('rect').attr('x', bx).attr('y', by).attr('width', bw).attr('height', 10)
    .attr('rx', 5).attr('fill', 'var(--bg-bar)').attr('pointer-events', 'none');
  if (tr > 0.005)
    g.append('rect').attr('x', bx).attr('y', by).attr('width', Math.max(4, bw * tr)).attr('height', 10)
      .attr('rx', 5).attr('fill', fillVar).attr('opacity', 0.6).attr('pointer-events', 'none');
  barBg.on('click', (ev) => {
    ev.stopPropagation();
    const pt = (ev.target as SVGElement).ownerSVGElement!.createSVGPoint();
    pt.x = ev.clientX; pt.y = ev.clientY;
    const local = pt.matrixTransform((ev.target as SVGGraphicsElement).getScreenCTM()!.inverse());
    setSlider(v, Math.max(0, Math.min(1, (local.x - bx) / bw)));
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
  addSliderThumb(g, bx + bw * tr, by + 5, 7, fillVar, isObs,
    () => {}, (x) => setSlider(v, (x - bx) / bw), clearObs, bx, bx + bw);

  // Snap zones at endpoints (only shown when not already snapped there)
  const snappedFalse = isObs && hardEvidence.get(v.name) === v.outcomes[1];
  const snappedTrue = isObs && hardEvidence.get(v.name) === v.outcomes[0];
  addSnapZones(g, bx, by, bw, 10, [
    { x: bx, label: `Click to observe as ${v.outcomes[1]}`, isSnapped: snappedFalse,
      snap: () => { hardEvidence.set(v.name, v.outcomes[1]); softEvidence.delete(v.name); observationEnabled.add(v.name); render(); } },
    { x: bx + bw, label: `Click to observe as ${v.outcomes[0]}`, isSnapped: snappedTrue,
      snap: () => { hardEvidence.set(v.name, v.outcomes[0]); softEvidence.delete(v.name); observationEnabled.add(v.name); render(); } },
  ]);
}

function multiNode(g: d3.Selection<SVGGElement, unknown, null, undefined>, v: Variable, dist: Distribution, w: number, h: number, accent: string) {
  const isObs = observationEnabled.has(v.name);
  const tableW = w - 16;
  const tableH = v.outcomes.length * NODE_H_PER_OUTCOME;
  const tableX = -w / 2 + 8;
  const tableY = -h / 2 + 26;

  // Use foreignObject for proper HTML table layout
  const fo = g.append('foreignObject')
    .attr('x', tableX).attr('y', tableY)
    .attr('width', tableW).attr('height', tableH)
    .attr('class', 'cz');

  const table = fo.append('xhtml:table')
    .style('width', '100%').style('border-collapse', 'collapse')
    .style('font-size', '10px').style('font-family', 'inherit');

  for (let i = 0; i < v.outcomes.length; i++) {
    const o = v.outcomes[i];
    const prob = dist.get(o) ?? 0;
    const pct = Math.round(prob * 100);

    const tr = table.append('xhtml:tr').style('height', `${NODE_H_PER_OUTCOME}px`);

    // Label column (right-aligned, clickable)
    tr.append('xhtml:td')
      .style('text-align', 'right').style('padding-right', '6px')
      .style('color', 'var(--text-secondary)').style('cursor', 'pointer')
      .style('white-space', 'nowrap').style('width', '1%')
      .text(o)
      .on('click', (ev: Event) => { ev.stopPropagation(); cycleOutcome(v, i); });

    // Slider column
    const sliderTd = tr.append('xhtml:td').style('position', 'relative');
    const input = sliderTd.append('xhtml:input')
      .attr('type', 'range').attr('min', '0').attr('max', '1000')
      .attr('value', String(Math.round(prob * 1000)))
      .style('width', '100%').style('height', '6px')
      .style('accent-color', accent).style('cursor', 'pointer')
      .style('-webkit-appearance', 'none').style('appearance', 'none')
      .style('background', 'var(--bg-bar)').style('border-radius', '3px')
      .style('outline', 'none');
    const idx = i;
    (input.node() as HTMLInputElement).addEventListener('input', (ev) => {
      ev.stopPropagation();
      const ratio = Number((ev.target as HTMLInputElement).value) / 1000;
      hardEvidence.delete(v.name); observationEnabled.add(v.name);
      if (!softEvidence.has(v.name)) softEvidence.set(v.name, new Map(v.outcomes.map(x => [x, 1 / v.outcomes.length])));
      const w = softEvidence.get(v.name)!;
      const otherTotal = [...w].reduce((s, [k, val]) => k === v.outcomes[idx] ? s : s + val, 0);
      w.set(v.outcomes[idx], ratio);
      if (otherTotal > 0) {
        const sc = Math.max(0, 1 - ratio) / otherTotal;
        for (let j = 0; j < v.outcomes.length; j++) if (j !== idx) w.set(v.outcomes[j], (w.get(v.outcomes[j]) ?? 0) * sc);
      }
      if (ratio > 0.995) { hardEvidence.set(v.name, v.outcomes[idx]); softEvidence.delete(v.name); }
      else if (ratio < 0.005) {
        const allUniform = [...w.values()].every((x, _, a) => Math.abs(x - a[0]) < 0.02);
        if (allUniform) { softEvidence.delete(v.name); observationEnabled.delete(v.name); }
      }
      render();
    });

    // Percentage column
    tr.append('xhtml:td')
      .style('text-align', 'right').style('padding-left', '4px')
      .style('font-weight', '600').style('color', 'var(--text)')
      .style('white-space', 'nowrap').style('width', '1%')
      .text(`${pct}%`);
  }
}

// Boot: restore from hash or load default
loadStateFromHash().then(ok => { if (!ok) loadExampleFile('dogproblem.xmlbif'); });
