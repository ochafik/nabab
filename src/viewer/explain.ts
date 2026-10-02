/**
 * "Explain" mode: the most probable explanation (MPE) of the current evidence.
 *
 * Runs max-product inference (`mostProbableExplanation`) and the top-k
 * (`kBestExplanations`, k=5) on the active network with the current hard and
 * soft evidence, then marks each node's MPE outcome on its bar and lists the
 * explanations with their log-probabilities in a small panel (click one to
 * highlight it). Only computed while the mode is on, debounced, and memoised
 * on (interventions, evidence).
 */
import { mostProbableExplanation, kBestExplanations, type Explanation } from '../lib/mpe.js';
import { ImpossibleEvidenceError } from '../lib/evidence.js';
import { S, getActive } from './state.js';
import { effectiveEvidence } from './evidence.js';
import { registry } from './bar-registry.js';
import { evidenceKey } from './preview-logic.js';
import { escapeHtml } from './cpt-panel.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const K = 5;
/** If the single MPE takes longer than this, skip the k-best extraction. */
const KBEST_BUDGET_MS = 400;
const DEBOUNCE_MS = 150;

let mode = false;
let explanations: Explanation[] = [];
let selected = 0;
let computedKey = '';
let status = '';
let timer: ReturnType<typeof setTimeout> | null = null;

export function isExplainOn(): boolean { return mode; }

export function toggleExplain(): void {
  mode = !mode;
  document.getElementById('btn-explain')?.classList.toggle('active', mode);
  if (!mode) {
    if (timer) { clearTimeout(timer); timer = null; }
    clearMarks();
    renderPanel();
    return;
  }
  computedKey = '';
  refreshExplain();
}

function currentKey(): string {
  const a = getActive();
  const [he, se] = effectiveEvidence();
  return `${a?.key ?? ''}|${evidenceKey(he, se)}`;
}

/** Called after every render: recompute (debounced) if the evidence changed. */
export function refreshExplain(): void {
  if (!mode || !S.network) { renderPanel(); return; }
  if (currentKey() === computedKey) { renderPanel(); reapplyExplain(); return; }
  status = 'computing…';
  explanations = [];
  renderPanel();
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; compute(); }, DEBOUNCE_MS);
}

function compute(): void {
  const a = getActive();
  if (!a) return;
  const key = currentKey();
  const [he, se] = effectiveEvidence();
  try {
    const t0 = performance.now();
    const best = mostProbableExplanation(a.net.variables, a.net.cpts, he, se);
    const ms = performance.now() - t0;
    explanations = ms < KBEST_BUDGET_MS ? kBestExplanations(a.net.variables, a.net.cpts, K, he, se) : [best];
    if (explanations.length === 0) explanations = [best];
    status = ms < KBEST_BUDGET_MS ? '' : `top-1 only (${Math.round(ms)} ms per query on this network)`;
  } catch (e) {
    explanations = [];
    status = e instanceof ImpossibleEvidenceError ? 'impossible evidence' : `error: ${e instanceof Error ? e.message : String(e)}`;
  }
  selected = 0;
  computedKey = key;
  renderPanel();
  reapplyExplain();
}

function clearMarks(): void {
  for (const node of registry.values()) node.g.node()?.querySelectorAll(':scope > .mpe-mark').forEach(n => n.remove());
}

/** (Re)draw the MPE marks of the selected explanation on the current SVG. */
export function reapplyExplain(): void {
  clearMarks();
  if (!mode || explanations.length === 0 || computedKey !== currentKey()) return;
  const ex = explanations[Math.min(selected, explanations.length - 1)];
  for (const node of registry.values()) {
    const outcome = ex.assignment.get(node.name);
    const g = node.g.node();
    if (outcome === undefined || !g || node.bars.length === 0) continue;
    const layer = document.createElementNS(SVGNS, 'g');
    layer.setAttribute('class', 'mpe-mark');
    layer.setAttribute('pointer-events', 'none');
    const bar = node.bars.length === 1 ? node.bars[0] : node.bars.find(b => b.outcome === outcome);
    if (!bar) continue;
    const rect = document.createElementNS(SVGNS, 'rect');
    for (const [k, v] of Object.entries({
      x: bar.bx - 2, y: bar.by - 3, width: bar.bw + 4, height: bar.barH + 6, rx: 5,
      fill: 'none', stroke: 'var(--pv-mpe)', 'stroke-width': 2,
    })) rect.setAttribute(k, String(v));
    layer.appendChild(rect);
    if (node.bars.length === 1) {
      // Single-slider layout: mark which end (outcome) is the explanation.
      const atRight = outcome === bar.outcome;
      const x = atRight ? bar.x0 + bar.range : bar.x0;
      const tri = document.createElementNS(SVGNS, 'path');
      tri.setAttribute('d', `M${x},${bar.by + bar.barH + 4} l-4,6 l8,0 z`);
      tri.setAttribute('fill', 'var(--pv-mpe)');
      layer.appendChild(tri);
    }
    g.appendChild(layer);
  }
}

function renderPanel(): void {
  const panel = document.getElementById('explain-panel');
  if (!panel) return;
  if (!mode) { panel.classList.remove('visible'); return; }
  let html = `<div class="ex-title">Most probable explanation<button id="ex-close" title="Close">&times;</button></div>`;
  if (explanations.length === 0) {
    html += `<div class="ex-status">${escapeHtml(status || 'no explanation')}</div>`;
  } else {
    const top = explanations[0];
    explanations.forEach((ex, i) => {
      const diff = i === 0 ? '' : ` &middot; ${[...ex.assignment].filter(([k, v]) => top.assignment.get(k) !== v).length} differ from #1`;
      html += `<div class="ex-row${i === selected ? ' sel' : ''}" data-i="${i}"><b>#${i + 1}</b> log p = ${ex.logProbability.toFixed(2)}${diff}</div>`;
    });
    if (status) html += `<div class="ex-status">${escapeHtml(status)}</div>`;
    html += `<div class="ex-status">Marked on each node; log p is the joint log-probability with the evidence.</div>`;
  }
  panel.innerHTML = html;
  panel.classList.add('visible');
  panel.querySelector('#ex-close')?.addEventListener('click', toggleExplain);
  panel.querySelectorAll<HTMLElement>('.ex-row').forEach(row => row.addEventListener('click', () => {
    selected = Number(row.dataset.i);
    renderPanel();
    reapplyExplain();
  }));
}
