/**
 * What-if hover preview controller.
 *
 * Pointer position over an outcome bar picks a target probability (snapped to
 * 0/25/50/75/100%); the whole network's posteriors under that hypothetical
 * evidence are computed in the background and drawn as an overlay (see
 * preview-overlay.ts). Nothing is committed until the user clicks.
 *
 * Performance: on entering an outcome the snaps of that outcome (and, when
 * inference is fast, of the node's other outcomes) are queued in a
 * PreviewComputer: one inference per macrotask, cached by evidence key,
 * stale work dropped. Networks whose full inference takes > ~40 ms use a Web
 * Worker engine so the UI thread is never blocked; if the exact snap is not
 * ready within ~150 ms the nearest computed one is shown and a spinner runs.
 */
import { S, IS_MCP, getActive } from './state.js';
import { effectiveEvidence, getObs, commitTarget, toggleIntervention } from './evidence.js';
import { SNAPS, snapIndex, targetObs, obsWeights, type VarObs } from './evidence-model.js';
import { registry, hitTestNode, type Hit } from './bar-registry.js';
import { PreviewComputer, type InferFn, type PreviewJob } from './preview-computer.js';
import {
  previewKey, computeDeltas, nearestAvailable, snapPriority, type PosteriorsByName,
} from './preview-logic.js';
import { drawOverlay, clearOverlay } from './preview-overlay.js';
import type { Evidence, LikelihoodEvidence } from '../lib/types.js';
import type { WorkerInferenceEngine } from '../lib/worker-inference.js';
import { toXmlBif } from '../lib/xmlbif-writer.js';

/** Full-inference latency above which previews run in a Web Worker. */
export const WORKER_THRESHOLD_MS = 40;
/** How long to wait for the exact snap before showing the nearest one + a spinner. */
const SPINNER_DELAY_MS = 150;
/** Prefetch other outcomes of the hovered node only while inference is this fast. */
const PREFETCH_OTHERS_MS = 60;
const LONG_PRESS_MS = 450;

let computer: PreviewComputer | null = null;
let computerCtx = '';
let worker: WorkerInferenceEngine | null = null;
const netIds = new WeakMap<object, number>();
let nextNetId = 1;

interface Target { node: string; idx: number; snap: number; zone: 'bar' | 'label'; }
interface JobInfo extends PreviewJob { obs: VarObs; }

let hover: Target | null = null;
let jobMemo = new Map<string, JobInfo>();
let spinnerTimer: ReturnType<typeof setTimeout> | null = null;
let spinnerOn = false;
let swallowClick = false;
let longPress: { timer: ReturnType<typeof setTimeout> | null; x: number; y: number; active: boolean } | null = null;

function context(): string {
  const a = getActive();
  if (!a || !S.network) return '';
  let id = netIds.get(S.network);
  if (!id) { id = nextNetId++; netIds.set(S.network, id); }
  return `${id}|${a.key}`;
}

function byName(post: Map<import('../lib/types.js').Variable, Map<string, number>>): PosteriorsByName {
  const out: PosteriorsByName = new Map();
  for (const [v, d] of post) out.set(v.name, d);
  return out;
}

function disposeWorker(): void {
  if (worker) { worker.terminate(); worker = null; }
}

function makeInfer(): InferFn {
  const active = getActive()!;
  const useWorker = !IS_MCP && typeof Worker !== 'undefined' && S.lastInferMs > WORKER_THRESHOLD_MS;
  if (!useWorker) {
    return async (he?: Evidence, se?: LikelihoodEvidence) => byName(active.engine.infer(he, se).posteriors);
  }
  let ready: Promise<WorkerInferenceEngine> | null = null;
  return async (he, se) => {
    ready ??= import('../lib/worker-inference.js').then(({ WorkerInferenceEngine: W }) => {
      worker = new W(toXmlBif(active.net));
      return worker;
    });
    const w = await ready;
    return (await w.infer(he, se)).posteriors;
  };
}

function getComputer(): PreviewComputer | null {
  const ctx = context();
  if (!ctx) return null;
  if (!computer || computerCtx !== ctx) {
    computer?.cancel();
    disposeWorker();
    computerCtx = ctx;
    computer = new PreviewComputer(makeInfer(), onReady);
  }
  return computer;
}

/** Debug / test hook: the current computer's average inference time. */
export function previewStats(): { avgMs: number; executed: number } {
  return { avgMs: computer?.avgMs ?? 0, executed: computer?.executed ?? 0 };
}

