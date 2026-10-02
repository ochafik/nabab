/**
 * Loading: examples, XMLBIF/BIF/CSV parsing, drag-drop content and restoring
 * persisted state (URL hash / localStorage).
 */
import { BayesianNetwork } from '../lib/network.js';
import { parseCSV, learnStructure } from '../lib/structure-learning.js';
import type { Variable, CPT } from '../lib/types.js';
import { S, setNetwork, resetEvidenceState, type SerializedState } from './state.js';
import { autoLayout, render, restoreZoom } from './graph-render.js';
import { decompress, applySerializedEvidence } from './persistence.js';

function exampleUrl(filename: string): string {
  if (filename.startsWith('bench/')) {
    // BIF benchmark models live in /bench/models/, CSV samples in /bench/samples/
    const rest = filename.slice('bench/'.length);
    if (rest.endsWith('.csv')) return `/bench/samples/${rest}`;
    return `/bench/models/${rest}`;
  }
  return new URL(`../examples/${filename}`, import.meta.url).href;
}

export async function loadExampleFile(filename: string): Promise<void> {
  const resp = await fetch(exampleUrl(filename));
  if (!resp.ok) throw new Error(`Failed to load ${filename}: ${resp.status}`);
  const content = await resp.text();
  if (filename.endsWith('.csv')) {
    // Structure learning from CSV
    const statusEl = document.getElementById('network-name')!;
    statusEl.textContent = 'Learning structure…';
    await new Promise(r => setTimeout(r, 0)); // let the UI update
    const data = parseCSV(content);
    const parsed = learnStructure(data);
    setNetwork(new BayesianNetwork(parsed));
    resetEvidenceState();
    S.nodePositions = new Map();
    S.currentSource = { type: 'builtin', name: filename };
    statusEl.textContent = S.network!.name;
    autoLayout();
  } else {
    S.currentSource = { type: 'builtin', name: filename };
    loadNetwork(content, false);
  }
}

export async function loadExample(): Promise<void> {
  const select = document.getElementById('example-select') as HTMLSelectElement;
  await loadExampleFile(select.value);
}

export function loadNetwork(content: string, isCustom = true): void {
  setNetwork(BayesianNetwork.parse(content));
  resetEvidenceState();
  S.nodePositions = new Map();
  if (isCustom) S.currentSource = { type: 'custom', xmlbif: content };
  document.getElementById('network-name')!.textContent = S.network!.name;
  autoLayout();
}

/** Learn a network from CSV content (drag-drop / paste). */
export function learnNetworkFromCsv(content: string): void {
  const statusEl = document.getElementById('network-name')!;
  statusEl.textContent = 'Learning structure…';
  const data = parseCSV(content);
  const parsed = learnStructure(data);
  setNetwork(new BayesianNetwork(parsed));
  resetEvidenceState();
  S.nodePositions = new Map();
  S.currentSource = { type: 'custom', xmlbif: parsedNetworkToXmlBif(parsed) };
  statusEl.textContent = S.network!.name;
}

/** Serialize a ParsedNetwork to minimal XMLBIF for hash persistence. */
export function parsedNetworkToXmlBif(p: { name: string; variables: readonly Variable[]; cpts: readonly CPT[] }): string {
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
    xml += `<TABLE>${Array.from(cpt.table).join(' ')}</TABLE>\n</DEFINITION>\n`;
  }
  xml += `</NETWORK>\n</BIF>`;
  return xml;
}

// ─── Restore from URL hash (standalone mode) ─────────────────────────

export async function loadStateFromHash(): Promise<boolean> {
  const hash = location.hash.slice(1);
  if (!hash) return false;
  try {
    const json = await decompress(hash);
    const state: SerializedState = JSON.parse(json);

    // Load network
    if (state.s.t === 'b') {
      S.currentSource = { type: 'builtin', name: state.s.n };
      const select = document.getElementById('example-select') as HTMLSelectElement;
      select.value = state.s.n;
      const resp = await fetch(exampleUrl(state.s.n));
      if (!resp.ok) return false;
      setNetwork(BayesianNetwork.parse(await resp.text()));
    } else {
      S.currentSource = { type: 'custom', xmlbif: state.s.x };
      setNetwork(BayesianNetwork.parse(state.s.x));
    }

    // Restore evidence
    applySerializedEvidence(state);

    // Restore node positions (or auto-layout if none saved)
    S.nodePositions = state.p ? new Map(Object.entries(state.p)) : new Map();

    document.getElementById('network-name')!.textContent = S.network!.name;
    if (S.nodePositions.size === 0) autoLayout();
    else render();

    // Restore zoom transform after render creates the SVG
    if (state.z) restoreZoom(state.z);

    return true;
  } catch {
    return false;
  }
}

// ─── Restore from localStorage (MCP App mode) ────────────────────────

export function restoreSerializedState(state: SerializedState): boolean {
  try {
    if (state.s.t === 'b') {
      S.currentSource = { type: 'builtin', name: state.s.n };
      // In MCP mode we can't fetch example files — need the XMLBIF inline
      if (!state.s.n.includes('<')) return false;
    } else {
      S.currentSource = { type: 'custom', xmlbif: state.s.x };
    }
    const content = state.s.t === 'c' ? state.s.x : null;
    if (!content) return false;
    setNetwork(BayesianNetwork.parse(content));
    applySerializedEvidence(state);
    S.nodePositions = state.p ? new Map(Object.entries(state.p)) : new Map();
    document.getElementById('network-name')!.textContent = S.network!.name;
    if (S.nodePositions.size === 0) autoLayout(); else render();
    return true;
  } catch {
    return false;
  }
}

export function loadStateFromLocalStorage(): boolean {
  try {
    const saved = localStorage.getItem('nabab-state');
    if (!saved) return false;
    return restoreSerializedState(JSON.parse(saved));
  } catch {
    return false;
  }
}
