/**
 * MCP App client: interactive Bayesian network viewer.
 * Renders a DAG with probability bars; click nodes to set/cycle/clear evidence.
 * Polls for server-pushed updates (from model-initiated interact calls).
 */
import {
  App,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  type McpUiHostContext,
} from '@modelcontextprotocol/ext-apps';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import dagre from '@dagrejs/dagre';
import './global.css';
import './mcp-app.css';

// ─── Types ──────────────────────────────────────────────────────────

interface VariableInfo {
  name: string;
  outcomes: string[];
  parents: string[];
}

interface NetworkData {
  viewUUID: string;
  network: { name: string; variables: VariableInfo[] };
  posteriors: Record<string, Record<string, number>>;
  evidence: Record<string, string>;
}

interface NababCommand {
  type: 'update';
  data: NetworkData;
}

// ─── DOM refs ───────────────────────────────────────────────────────

const mainEl = document.querySelector('.main') as HTMLElement;
const svgEl = document.getElementById('network-graph') as unknown as SVGSVGElement;
const statusEl = document.getElementById('status') as HTMLElement;
const clearBtn = document.getElementById('clear-btn') as HTMLButtonElement;

// ─── State ──────────────────────────────────────────────────────────

let lastData: NetworkData | null = null;
let currentViewUUID: string | null = null;
let polling = false;

// ─── SVG helpers ────────────────────────────────────────────────────

const SVG_NS = 'http://www.w3.org/2000/svg';

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

// ─── Layout constants ───────────────────────────────────────────────

const NODE_W = 200;
const HEADER_H = 26;
const ROW_H = 20;
const PAD = 10;
const BAR_W = 70;
const LABEL_W = 60;

function nodeHeight(v: VariableInfo) {
  return HEADER_H + v.outcomes.length * ROW_H + PAD * 2;
}

// ─── Render ─────────────────────────────────────────────────────────

function renderNetwork(data: NetworkData) {
  lastData = data;
  if (data.viewUUID) currentViewUUID = data.viewUUID;
  const { network, posteriors, evidence } = data;

  // Clear
  while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);

  if (!network?.variables?.length) {
    statusEl.textContent = 'No network loaded';
    return;
  }

  const evCount = Object.keys(evidence).length;
  statusEl.textContent =
    `${network.name} — ${network.variables.length} vars` +
    (evCount ? ` — ${evCount} observed` : '');

  // Dagre layout
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 30, ranksep: 50, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const v of network.variables) {
    g.setNode(v.name, { width: NODE_W, height: nodeHeight(v) });
  }
  for (const v of network.variables) {
    for (const p of v.parents) g.setEdge(p, v.name);
  }
  dagre.layout(g);

  const gi = g.graph();
  const gw = (gi.width ?? 400) + 10;
  const gh = (gi.height ?? 300) + 10;
  svgEl.setAttribute('viewBox', `0 0 ${gw} ${gh}`);

  // Defs: arrowhead
  const defs = svg('defs');
  const marker = svg('marker', {
    id: 'arrow',
    markerWidth: 8,
    markerHeight: 6,
    refX: 8,
    refY: 3,
    orient: 'auto',
  });
  marker.appendChild(svg('polygon', { points: '0 0, 8 3, 0 6', class: 'edge-arrow' }));
  defs.appendChild(marker);
  svgEl.appendChild(defs);

  // Edges
  for (const e of g.edges()) {
    const edge = g.edge(e);
    const pts = edge.points;
    const d = pts.map((p: { x: number; y: number }, i: number) =>
      `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`
    ).join(' ');
    svgEl.appendChild(svg('path', { d, class: 'edge-path', 'marker-end': 'url(#arrow)' }));
  }

  // Nodes
  for (const v of network.variables) {
    const nd = g.node(v.name);
    const h = nodeHeight(v);
    const ox = nd.x - NODE_W / 2;
    const oy = nd.y - h / 2;
    const isEv = v.name in evidence;

    const group = svg('g', { transform: `translate(${ox},${oy})` });
    group.classList.add('node');

    // Background
    const bg = svg('rect', { width: NODE_W, height: h, rx: 6, ry: 6 });
    bg.classList.add('node-bg');
    if (isEv) bg.classList.add('evidenced');
    group.appendChild(bg);

    // Header
    const nameEl = svg('text', { x: NODE_W / 2, y: PAD + 14, 'text-anchor': 'middle' });
    nameEl.classList.add('node-name');
    nameEl.textContent = v.name;
    group.appendChild(nameEl);

    // Outcomes
    const probs = posteriors[v.name] ?? {};
    v.outcomes.forEach((outcome, i) => {
      const y = HEADER_H + PAD + i * ROW_H;
      const prob = probs[outcome] ?? 0;

      // Label
      const label = svg('text', { x: PAD, y: y + 14 });
      label.classList.add('outcome-label');
      if (isEv && evidence[v.name] === outcome) label.classList.add('evidenced');
      label.textContent = outcome.length > 8 ? outcome.slice(0, 7) + '…' : outcome;
      group.appendChild(label);

      // Bar bg
      const barX = LABEL_W + PAD;
      group.appendChild(svg('rect', { x: barX, y: y + 3, width: BAR_W, height: 13, class: 'bar-bg' }));

      // Bar fill
      group.appendChild(svg('rect', { x: barX, y: y + 3, width: Math.max(0, BAR_W * prob), height: 13, class: 'bar-fill' }));

      // Pct
      const pct = svg('text', { x: NODE_W - PAD, y: y + 14, 'text-anchor': 'end' });
      pct.classList.add('pct-text');
      pct.textContent = `${(prob * 100).toFixed(0)}%`;
      group.appendChild(pct);
    });

    // Click → cycle evidence via interact tool
    group.addEventListener('click', () => handleNodeClick(v.name, v.outcomes, evidence[v.name]));

    svgEl.appendChild(group);
  }

  // Start polling for model-initiated commands once we have a viewUUID
  if (currentViewUUID && !polling) startPollLoop();
}