function jobInfo(name: string, idx: number, snap: number): JobInfo | null {
  const mk = `${name}|${idx}|${snap}`;
  const memo = jobMemo.get(mk);
  if (memo) return memo;
  const v = S.network?.getVariable(name);
  if (!v) return null;
  const obs = targetObs(v, idx, SNAPS[snap], getObs(name));
  const [he, se] = effectiveEvidence({ name, obs });
  const info: JobInfo = { key: previewKey(computerCtx, he, se), he, se, obs };
  jobMemo.set(mk, info);
  return info;
}

function prefetch(t: Target): void {
  const c = getComputer();
  const v = S.network?.getVariable(t.node);
  if (!c || !v) return;
  const jobs: JobInfo[] = [];
  const push = (idx: number, snaps: number[]) => {
    for (const s of snaps) { const j = jobInfo(t.node, idx, s); if (j) jobs.push(j); }
  };
  push(t.idx, [t.snap, ...snapPriority(t.snap, SNAPS.length).filter(s => s !== t.snap)]);
  if (c.avgMs < PREFETCH_OTHERS_MS && v.outcomes.length > 2) {
    // Binary variables are one slider: the other outcome is the same set of snaps.
    for (let i = 0; i < v.outcomes.length; i++) if (i !== t.idx) push(i, snapPriority(SNAPS.length - 1, SNAPS.length));
  }
  c.request(jobs);
}

function onReady(key: string): void {
  if (!hover) return;
  const info = jobInfo(hover.node, hover.idx, hover.snap);
  if (info && info.key === key) update();
  else if (spinnerOn) update();
}

function targetText(t: Target, snap: number): string {
  const v = S.network!.getVariable(t.node)!;
  const pct = Math.round(SNAPS[snap] * 100);
  const o = v.outcomes[t.idx];
  if (pct === 100) return `${t.node} = ${o} (hard evidence)`;
  if (pct === 0) return `${t.node} ≠ ${o} (ruled out)`;
  return `P(${t.node} = ${o}) = ${pct}% (soft evidence)`;
}

function update(): void {
  if (!hover || !S.network) { clearOverlay(); return; }
  const c = getComputer();
  const v = S.network.getVariable(hover.node);
  const exact = jobInfo(hover.node, hover.idx, hover.snap);
  if (!c || !v || !exact) return;

  let res = c.get(exact.key);
  let approx = false;
  let shownInfo = exact;
  if (res === undefined) {
    // Fall back to the nearest snap of this outcome that is already computed.
    const avail: number[] = [];
    for (let s = 0; s < SNAPS.length; s++) {
      const j = jobInfo(hover.node, hover.idx, s);
      if (j && c.get(j.key)) avail.push(s);
    }
    const near = nearestAvailable(hover.snap, avail);
    if (near >= 0) {
      shownInfo = jobInfo(hover.node, hover.idx, near)!;
      res = c.get(shownInfo.key);
      approx = true;
    }
  }

  const skip = new Set<string>([hover.node, ...S.interventions.keys()]);
  for (const n of S.observationEnabled) skip.add(n);
  const pending = res === undefined || approx;
  if (pending && !spinnerTimer && !spinnerOn) {
    spinnerTimer = setTimeout(() => { spinnerTimer = null; spinnerOn = true; update(); }, SPINNER_DELAY_MS);
  }
  if (!pending) { spinnerOn = false; if (spinnerTimer) { clearTimeout(spinnerTimer); spinnerTimer = null; } }

  drawOverlay({
    sourceName: hover.node,
    sourceIdx: S.network.getVariable(hover.node)!.outcomes.length === 2 ? 0 : hover.idx,
    snap: hover.snap,
    zone: hover.zone,
    sourceWeights: obsWeights(v, shownInfo.obs),
    targetText: targetText(hover, hover.snap),
    deltas: res ? computeDeltas(S.lastPosteriors, res, skip) : null,
    skip,
    approx,
    spinner: spinnerOn && pending,
    impossible: res === null,
  });
}

function setHover(t: Target | null): void {
  const same = hover && t && hover.node === t.node && hover.idx === t.idx && hover.snap === t.snap && hover.zone === t.zone;
  if (same) return;
  if (!t) { clearPreview(); return; }
  const nodeChanged = hover?.node !== t.node || hover?.idx !== t.idx;
  hover = t;
  if (nodeChanged) { spinnerOn = false; if (spinnerTimer) { clearTimeout(spinnerTimer); spinnerTimer = null; } }
  prefetch(t);
  update();
}

/** Remove the preview and cancel queued work. Safe to call at any time. */
export function clearPreview(): void {
  hover = null;
  spinnerOn = false;
  if (spinnerTimer) { clearTimeout(spinnerTimer); spinnerTimer = null; }
  computer?.cancel();
  clearOverlay();
}

