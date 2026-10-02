/**
 * Overlay for the what-if preview: snap ticks on the hovered bar, ghost
 * markers + gain/loss segments on every affected bar, signed delta badges,
 * node halos scaled by total variation, a veil over unaffected nodes, a
 * spinner for slow inference, and a floating hint.
 *
 * Contract: a preview NEVER touches the graph. Everything is drawn into the
 * single `<g id="pv-layer">` (last child of the pan/zoom group, pointer-events
 * none) from geometry cached at render time (bar-registry), plus the fixed
 * #pv-hint box. No node group, class, text or attribute outside those two is
 * modified, no layout-forcing property is read, and drawing is coalesced to
 * one pass per animation frame.
 */
import { registry, type NodeGeom } from './bar-registry.js';
import { SNAPS } from './evidence-model.js';
import { haloStrength, formatDelta, hintSide, type NodeDelta } from './preview-logic.js';
import { escapeHtml } from './cpt-panel.js';

const SVGNS = 'http://www.w3.org/2000/svg';

export interface OverlayModel {
  sourceName: string;
  sourceIdx: number;
  /** Snap index of the target (ignored for tick drawing when zone is 'label'). */
  snap: number;
  zone: 'bar' | 'label';
  /** Target weights of the hovered variable after the previewed gesture. */
  sourceWeights: Map<string, number>;
  /** Human text for the target, e.g. "P(cough = yes) = 75%". */
  targetText: string;
  /** Deltas per other node (null while nothing is computed yet). */
  deltas: Map<string, NodeDelta> | null;
  /** Nodes that never get a ghost (observed / intervened / hovered). */
  skip: ReadonlySet<string>;
  /** Showing the nearest computed snap instead of the exact one. */
  approx: boolean;
  spinner: boolean;
  impossible: boolean;
  /** Pointer x in viewport pixels (places the hint away from it). */
  pointerX: number;
}

function el<K extends keyof SVGElementTagNameMap>(parent: Element, tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent.appendChild(e);
  return e;
}

/** Per-node sub-group of the overlay layer, in the node's local coordinates. */
function nodeLayer(root: SVGGElement, node: NodeGeom): SVGGElement {
  return el(root, 'g', { transform: `translate(${node.x},${node.y})` });
}

function ghost(l: SVGGElement, bar: { x0: number; range: number; by: number; barH: number; val: number }, after: number): void {
  const xa = bar.x0 + bar.range * bar.val;
  const xb = bar.x0 + bar.range * Math.max(0, Math.min(1, after));
  const d = after - bar.val;
  if (Math.abs(xb - xa) >= 0.5) {
    el(l, 'rect', {
      x: Math.min(xa, xb), y: bar.by - 1, width: Math.abs(xb - xa), height: bar.barH + 2, rx: 2,
      fill: d > 0 ? 'var(--pv-gain)' : 'var(--pv-loss)', opacity: 0.85,
    });
  }
  el(l, 'line', {
    x1: xb, x2: xb, y1: bar.by - 3, y2: bar.by + bar.barH + 3,
    stroke: 'var(--text)', 'stroke-width': 1.6, 'stroke-linecap': 'round', opacity: 0.9,
  });
}

function badge(l: SVGGElement, node: NodeGeom, text: string, color: string): void {
  const w = Math.max(26, text.length * 5.4 + 8);
  const x = node.w / 2 - 6 - w;
  const y = -node.h / 2 - 7;
  el(l, 'rect', { x, y, width: w, height: 14, rx: 7, fill: 'var(--bg-surface)', stroke: color, 'stroke-width': 1 });
  const t = el(l, 'text', {
    x: x + w / 2, y: y + 7, 'text-anchor': 'middle', 'dominant-baseline': 'central',
    'font-size': 9, 'font-weight': 700, fill: color,
  });
  t.textContent = text;
}

function spinner(l: SVGGElement, node: NodeGeom): void {
  const g = el(l, 'g', { transform: `translate(${node.w / 2 - 14},${node.headerY})` });
  el(g, 'circle', { r: 6, fill: 'none', stroke: 'var(--border-node)', 'stroke-width': 2 });
  el(g, 'path', { d: 'M0,-6 A6,6 0 0 1 6,0', fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2, 'stroke-linecap': 'round', class: 'pv-spin' });
}

/** Translucent background-coloured veil: dims an unaffected node without touching it. */
function veil(parent: Element, node: NodeGeom): void {
  el(parent, 'rect', {
    x: node.x - node.w / 2 - 2, y: node.y - node.h / 2 - 2, width: node.w + 4, height: node.h + 4, rx: 10,
    fill: 'var(--bg)', opacity: 0.6,
  });
}

let pending: OverlayModel | null = null;
let frame = 0;
let side: 'left' | 'right' | null = null;
let lastHint = '';
let viewportW = typeof window !== 'undefined' ? window.innerWidth : 1000;
if (typeof window !== 'undefined') window.addEventListener('resize', () => { viewportW = window.innerWidth; });

/** Remove every preview artefact (one `replaceChildren`) and hide the hint. */
export function clearOverlay(): void {
  pending = null;
  if (frame) { cancelAnimationFrame(frame); frame = 0; }
  const root = document.getElementById('pv-layer');
  if (root && root.firstChild) root.replaceChildren();
  const hint = document.getElementById('pv-hint');
  if (hint && hint.classList.contains('visible')) hint.classList.remove('visible');
  lastHint = '';
}

/** Schedule a (coalesced) redraw: at most one pass per animation frame. */
export function drawOverlay(m: OverlayModel): void {
  pending = m;
  if (!frame) frame = requestAnimationFrame(flush);
}

