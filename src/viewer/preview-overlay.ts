/**
 * SVG overlay for the what-if preview: snap ticks on the hovered bar, ghost
 * markers + gain/loss segments on every affected bar, signed delta badges,
 * node halos scaled by total variation, calm (dimmed) unaffected nodes, a
 * spinner for slow inference and the legend / hint line.
 *
 * Everything is drawn into per-node `.pv-layer` groups on top of the existing
 * SVG (pointer-events: none) so a preview never re-renders the graph.
 */
import { registry, type NodeGeom } from './bar-registry.js';
import { SNAPS } from './evidence-model.js';
import { haloStrength, formatDelta, type NodeDelta } from './preview-logic.js';
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
}

function el<K extends keyof SVGElementTagNameMap>(parent: Element, tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent.appendChild(e);
  return e;
}

function layer(node: NodeGeom): SVGGElement {
  const g = node.g.node()!;
  const l = document.createElementNS(SVGNS, 'g');
  l.setAttribute('class', 'pv-layer');
  l.setAttribute('pointer-events', 'none');
  g.appendChild(l);
  return l;
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

/** Remove every preview artefact from the SVG and hide the hint. */
export function clearOverlay(): void {
  for (const node of registry.values()) {
    const g = node.g.node();
    if (!g) continue;
    g.querySelectorAll(':scope > .pv-layer').forEach(n => n.remove());
    g.classList.remove('pv-calm', 'pv-source');
  }
  document.getElementById('graph-container')?.classList.remove('pv-active');
  const hint = document.getElementById('pv-hint');
  if (hint) hint.classList.remove('visible');
}

export function drawOverlay(m: OverlayModel): void {
  clearOverlay();
  const container = document.getElementById('graph-container');
  container?.classList.add('pv-active');
  const src = registry.get(m.sourceName);
  if (!src) return;

  // Source node: ticks, target weights, halo.
  const sl = layer(src);
  src.g.node()!.classList.add('pv-source');
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
      const g = node.g.node()!;
      const strength = haloStrength(d.tvd);
      if (strength === 0) { g.classList.add('pv-calm'); continue; }
      changed++;
      if (!biggest || d.tvd > biggest.tvd) biggest = d;
      const l = layer(node);
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
    for (const [name, node] of registry) if (name !== m.sourceName) node.g.node()!.classList.add('pv-calm');
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
  hint.innerHTML =
    `<b>What if</b> ${escapeHtml(m.targetText)} &mdash; ${status}` +
    `<span class="pv-legend"><i class="pv-chip pv-chip-gain"></i>gain <i class="pv-chip pv-chip-loss"></i>loss <i class="pv-chip pv-chip-halo"></i>size of change</span>` +
    `<span class="pv-keys">click to commit &middot; Esc to cancel</span>`;
  hint.classList.add('visible');
}