/** Called by render(): the DOM was rebuilt and evidence may have changed. */
export function resetPreviewAfterRender(): void {
  hover = null;
  jobMemo = new Map();
  spinnerOn = false;
  if (spinnerTimer) { clearTimeout(spinnerTimer); spinnerTimer = null; }
  computer?.cancel();
  const hint = document.getElementById('pv-hint');
  if (hint) hint.classList.remove('visible');
}

// ─── Pointer wiring ──────────────────────────────────────────────────

function hitAt(ev: MouseEvent): Hit | null {
  const t = ev.target as Element | null;
  const ng = t?.closest?.('.node-g') as SVGGElement | null;
  const name = ng?.getAttribute('data-var');
  if (!ng || !name) return null;
  const geom = registry.get(name);
  const ctm = ng.getScreenCTM();
  if (!geom || !ctm) return null;
  const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(ctm.inverse());
  return hitTestNode(geom, p.x, p.y);
}

function targetFromHit(hit: Hit): Target | null {
  if (S.interventions.has(hit.node.name)) return null; // do(X): X is fixed
  const v = S.network?.getVariable(hit.node.name);
  if (!v) return null;
  // Single-slider layout: the bar is P(outcomes[0]).
  const idx = v.outcomes.length === 2 ? 0 : hit.bar.idx;
  const snap = hit.zone === 'label' ? SNAPS.length - 1 : snapIndex(hit.fraction);
  return { node: hit.node.name, idx, snap, zone: hit.zone };
}

export function initPreview(): void {
  const container = document.getElementById('graph-container');
  if (!container) return;

  container.addEventListener('pointermove', (ev) => {
    if (!S.previewEnabled) return;
    if (ev.pointerType === 'touch') {
      if (longPress) {
        if (longPress.active) {
          const hit = hitAt(ev);
          const t = hit ? targetFromHit(hit) : null;
          if (t) setHover(t);
        } else if (Math.hypot(ev.clientX - longPress.x, ev.clientY - longPress.y) > 8) {
          if (longPress.timer) clearTimeout(longPress.timer);
          longPress = null;
        }
      }
      return;
    }
    if (ev.buttons) { if (hover) clearPreview(); return; }
    const hit = hitAt(ev);
    const t = hit ? targetFromHit(hit) : null;
    if (t) setHover(t); else if (hover) clearPreview();
  });

  container.addEventListener('pointerleave', (ev) => { if (ev.pointerType !== 'touch') clearPreview(); });

  container.addEventListener('pointerdown', (ev) => {
    if (ev.pointerType === 'touch') {
      if (!S.previewEnabled) return;
      if (longPress?.timer) clearTimeout(longPress.timer);
      const hit = hitAt(ev);
      const t = hit && hit.zone === 'bar' ? targetFromHit(hit) : null;
      if (hover && !t) clearPreview();
      if (!t) { longPress = null; return; }
      const lp = { timer: null as ReturnType<typeof setTimeout> | null, x: ev.clientX, y: ev.clientY, active: false };
      lp.timer = setTimeout(() => { lp.active = true; setHover(t); }, LONG_PRESS_MS);
      longPress = lp;
      return;
    }
    if (hover) clearPreview();
  });

  const endTouch = (ev: PointerEvent) => {
    if (ev.pointerType !== 'touch' || !longPress) return;
    if (longPress.timer) clearTimeout(longPress.timer);
    if (longPress.active) swallowClick = true; // keep the preview; a tap on the bar commits
    longPress = null;
  };
  container.addEventListener('pointerup', endTouch);
  container.addEventListener('pointercancel', endTouch);

  // Capture-phase click: alt-click intervenes; plain bar clicks commit the
  // snapped value the preview showed (instead of the raw click position).
  container.addEventListener('click', (ev) => {
    if (swallowClick) { swallowClick = false; ev.stopPropagation(); ev.preventDefault(); return; }
    const target = ev.target as Element;
    if (target.closest('.slider-thumb')) return;
    const hit = hitAt(ev);
    if (!hit) return;
    const v = S.network?.getVariable(hit.node.name);
    if (!v) return;
    if (ev.altKey) {
      ev.stopPropagation(); ev.preventDefault();
      clearPreview();
      toggleIntervention(v, v.outcomes[v.outcomes.length === 2 && hit.zone === 'bar' ? (hit.fraction >= 0.5 ? 0 : 1) : hit.bar.idx]);
      return;
    }
    if (!S.previewEnabled || hit.zone !== 'bar') return;
    ev.stopPropagation(); ev.preventDefault();
    const idx = v.outcomes.length === 2 ? 0 : hit.bar.idx;
    clearPreview();
    commitTarget(v, idx, SNAPS[snapIndex(hit.fraction)]);
  }, true);
}
