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
// Track current source for hash serialization
let currentSource: { type: 'builtin'; name: string } | { type: 'custom'; xmlbif: string } =
  { type: 'builtin', name: 'dogproblem.xmlbif' };

// ─── Hash state persistence ─────────────────────────────────────────

interface SerializedState {
  s: { t: 'b'; n: string } | { t: 'c'; x: string }; // source
  h?: Record<string, string>;                          // hard evidence
  e?: Record<string, Record<string, number>>;          // soft evidence
  o?: string[];                                        // enabled observations
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
    nodePositions = new Map();

    document.getElementById('network-name')!.textContent = network.name;
    autoLayout();
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

document.getElementById('btn-load-example')!.addEventListener('click', loadExample);
document.getElementById('example-select')!.addEventListener('change', loadExample);
document.getElementById('btn-clear-evidence')!.addEventListener('click', () => {
  hardEvidence = new Map(); softEvidence = new Map();
  observationEnabled = new Set(); render();
});
document.getElementById('btn-layout')!.addEventListener('click', autoLayout);

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
  for (const v of network.variables) g.setNode(v.name, { width: NODE_W, height: nodeH(v) });
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

const NODE_W = 170;
const NODE_H_BOOL = 56;
const NODE_H_MULTI_BASE = 30;
const NODE_H_PER_OUTCOME = 24;

function nodeH(v: Variable) {
  return v.outcomes.length === 2 ? NODE_H_BOOL : NODE_H_MULTI_BASE + v.outcomes.length * NODE_H_PER_OUTCOME;
}

let _edgeGroup: d3.Selection<SVGGElement, unknown, null, undefined> | null = null;

function renderGraph(net: BayesianNetwork, posteriors: Map<Variable, Distribution>) {
  const container = document.getElementById('graph-container')!;
  container.innerHTML = '';
  const W = container.clientWidth, H = container.clientHeight;
  const svg = d3.select(container).append('svg').attr('width', W).attr('height', H);
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

  _edgeGroup = svg.append('g');
  drawEdges(net);

  for (const v of net.variables) {
    const pos = nodePositions.get(v.name)!;
    const dist = posteriors.get(v);
    const h = nodeH(v);
    const isObs = observationEnabled.has(v.name);
    const isHard = isObs && hardEvidence.has(v.name);
    const isSoft = isObs && softEvidence.has(v.name);

    const ng = svg.append('g').attr('transform', `translate(${pos.x},${pos.y})`);

    // Background
    const borderCol = isHard ? 'var(--accent-hard)' : isSoft ? 'var(--accent-soft)' : 'var(--border-node)';
    ng.append('rect').attr('x', -NODE_W / 2).attr('y', -h / 2)
      .attr('width', NODE_W).attr('height', h).attr('rx', 8)
      .attr('fill', 'var(--bg-node)').attr('stroke', borderCol).attr('stroke-width', 1.5)
      .attr('filter', 'url(#node-shadow)');

    // Node drag
    ng.call(d3.drag<SVGGElement, unknown>()
      .filter((ev) => !(ev.target as SVGElement).classList.contains('slider-thumb') && !(ev.target as SVGElement).closest('.cz'))
      .on('drag', (ev) => { pos.x += ev.dx; pos.y += ev.dy; nodePositions.set(v.name, { ...pos }); ng.attr('transform', `translate(${pos.x},${pos.y})`); drawEdges(net); })
    ).attr('cursor', 'grab');

    // ── Row 1: eye icon + "label: XX%" ──
    const ry = -h / 2 + 14;
    const probTrue = dist?.get(v.outcomes[0]) ?? 0;
    const pct = Math.round(probTrue * 100);
    const labelSuffix = isHard ? ` = ${hardEvidence.get(v.name)}` : `: ${pct}%`;

    // Eye icon (Material Design Visibility / VisibilityOff)
    const eyeG = ng.append('g').attr('class', 'cz').attr('cursor', 'pointer')
      .attr('transform', `translate(${-NODE_W / 2 + 18},${ry})`)
      .on('click', (ev) => { ev.stopPropagation(); toggleEye(v); });
    eyeG.append('rect').attr('x', -10).attr('y', -10).attr('width', 20).attr('height', 20).attr('fill', 'transparent');
    const eyeColor = isObs ? (isHard ? 'var(--accent-hard)' : isSoft ? 'var(--accent-soft)' : 'var(--accent)') : 'var(--text-dim)';
    eyeG.append('path').attr('d', isObs ? ICON_VIS : ICON_VIS_OFF)
      .attr('fill', eyeColor).attr('transform', 'translate(-8,-8) scale(0.67)');
    eyeG.append('title').text(eyeTooltip(v));

    // Name + percentage
    const nameG = ng.append('g').attr('class', 'cz').attr('cursor', 'pointer')
      .attr('transform', `translate(${-NODE_W / 2 + 32},${ry})`)
      .on('click', (ev) => { ev.stopPropagation(); cycleObservation(v); });
    nameG.append('rect').attr('x', -2).attr('y', -10).attr('width', NODE_W - 48).attr('height', 20).attr('fill', 'transparent');
    const nameColor = isObs ? (isHard ? 'var(--accent-hard)' : 'var(--accent-soft)') : 'var(--text)';
    nameG.append('text').attr('y', 4).attr('font-size', '12px').attr('font-weight', '600').attr('fill', nameColor)
      .text(v.name + labelSuffix);

    // ── Row 2: slider or bars ──
    if (dist) {
      if (v.outcomes.length === 2) boolSlider(ng, v, dist, h);
      else multiNode(ng, v, dist, h);
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
  function slotX(nodeX: number, index: number, count: number): number {
    if (count <= 1) return nodeX;
    const span = Math.min(NODE_W - 30, (count - 1) * 20);
    return nodeX - span / 2 + (span * index) / (count - 1);
  }

  // Draw each edge using its slot indices
  for (const cpt of net.cpts) {
    for (const p of cpt.parents) {
      const f = nodePositions.get(p.name)!, t = nodePositions.get(cpt.variable.name)!;

      const outEdges = outgoing.get(p.name)!;
      const outIdx = outEdges.findIndex(e => e.child === cpt.variable);
      const x1 = slotX(f.x, outIdx, outEdges.length);

      const inEdges = incoming.get(cpt.variable.name)!;
      const inIdx = inEdges.findIndex(e => e.parent === p);
      const x2 = slotX(t.x, inIdx, inEdges.length);

      _edgeGroup.append('line')
        .attr('x1', x1).attr('y1', f.y + nodeH(p) / 2)
        .attr('x2', x2).attr('y2', t.y - nodeH(cpt.variable) / 2 - 4)
        .attr('stroke', 'var(--edge)').attr('stroke-width', 1.5).attr('marker-end', 'url(#arr)');
    }
  }
}

/**
 * Snap-zone targets at slider endpoints.
 * If already snapped to this end, shows a cross (clear) button instead.
 */
function addSnapZones(
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  bx: number, by: number, bw: number, barH: number,
  zones: Array<{ x: number; label: string; isSnapped: boolean; snap: () => void; clear: () => void }>,
) {
  for (const z of zones) {
    const action = z.isSnapped ? z.clear : z.snap;
    const tooltip = z.isSnapped ? 'Click to clear observation' : z.label;
    const color = z.isSnapped ? 'var(--accent-hard)' : 'var(--accent)';

    const sz = g.append('g').attr('class', 'cz')
      .attr('transform', `translate(${z.x},${by + barH / 2})`)
      .attr('cursor', 'pointer').attr('opacity', 0)
      .on('click', (ev) => { ev.stopPropagation(); action(); });

    if (z.isSnapped) {
      // Cross (x) icon
      sz.append('circle').attr('r', 8).attr('fill', color).attr('opacity', 0.2);
      sz.append('line').attr('x1', -3).attr('y1', -3).attr('x2', 3).attr('y2', 3)
        .attr('stroke', color).attr('stroke-width', 2).attr('stroke-linecap', 'round');
      sz.append('line').attr('x1', 3).attr('y1', -3).attr('x2', -3).attr('y2', 3)
        .attr('stroke', color).attr('stroke-width', 2).attr('stroke-linecap', 'round');
    } else {
      // Snap target circle
      sz.append('circle').attr('r', 9).attr('fill', color).attr('opacity', 0.25);
      sz.append('circle').attr('r', 5).attr('fill', color).attr('opacity', 0.5);
    }
    sz.append('title').text(tooltip);

    // Wider invisible hover hit area
    const hit = g.append('rect').attr('class', 'cz')
      .attr('x', z.x - 16).attr('y', by - 6).attr('width', 32).attr('height', barH + 12)
      .attr('fill', 'transparent').attr('cursor', 'pointer')
      .on('mouseenter', () => sz.attr('opacity', 1))
      .on('mouseleave', () => sz.attr('opacity', 0))
      .on('click', (ev) => { ev.stopPropagation(); action(); });
    hit.append('title').text(tooltip);
  }
}

function boolSlider(g: d3.Selection<SVGGElement, unknown, null, undefined>, v: Variable, dist: Distribution, h: number) {
  const probTrue = dist.get(v.outcomes[0]) ?? 0;
  const bw = NODE_W - 34, bx = -bw / 2, by = -h / 2 + 33;
  const isObs = observationEnabled.has(v.name);
  const fillVar = isObs ? (hardEvidence.has(v.name) ? 'var(--fill-bar-hard)' : 'var(--fill-bar-soft)') : 'var(--fill-bar)';

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

  // Thumb
  const thumb = g.append('circle').attr('class', 'slider-thumb')
    .attr('cx', bx + bw * tr).attr('cy', by + 5).attr('r', 7)
    .attr('fill', 'var(--thumb)').attr('stroke', fillVar).attr('stroke-width', 2)
    .attr('cursor', 'ew-resize').attr('opacity', isObs ? 1 : 0.4);
  thumb.call(d3.drag<SVGCircleElement, unknown>()
    .on('start', (e) => e.sourceEvent?.stopPropagation())
    .on('drag', function (e) { d3.select(this).attr('cx', Math.max(bx, Math.min(bx + bw, e.x))); })
    .on('end', function (e) { setSlider(v, (Math.max(bx, Math.min(bx + bw, e.x)) - bx) / bw); })
  );

  // Snap zones at 0% (false) and 100% (true)
  const snappedFalse = isObs && hardEvidence.get(v.name) === v.outcomes[1];
  const snappedTrue = isObs && hardEvidence.get(v.name) === v.outcomes[0];
  const clearObs = () => { hardEvidence.delete(v.name); softEvidence.delete(v.name); observationEnabled.delete(v.name); render(); };
  addSnapZones(g, bx, by, bw, 10, [
    { x: bx, label: `Click to observe as ${v.outcomes[1]}`, isSnapped: snappedFalse,
      snap: () => { hardEvidence.set(v.name, v.outcomes[1]); softEvidence.delete(v.name); observationEnabled.add(v.name); render(); },
      clear: clearObs },
    { x: bx + bw, label: `Click to observe as ${v.outcomes[0]}`, isSnapped: snappedTrue,
      snap: () => { hardEvidence.set(v.name, v.outcomes[0]); softEvidence.delete(v.name); observationEnabled.add(v.name); render(); },
      clear: clearObs },
  ]);
}

function multiNode(g: d3.Selection<SVGGElement, unknown, null, undefined>, v: Variable, dist: Distribution, h: number) {
  const bw = NODE_W - 50, bx = -NODE_W / 2 + 10;
  const isObs = observationEnabled.has(v.name);
  let y = -h / 2 + 30;

  for (let i = 0; i < v.outcomes.length; i++) {
    const o = v.outcomes[i], prob = dist.get(o) ?? 0, pct = Math.round(prob * 100);

    // Label (clickable to cycle) + percentage
    const lg = g.append('g').attr('class', 'cz').attr('cursor', 'pointer')
      .attr('transform', `translate(${bx},${y})`)
      .on('click', (ev) => { ev.stopPropagation(); cycleOutcome(v, i); });
    lg.append('rect').attr('x', -2).attr('y', -8).attr('width', NODE_W - 18).attr('height', 14).attr('fill', 'transparent');
    lg.append('text').attr('y', 3).attr('font-size', '10px').attr('fill', 'var(--text-secondary)').text(o);
    lg.append('text').attr('x', NODE_W - 22).attr('y', 3).attr('font-size', '10px').attr('font-weight', '600')
      .attr('fill', 'var(--text)').attr('text-anchor', 'end').text(`${pct}%`);

    // Compute thumb position: evidence weight when observed, posterior otherwise
    const evidenceW = isObs && softEvidence.has(v.name) ? (softEvidence.get(v.name)!.get(o) ?? prob) : prob;
    const thumbPos = isObs && hardEvidence.has(v.name) ? (hardEvidence.get(v.name) === o ? 1 : 0) : evidenceW;

    // Slider bar (click-to-jump + fill matches thumb)
    const by = y + 8;
    const barHit = g.append('rect').attr('x', bx).attr('y', by - 4).attr('width', bw).attr('height', 14)
      .attr('fill', 'transparent').attr('cursor', 'pointer').attr('class', 'cz');
    g.append('rect').attr('x', bx).attr('y', by).attr('width', bw).attr('height', 6)
      .attr('rx', 3).attr('fill', 'var(--bg-bar)').attr('pointer-events', 'none');
    if (thumbPos > 0.005)
      g.append('rect').attr('x', bx).attr('y', by).attr('width', Math.max(3, bw * thumbPos)).attr('height', 6)
        .attr('rx', 3).attr('fill', 'var(--fill-bar)').attr('opacity', 0.6).attr('pointer-events', 'none');
    const outcomeIdx = i;
    barHit.on('click', (ev) => {
      ev.stopPropagation();
      const pt = (ev.target as SVGElement).ownerSVGElement!.createSVGPoint();
      pt.x = ev.clientX; pt.y = ev.clientY;
      const local = pt.matrixTransform((ev.target as SVGGraphicsElement).getScreenCTM()!.inverse());
      const ratio = Math.max(0, Math.min(1, (local.x - bx) / bw));
      hardEvidence.delete(v.name); observationEnabled.add(v.name);
      if (!softEvidence.has(v.name)) softEvidence.set(v.name, new Map(v.outcomes.map(x => [x, 1 / v.outcomes.length])));
      const w = softEvidence.get(v.name)!;
      const otherTotal = [...w].reduce((s, [k, val]) => k === v.outcomes[outcomeIdx] ? s : s + val, 0);
      w.set(v.outcomes[outcomeIdx], ratio);
      if (otherTotal > 0) { const sc = Math.max(0, 1 - ratio) / otherTotal; for (let j = 0; j < v.outcomes.length; j++) if (j !== outcomeIdx) w.set(v.outcomes[j], (w.get(v.outcomes[j]) ?? 0) * sc); }
      if (ratio > 0.995) { hardEvidence.set(v.name, v.outcomes[outcomeIdx]); softEvidence.delete(v.name); }
      render();
    });

    // Slider thumb
    const thumb = g.append('circle').attr('class', 'slider-thumb')
      .attr('cx', bx + bw * thumbPos).attr('cy', by + 3).attr('r', 5)
      .attr('fill', 'var(--thumb)').attr('stroke', 'var(--fill-bar)').attr('stroke-width', 1.5)
      .attr('cursor', 'ew-resize').attr('opacity', isObs ? 1 : 0.3);

    // Snap zones at 0% and 100% for this outcome
    const isSnapped100 = isObs && hardEvidence.get(v.name) === o;
    const isSnapped0 = isObs && softEvidence.has(v.name) && (softEvidence.get(v.name)!.get(o) ?? 1) < 0.01;
    const clearMulti = () => { hardEvidence.delete(v.name); softEvidence.delete(v.name); observationEnabled.delete(v.name); render(); };
    addSnapZones(g, bx, by, bw, 6, [
      { x: bx, label: `Click to exclude ${o}`, isSnapped: isSnapped0,
        snap: () => { hardEvidence.delete(v.name); const w = new Map<string, number>(); v.outcomes.forEach((x, j) => w.set(x, j === i ? 0 : 1 / (v.outcomes.length - 1))); softEvidence.set(v.name, w); observationEnabled.add(v.name); render(); },
        clear: clearMulti },
      { x: bx + bw, label: `Click to observe as ${o}`, isSnapped: isSnapped100,
        snap: () => { hardEvidence.set(v.name, o); softEvidence.delete(v.name); observationEnabled.add(v.name); render(); },
        clear: clearMulti },
    ]);

    const idx = i;
    thumb.call(d3.drag<SVGCircleElement, unknown>()
      .on('start', (e) => e.sourceEvent?.stopPropagation())
      .on('drag', function (e) { d3.select(this).attr('cx', Math.max(bx, Math.min(bx + bw, e.x))); })
      .on('end', function (e) {
        const ratio = (Math.max(bx, Math.min(bx + bw, e.x)) - bx) / bw;
        // Set this outcome's weight, rebalance others proportionally
        hardEvidence.delete(v.name); observationEnabled.add(v.name);
        if (!softEvidence.has(v.name)) softEvidence.set(v.name, new Map(v.outcomes.map(x => [x, 1 / v.outcomes.length])));
        const w = softEvidence.get(v.name)!;
        const otherTotal = [...w].reduce((s, [k, val]) => k === v.outcomes[idx] ? s : s + val, 0);
        w.set(v.outcomes[idx], ratio);
        if (otherTotal > 0) {
          const scale = Math.max(0, 1 - ratio) / otherTotal;
          for (let j = 0; j < v.outcomes.length; j++) if (j !== idx) w.set(v.outcomes[j], (w.get(v.outcomes[j]) ?? 0) * scale);
        }
        // Snap to hard if one is ~1
        if (ratio > 0.995) { hardEvidence.set(v.name, v.outcomes[idx]); softEvidence.delete(v.name); }
        else if (ratio < 0.005) {
          const allUniform = [...w.values()].every((x, _, a) => Math.abs(x - a[0]) < 0.02);
          if (allUniform) { softEvidence.delete(v.name); observationEnabled.delete(v.name); }
        }
        render();
      })
    );

    y += NODE_H_PER_OUTCOME;
  }
}

// Boot: restore from hash or load default
loadStateFromHash().then(ok => { if (!ok) loadExampleFile('dogproblem.xmlbif'); });
