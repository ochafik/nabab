/**
 * "Most likely scenario" mode: the jointly most likely full assignments
 * (k-best MPE, k=5) of the unobserved variables given the current evidence.
 *
 * - Panel: each scenario with P(x | e) = exp(log P(x, e)) / P(e), its share of
 *   the top-k mass, and the assignments as chips (scenario #1: where it
 *   differs from each node's own most likely value; later ones: where they
 *   differ from #1). "Apply" commits a scenario as hard evidence.
 * - Graph: the selected scenario is drawn in its own overlay layer
 *   (`#sc-layer`, positioned from bar-registry geometry, never touching node
 *   groups) and only marks nodes whose scenario value differs from their
 *   marginal argmax.
 * - Hover: a row previews the scenario as hypothetical hard evidence through
 *   the what-if overlay (`#pv-layer`).
 *
 * Only computed while the mode is on, debounced, memoised on
 * (interventions, evidence); the single MPE keeps the k-best time budget.
 */
import { mostProbableExplanation, kBestExplanations, type Explanation } from '../lib/mpe.js';
import { ImpossibleEvidenceError } from '../lib/evidence.js';
import { S, getActive } from './state.js';
import { effectiveEvidence, observeAllHard } from './evidence.js';
import { registry } from './bar-registry.js';
import { evidenceKey, computeDeltas } from './preview-logic.js';
import { drawScenarioPreview, clearOverlay } from './preview-overlay.js';
import { escapeHtml } from './cpt-panel.js';
import {
  scenarioProbabilities, coveredMass, diffAssignments, diffFromMarginal, scenarioVariables,
  formatChip, formatPercent, pillText, oneHotPosteriors, type ScenarioProb, type Assign,
} from './scenario-logic.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const K = 5;
/** If the single MPE takes longer than this, skip the k-best extraction. */
const KBEST_BUDGET_MS = 400;
const DEBOUNCE_MS = 150;
const COLOR = 'var(--pv-mpe)';

let mode = false;
let scenarios: Explanation[] = [];
let probs: ScenarioProb[] = [];
let scVars: string[] = [];
let selected = 0;
let showAll = false;
let hovered = -1;
let computedKey = '';
let status = '';
let impossible = false;
let timer: ReturnType<typeof setTimeout> | null = null;

export function isExplainOn(): boolean { return mode; }

function syncButton(): void {
  const btn = document.getElementById('btn-explain') as HTMLButtonElement | null;
  if (!btn) return;
  const off = !!S.inferenceError;
  btn.disabled = off;
  btn.title = off
    ? 'Unavailable: this network is too large for exact inference (structure-only view)'
    : 'Most likely scenario: the jointly most likely values of all unobserved variables given the evidence (top 5)';
}

export function toggleExplain(): void {
  if (!mode && S.inferenceError) return;
  mode = !mode;
  document.getElementById('btn-explain')?.classList.toggle('active', mode);
  if (!mode) {
    if (timer) { clearTimeout(timer); timer = null; }
    endHover();
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
  syncButton();
  if (mode && S.inferenceError) {
    mode = false;
    document.getElementById('btn-explain')?.classList.remove('active');
  }
  if (!mode || !S.network) { renderPanel(); return; }
  if (currentKey() === computedKey) { renderPanel(); reapplyExplain(); return; }
  status = 'computing…';
  impossible = false;
  scenarios = [];
  clearMarks();
  renderPanel();
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; compute(); }, DEBOUNCE_MS);
}

