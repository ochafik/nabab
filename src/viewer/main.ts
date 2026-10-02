/**
 * Nabab viewer entry: DOM wiring, toolbar, drag-drop/paste, keyboard
 * shortcuts, sensitivity toggle and boot. Rendering, state, loading and
 * persistence live in their own modules under src/viewer/.
 */
import { toXmlBif } from '../lib/xmlbif-writer.js';
import { toJSON } from '../lib/json-export.js';
import { S, IS_MCP, setIntervention } from './state.js';
import { setRerender, rerender } from './render-bus.js';
import { render, autoLayout, fitView } from './graph-render.js';
import { loadExample, loadExampleFile, loadNetwork, learnNetworkFromCsv, loadStateFromHash } from './loading.js';
import { initMcpApp } from './mcp-app.js';
import { initPreview, clearPreview } from './preview.js';
import { initContextMenu, hideContextMenu } from './context-menu.js';
import { toggleExplain } from './explain.js';
import { clearSelection } from './selection.js';

setRerender(render);

// Space: cycle eyes on selected nodes
document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || S.selectedNodes.size === 0) return;
  if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return;
  e.preventDefault();
  const names = [...S.selectedNodes];
  const allOff = names.every(n => !S.observationEnabled.has(n));
  for (const name of names) {
    const v = S.network?.getVariable(name);
    if (!v) continue;
    if (allOff) {
      // All off → turn all on
      S.observationEnabled.add(name);
      if (!S.hardEvidence.has(name) && !S.softEvidence.has(name)) {
        if (S.rememberedHard.has(name)) S.hardEvidence.set(name, S.rememberedHard.get(name)!);
        else if (S.rememberedSoft.has(name)) S.softEvidence.set(name, S.rememberedSoft.get(name)!);
        else S.hardEvidence.set(name, v.outcomes[0]);
      }
    } else {
      // Some or all on → turn all off (remember state)
      if (S.hardEvidence.has(name)) S.rememberedHard.set(name, S.hardEvidence.get(name)!);
      if (S.softEvidence.has(name)) S.rememberedSoft.set(name, S.softEvidence.get(name)!);
      S.observationEnabled.delete(name);
    }
  }
  rerender();
});

// Escape: cancel preview, close menus / help, clear selection. ?: help overlay.
const helpOverlay = document.getElementById('help-overlay');
function toggleHelp(show?: boolean): void {
  helpOverlay?.classList.toggle('visible', show ?? !helpOverlay.classList.contains('visible'));
}
document.addEventListener('keydown', (e) => {
  const tag = (e.target as HTMLElement).tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  if (e.key === 'Escape') {
    clearPreview();
    hideContextMenu();
    toggleHelp(false);
    clearSelection();
  } else if (e.key === '?') {
    toggleHelp();
  }
});
helpOverlay?.addEventListener('click', (e) => { if (e.target === helpOverlay) toggleHelp(false); });
document.getElementById('btn-help')?.addEventListener('click', () => toggleHelp());
document.getElementById('btn-explain')?.addEventListener('click', toggleExplain);
document.getElementById('btn-preview')?.addEventListener('click', () => {
  S.previewEnabled = !S.previewEnabled;
  document.getElementById('btn-preview')!.classList.toggle('active', S.previewEnabled);
  if (!S.previewEnabled) clearPreview();
});
initPreview();
initContextMenu();

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

  function downloadFile(filename: string, content: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  document.getElementById('btn-export-xmlbif')!.addEventListener('click', () => {
    if (!S.network) return;
    downloadFile(`${S.network.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.xmlbif`, toXmlBif(S.network), 'application/xml');
    exportMenu.classList.remove('visible');
  });
  document.getElementById('btn-export-json')!.addEventListener('click', () => {
    if (!S.network) return;
    downloadFile(`${S.network.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`, JSON.stringify(toJSON(S.network), null, 2), 'application/json');
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
          setTimeout(() => {
            try {
              learnNetworkFromCsv(content);
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
      S.hardEvidence = new Map(Object.entries(e.data.evidence));
      for (const k of S.hardEvidence.keys()) S.observationEnabled.add(k);
      rerender();
    } else if (e.data?.type === 'nabab-load-network') loadNetwork(e.data.xmlbif);
  });
}

// Clear evidence button works in both modes
document.getElementById('btn-clear-evidence')?.addEventListener('click', () => {
  S.hardEvidence = new Map(); S.softEvidence = new Map();
  S.observationEnabled = new Set();
  for (const name of [...S.interventions.keys()]) setIntervention(name, null);
  rerender();
});

// Sensitivity mode toggle
document.getElementById('btn-sensitivity')?.addEventListener('click', () => {
  S.sensitivityMode = !S.sensitivityMode;
  const btn = document.getElementById('btn-sensitivity')!;
  btn.classList.toggle('active', S.sensitivityMode);

  if (S.sensitivityMode) {
    // Use first selected node as query, or first variable
    if (S.selectedNodes.size === 1) {
      S.sensitivityQuery = [...S.selectedNodes][0];
    } else if (S.network) {
      S.sensitivityQuery = S.network.variables[0]?.name ?? null;
    }
  } else {
    S.sensitivityQuery = null;
    S.sensitivityInfluence = null;
    S.sensitivityResults = null;
    S.voiResults = null;
  }
  rerender();
});

// ─── Boot ────────────────────────────────────────────────────────────

if (IS_MCP) {
  initMcpApp().catch(console.error);
} else {
  loadStateFromHash().then(ok => { if (!ok) loadExampleFile('dogproblem.xmlbif'); });
}