function flush(): void {
  frame = 0;
  const m = pending;
  pending = null;
  if (m) paint(m);
}

function paint(m: OverlayModel): void {
  const root = document.getElementById('pv-layer') as SVGGElement | null;
  const src = registry.get(m.sourceName);
  if (!root || !src) return;
  root.replaceChildren();
  const veils = el(root, 'g', {});

  // Source node: halo, ticks, target weights.
  const sl = nodeLayer(root, src);
  el(sl, 'rect', {
    x: -src.w / 2 - 3, y: -src.h / 2 - 3, width: src.w + 6, height: src.h + 6, rx: 10,
    fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2, 'stroke-dasharray': '5,3', opacity: 0.9,
  });
  const hovered = src.bars[m.sourceIdx] ?? src.bars.find(b => b.idx === m.sourceIdx);
  for (const bar of src.bars) {
    const isHovered = bar === hovered;
    const target = m.sourceWeights.get(bar.outcome);
    if (target !== undefined && !m.impossible) ghost(sl, bar, target);
    if (isHovered && m.zone === 'bar') {
      SNAPS.forEach((s, i) => {
        const x = bar.x0 + bar.range * s;
        el(sl, 'line', {
          x1: x, x2: x, y1: bar.by - 4, y2: bar.by + bar.barH + 4,
          stroke: i === m.snap ? 'var(--accent)' : 'var(--text-dim)',
          'stroke-width': i === m.snap ? 2 : 1, opacity: i === m.snap ? 1 : 0.55,
        });
      });
      const t = el(sl, 'text', {
        x: Math.max(bar.bx + 10, Math.min(bar.bx + bar.bw - 10, bar.x0 + bar.range * SNAPS[m.snap])),
        y: bar.by - 6, 'text-anchor': 'middle', 'font-size': 9, 'font-weight': 700, fill: 'var(--accent)',
      });
      t.textContent = `${Math.round(SNAPS[m.snap] * 100)}%`;
    } else if (isHovered) {
      el(sl, 'rect', {
        x: bar.bx - 2, y: bar.by - 3, width: bar.bw + 4, height: bar.barH + 6, rx: 4,
        fill: 'none', stroke: 'var(--accent)', 'stroke-width': 1.2, opacity: 0.8,
      });
    }
  }
  if (m.spinner) spinner(sl, src);

  // Other nodes.
  let changed = 0;
  let biggest: NodeDelta | null = null;
  if (m.deltas && !m.impossible) {
    for (const [name, d] of m.deltas) {
      const node = registry.get(name);
      if (!node || m.skip.has(name)) continue;
      const strength = haloStrength(d.tvd);
      if (strength === 0) { veil(veils, node); continue; }
      changed++;
      if (!biggest || d.tvd > biggest.tvd) biggest = d;
      const l = nodeLayer(root, node);
      el(l, 'rect', {
        x: -node.w / 2 - 3, y: -node.h / 2 - 3, width: node.w + 6, height: node.h + 6, rx: 10,
        fill: 'none', stroke: 'var(--pv-halo)', 'stroke-width': 1.5 + 4 * strength, opacity: 0.25 + 0.7 * strength,
      });
      for (const bar of node.bars) {
        const after = bar.val + (d.deltas.get(bar.outcome) ?? 0);
        ghost(l, bar, after);
      }
      if (Math.abs(d.maxDelta) >= 0.005) {
        const multi = node.bars.length > 1;
        // Single-slider nodes show the bar's own outcome so the badge matches the tinted segment.
        const delta = multi ? d.maxDelta : (d.deltas.get(node.bars[0]?.outcome ?? '') ?? d.maxDelta);
        const label = multi ? `${formatDelta(delta)} ${d.maxOutcome.length > 9 ? d.maxOutcome.slice(0, 8) + '…' : d.maxOutcome}` : formatDelta(delta);
        badge(l, node, label, delta > 0 ? 'var(--pv-gain-text)' : 'var(--pv-loss-text)');
      }
    }
  } else if (m.impossible) {
    for (const [name, node] of registry) if (name !== m.sourceName) veil(veils, node);
  }
  updateHint(m, changed, biggest);
}

function updateHint(m: OverlayModel, changed: number, biggest: NodeDelta | null): void {
  const hint = document.getElementById('pv-hint');
  if (!hint) return;
  let status: string;
  if (m.impossible) status = '<span class="pv-warn">impossible: contradicts the current evidence</span>';
  else if (!m.deltas) status = 'computing…';
  else if (changed === 0) status = 'no other node changes';
  else {
    status = `${changed} node${changed === 1 ? '' : 's'} change`;
    if (biggest) status += `; largest: <b>${escapeHtml(biggest.name)}</b> ${escapeHtml(biggest.maxOutcome)} ${formatDelta(biggest.maxDelta)}`;
  }
  if (m.approx) status += ' <i>(nearest computed value)</i>';
  const html =
    `<b>What if</b> ${escapeHtml(m.targetText)} &mdash; ${status}` +
    `<span class="pv-legend"><i class="pv-chip pv-chip-gain"></i>gain <i class="pv-chip pv-chip-loss"></i>loss <i class="pv-chip pv-chip-halo"></i>size of change</span>` +
    `<span class="pv-keys">click to commit &middot; Esc to cancel</span>`;
  if (html !== lastHint) { hint.innerHTML = html; lastHint = html; }
  // Float in the top corner opposite the pointer: never over the hovered node.
  const next = hintSide(m.pointerX, viewportW, side);
  if (next !== side) {
    side = next;
    hint.classList.toggle('pv-left', next === 'left');
    hint.classList.toggle('pv-right', next === 'right');
  }
  if (!hint.classList.contains('visible')) hint.classList.add('visible');
}