function compute(): void {
  const a = getActive();
  if (!a) return;
  const key = currentKey();
  const [he, se] = effectiveEvidence();
  impossible = false;
  try {
    const t0 = performance.now();
    const best = mostProbableExplanation(a.net.variables, a.net.cpts, he, se);
    const ms = performance.now() - t0;
    scenarios = ms < KBEST_BUDGET_MS ? kBestExplanations(a.net.variables, a.net.cpts, K, he, se) : [best];
    if (scenarios.length === 0) scenarios = [best];
    // P(e) from the same evidence (soft evidence enters it as likelihood weights, as in mpe.ts).
    const pe = a.engine.infer(he, se).probabilityOfEvidence;
    probs = scenarioProbabilities(scenarios, pe);
    const observed = new Set<string>([...(he?.keys() ?? []), ...(se?.keys() ?? [])]);
    scVars = scenarioVariables(a.net.variables.map(v => v.name), observed, new Set(S.interventions.keys()));
    status = ms < KBEST_BUDGET_MS ? '' : `Only the best scenario is shown (${Math.round(ms)} ms per query on this network).`;
  } catch (e) {
    scenarios = [];
    probs = [];
    if (e instanceof ImpossibleEvidenceError) {
      impossible = true;
      status = 'Impossible evidence: the observations contradict each other, so no scenario exists. Clear or change one of them.';
    } else {
      status = `error: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  selected = 0;
  computedKey = key;
  renderPanel();
  reapplyExplain();
}

// ─── Graph marks (own overlay layer) ─────────────────────────────────

function clearMarks(): void {
  document.getElementById('sc-layer')?.remove();
}

function mk<K extends keyof SVGElementTagNameMap>(parent: Element, tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent.appendChild(e);
  return e;
}

/** The scenario layer: a sibling placed just under `#pv-layer`, so previews draw above it. */
function ensureLayer(): SVGGElement | null {
  const pv = document.getElementById('pv-layer');
  if (!pv || !pv.parentNode) return null;
  let l = document.getElementById('sc-layer') as SVGGElement | null;
  if (!l) {
    l = document.createElementNS(SVGNS, 'g');
    l.setAttribute('id', 'sc-layer');
    l.setAttribute('pointer-events', 'none');
  }
  if (l.nextSibling !== pv) pv.parentNode.insertBefore(l, pv);
  l.replaceChildren();
  return l;
}

/** (Re)draw the marks of the selected scenario on the current SVG: only where it disagrees with the node's marginal. */
export function reapplyExplain(): void {
  clearMarks();
  if (!mode || scenarios.length === 0 || computedKey !== currentKey()) return;
  const layer = ensureLayer();
  if (!layer) return;
  const sc = scenarios[Math.min(selected, scenarios.length - 1)];
  for (const d of diffFromMarginal(sc.assignment, S.lastPosteriors, scVars)) {
    const node = registry.get(d.name);
    if (!node) continue;
    const l = mk(layer, 'g', { transform: `translate(${node.x},${node.y})` });
    // Outline of the scenario's outcome bar (when the bar exists; it may be capped away).
    const bar = node.bars.length === 1 ? node.bars[0] : node.bars.find(b => b.outcome === d.outcome);
    if (bar) {
      mk(l, 'rect', {
        x: bar.bx - 2, y: bar.by - 3, width: bar.bw + 4, height: bar.barH + 6, rx: 5,
        fill: 'none', stroke: COLOR, 'stroke-width': 2.2,
      });
      if (node.bars.length === 1) {
        // Single-slider layout: mark which end is the scenario's outcome.
        const x = d.outcome === bar.outcome ? bar.x0 + bar.range : bar.x0;
        mk(l, 'path', { d: `M${x},${bar.by + bar.barH + 4} l-4,6 l8,0 z`, fill: COLOR });
      }
    }
    // Pill on the node's bottom edge, always present (shows the value even without a bar).
    const text = pillText(d.outcome);
    const w = text.length * 5.3 + 10;
    const x = node.w / 2 - 6 - w;
    const y = node.h / 2 - 7;
    const title = mk(l, 'title', {});
    title.textContent = `Most likely scenario: ${d.name} = ${d.outcome} (alone, ${d.name} is most likely ${d.marginal})`;
    mk(l, 'rect', { x, y, width: w, height: 14, rx: 7, fill: COLOR });
    const t = mk(l, 'text', {
      x: x + w / 2, y: y + 7, 'text-anchor': 'middle', 'dominant-baseline': 'central',
      'font-size': 9, 'font-weight': 700, fill: 'var(--bg)',
    });
    t.textContent = text;
  }
}

// ─── Hover preview ───────────────────────────────────────────────────

function endHover(): void {
  if (hovered >= 0) { hovered = -1; clearOverlay(); }
}

function startHover(i: number): void {
  const sc = scenarios[i];
  const net = S.network;
  if (!sc || !net) return;
  hovered = i;
  const after = oneHotPosteriors(sc.assignment, n => net.getVariable(n)?.outcomes, scVars);
  const deltas = computeDeltas(S.lastPosteriors, after);
  const surprises = diffFromMarginal(sc.assignment, S.lastPosteriors, scVars).length;
  drawScenarioPreview(
    deltas,
    `<b>What if</b> scenario #${i + 1} were true (${formatPercent(probs[i].p)}) &mdash; ${scVars.length} variable${scVars.length === 1 ? '' : 's'} fixed; ${surprises} differ from their own most likely value` +
    `<span class="pv-keys">leave the row to restore</span>`,
  );
}

// ─── Panel ───────────────────────────────────────────────────────────

function chipHtml(a: Assign, cls: string, title?: string): string {
  return `<span class="ex-chip ${cls}"${title ? ` title="${escapeHtml(title)}"` : ''}>${escapeHtml(formatChip(a))}</span>`;
}

function rowChips(i: number): string {
  const sc = scenarios[i];
  if (i === 0) {
    const surprises = diffFromMarginal(sc.assignment, S.lastPosteriors, scVars);
    const marg = new Map(surprises.map(s => [s.name, s.marginal]));
    if (showAll) {
      return scVars.map(n => {
        const a = { name: n, outcome: sc.assignment.get(n) ?? '?' };
        return marg.has(n)
          ? chipHtml(a, 'hl', `alone, ${n} is most likely ${marg.get(n)}`)
          : chipHtml(a, '');
      }).join('');
    }
    if (surprises.length === 0) return `<span class="ex-none">Every variable takes its own most likely value.</span>`;
    return surprises.map(s => chipHtml(s, 'hl', `alone, ${s.name} is most likely ${s.marginal}`)).join('');
  }
  const diff = diffAssignments(sc.assignment, scenarios[0].assignment, scVars);
  if (diff.length === 0) return `<span class="ex-none">Same as #1 on the shown variables.</span>`;
  return diff.map(a => chipHtml(a, 'hl', `#1 has ${a.name} = ${scenarios[0].assignment.get(a.name)}`)).join('');
}

function renderPanel(): void {
  const panel = document.getElementById('explain-panel');
  if (!panel) return;
  endHover();
  if (!mode) { panel.classList.remove('visible'); return; }
  let html = `<div class="ex-title">Most likely scenario<button id="ex-close" title="Close">&times;</button></div>`;
  if (scenarios.length > 0 && scVars.length === 0) {
    html += `<div class="ex-status">Every variable is observed or intervened on: there is nothing left to explain.</div>`;
  } else if (scenarios.length === 0) {
    html += `<div class="${impossible ? 'ex-status ex-warn' : 'ex-status'}">${escapeHtml(status || 'no scenario')}</div>`;
  } else {
    const n = scenarios.length;
    html += `<div class="ex-sub">The top ${n} full assignments of the ${scVars.length} unobserved variable${scVars.length === 1 ? '' : 's'} cover <b>${formatPercent(coveredMass(probs))}</b> of the probability given the evidence.` +
      ` <label class="ex-all"><input type="checkbox" id="ex-all"${showAll ? ' checked' : ''}> all of #1</label></div>`;
    html += `<div class="ex-list">`;
    scenarios.forEach((_, i) => {
      const pr = probs[i];
      const share = n > 1 ? `<span class="ex-share">${formatPercent(pr.share)} of top ${n}</span>` : '';
      html += `<div class="ex-row${i === selected ? ' sel' : ''}" data-i="${i}">` +
        `<div class="ex-head"><b>#${i + 1}</b><span class="ex-pct" title="P(this full assignment | evidence)">${formatPercent(pr.p)}</span>${share}` +
        `<button class="ex-apply" data-i="${i}" title="Observe these ${scVars.length} values as hard evidence">Apply</button></div>` +
        `<div class="ex-chips">${rowChips(i)}</div></div>`;
    });
    html += `</div>`;
    if (status) html += `<div class="ex-status">${escapeHtml(status)}</div>`;
    html += `<div class="ex-status">Badges on the graph mark nodes whose value in the selected scenario differs from their own most likely value. Hover a row to preview it.</div>`;
  }
  panel.innerHTML = html;
  panel.classList.add('visible');
  panel.querySelector('#ex-close')?.addEventListener('click', toggleExplain);
  panel.querySelector('#ex-all')?.addEventListener('change', (ev) => {
    showAll = (ev.target as HTMLInputElement).checked;
    renderPanel();
  });
  panel.querySelectorAll<HTMLElement>('.ex-row').forEach(row => {
    const i = Number(row.dataset.i);
    row.addEventListener('click', () => {
      selected = i;
      panel.querySelectorAll('.ex-row').forEach(r => r.classList.toggle('sel', r === row));
      reapplyExplain();
    });
    row.addEventListener('mouseenter', () => startHover(i));
    row.addEventListener('mouseleave', () => { if (hovered === i) endHover(); });
  });
  panel.querySelectorAll<HTMLElement>('.ex-apply').forEach(btn => btn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    applyScenario(Number(btn.dataset.i));
  }));
}

/** Commit scenario `i` as hard evidence on its unobserved variables (the normal evidence path). */
export function applyScenario(i: number): void {
  const sc = scenarios[i];
  const net = S.network;
  if (!sc || !net || computedKey !== currentKey()) return;
  endHover();
  const entries: Array<[import('../lib/types.js').Variable, string]> = [];
  for (const n of scVars) {
    const v = net.getVariable(n);
    const o = sc.assignment.get(n);
    if (v && o !== undefined) entries.push([v, o]);
  }
  observeAllHard(entries);
}
