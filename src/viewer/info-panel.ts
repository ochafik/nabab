/** Info panel: Value-of-Information / CPT / sensitivity tabs for the selection. */
import { S } from './state.js';
import { rerender } from './render-bus.js';
import { buildCptHtml, escapeHtml } from './cpt-panel.js';

let activeInfoTab = 'voi';

export function renderInfoPanel(): void {
  const panel = document.getElementById('info-panel');
  if (!panel) return;

  if (!S.network || S.selectedNodes.size === 0) {
    panel.classList.remove('visible');
    return;
  }

  const selected = [...S.selectedNodes];
  const hasVoi = S.voiResults && S.voiResults.length > 0;
  const hasTornado = S.sensitivityMode && S.sensitivityResults && S.sensitivityResults.length > 0;

  // Build tabs: VOI (always when selected) + CPT per selected node + (optional) Parameters
  const tabs: Array<{ id: string; label: string }> = [];
  tabs.push({ id: 'voi', label: 'Value of Info' });
  for (const name of selected) tabs.push({ id: `cpt:${name}`, label: `P(${name})` });
  if (hasTornado) tabs.push({ id: 'params', label: 'Parameters' });

  if (tabs.length === 0) { panel.classList.remove('visible'); return; }

  // Ensure active tab is valid
  if (!tabs.find(t => t.id === activeInfoTab)) activeInfoTab = tabs[0].id;

  // Render tabs
  const tabsEl = document.getElementById('info-tabs')!;
  tabsEl.innerHTML = tabs.map(t =>
    `<button class="panel-tab${t.id === activeInfoTab ? ' active' : ''}" data-tab="${t.id}">${escapeHtml(t.label)}</button>`
  ).join('');

  // Tab click handlers
  for (const btn of tabsEl.querySelectorAll<HTMLElement>('.panel-tab')) {
    btn.addEventListener('click', () => {
      activeInfoTab = btn.dataset.tab!;
      renderInfoPanel(); // re-render with new active tab
    });
  }

  // Render active tab content
  const bodyEl = document.getElementById('info-body')!;
  let html = '<div class="panel-content">';

  if (activeInfoTab === 'voi') {
    const queryLabel = selected.length > 1 ? selected.join(', ') : selected[0];
    html += `<div class="panel-title">Best observations to learn about ${escapeHtml(queryLabel)}</div>`;
    if (hasVoi) {
      const maxVoi = S.voiResults![0].voi || 0.01;
      for (const r of S.voiResults!.slice(0, 15)) {
        const pct = Math.min(100, (r.voi / maxVoi) * 100);
        html += `<div class="voi-row" data-var="${r.variable}" title="VOI: ${r.voi.toFixed(4)} bits\nBase entropy: ${r.baseEntropy.toFixed(4)} bits">`;
        html += `<span class="voi-name">${r.variable}</span>`;
        html += `<span class="voi-bar"><span class="voi-bar-fill" style="width:${pct}%;background:var(--accent)"></span></span>`;
        html += `<span class="voi-value">${r.voi.toFixed(3)}</span></div>`;
      }
    } else {
      html += '<div style="color:var(--text-dim);padding:8px 0">No additional observations available</div>';
    }
  } else if (activeInfoTab.startsWith('cpt:')) {
    const varName = activeInfoTab.slice(4);
    html += buildCptHtml(varName);
  } else if (activeInfoTab === 'params' && hasTornado) {
    const top = [...S.sensitivityResults!].sort((a, b) => Math.abs(b.derivative) - Math.abs(a.derivative)).slice(0, 15);
    const maxDeriv = Math.abs(top[0]?.derivative) || 0.01;
    html += `<div class="panel-title">Top parameters for ${escapeHtml(S.sensitivityQuery ?? '')}</div>`;
    for (const r of top) {
      const pct = Math.min(100, (Math.abs(r.derivative) / maxDeriv) * 100);
      const sign = r.derivative >= 0 ? '+' : '';
      html += `<div class="tornado-row" data-var="${r.variable}" title="${r.variable} | ${r.parentConfig}\n${r.outcome}: ${r.currentValue.toFixed(3)}\nDerivative: ${sign}${r.derivative.toFixed(4)}">`;
      html += `<span class="tornado-param">${r.variable}.${r.outcome}</span>`;
      html += `<span class="tornado-range"><span class="tornado-range-fill" style="width:${pct}%;background:${r.derivative >= 0 ? 'var(--accent)' : 'var(--accent-hard)'}"></span></span>`;
      html += `<span class="voi-value">${sign}${r.derivative.toFixed(2)}</span></div>`;
    }
  }

  html += '</div>';
  bodyEl.innerHTML = html;

  // Hover + click handlers on VOI/tornado rows
  for (const row of bodyEl.querySelectorAll<HTMLElement>('.voi-row, .tornado-row')) {
    const name = row.dataset.var!;
    row.addEventListener('mouseenter', () => {
      const nodeEl = document.querySelector<SVGGElement>(`.node-g[data-var="${name}"]`);
      if (nodeEl) nodeEl.classList.add('highlight');
    });
    row.addEventListener('mouseleave', () => {
      const nodeEl = document.querySelector<SVGGElement>(`.node-g[data-var="${name}"]`);
      if (nodeEl) nodeEl.classList.remove('highlight');
    });
    row.addEventListener('click', () => {
      S.selectedNodes.clear();
      S.selectedNodes.add(name);
      rerender();
    });
  }

  panel.classList.add('visible');
}