// ─── Interactions ───────────────────────────────────────────────────

async function handleNodeClick(variable: string, outcomes: string[], current?: string) {
  if (!currentViewUUID) return;

  try {
    let action: string;
    let value: string | undefined;

    if (current) {
      const idx = outcomes.indexOf(current);
      if (idx >= outcomes.length - 1) {
        action = 'clear_evidence';
      } else {
        action = 'set_evidence';
        value = outcomes[idx + 1];
      }
    } else {
      action = 'set_evidence';
      value = outcomes[0];
    }

    const args: Record<string, string> = { viewUUID: currentViewUUID, action, variable };
    if (value !== undefined) args.value = value;

    const result = await app.callServerTool({ name: 'interact', arguments: args });
    if (result.structuredContent) renderNetwork(result.structuredContent as NetworkData);
  } catch (e) {
    console.error('Evidence update failed:', e);
  }
}

async function handleClearAll() {
  if (!currentViewUUID) return;

  try {
    const result = await app.callServerTool({
      name: 'interact',
      arguments: { viewUUID: currentViewUUID, action: 'clear_evidence' },
    });
    if (result.structuredContent) renderNetwork(result.structuredContent as NetworkData);
  } catch (e) {
    console.error('Clear failed:', e);
  }
}

clearBtn.addEventListener('click', handleClearAll);

// ─── Poll loop for model-initiated commands ─────────────────────────

async function startPollLoop() {
  if (polling) return;
  polling = true;

  while (currentViewUUID) {
    try {
      const result = await app.callServerTool({
        name: 'poll_commands',
        arguments: { viewUUID: currentViewUUID },
      });
      const sc = result.structuredContent as { commands?: NababCommand[] } | undefined;
      if (sc?.commands) {
        for (const cmd of sc.commands) {
          if (cmd.type === 'update' && cmd.data) {
            renderNetwork(cmd.data);
          }
        }
      }
    } catch (e) {
      console.error('Poll error:', e);
      // Backoff on error
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  polling = false;
}

// ─── MCP App lifecycle ──────────────────────────────────────────────

const app = new App({ name: 'Nabab Network Viewer', version: '1.0.0' });

app.ontoolresult = (result) => {
  const data = (result.structuredContent as NetworkData) ?? null;
  if (data?.network) renderNetwork(data);
};

app.ontoolinput = () => {
  statusEl.textContent = 'Computing…';
};

app.ontoolcancelled = () => {
  statusEl.textContent = lastData ? `${lastData.network.name}` : 'Query cancelled';
};

app.onerror = console.error;

app.onhostcontextchanged = (ctx: McpUiHostContext) => {
  if (ctx.theme) applyDocumentTheme(ctx.theme);
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
  if (ctx.styles?.css?.fonts) applyHostFonts(ctx.styles.css.fonts);
  if (ctx.safeAreaInsets) {
    const { top, right, bottom, left } = ctx.safeAreaInsets;
    mainEl.style.padding = `${top}px ${right}px ${bottom}px ${left}px`;
  }
};

app.onteardown = async () => {
  currentViewUUID = null; // Stop poll loop
  return {};
};

app.connect().then(() => {
  const ctx = app.getHostContext();
  if (ctx) app.onhostcontextchanged?.(ctx);
});
