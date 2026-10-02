/** Right-click menu on a node: set / clear a do() intervention. */
import { S } from './state.js';
import { toggleIntervention } from './evidence.js';
import { escapeHtml } from './cpt-panel.js';
import { clearPreview } from './preview.js';

export function hideContextMenu(): void {
  document.getElementById('ctx-menu')?.classList.remove('visible');
}

export function isContextMenuOpen(): boolean {
  return !!document.getElementById('ctx-menu')?.classList.contains('visible');
}

export function initContextMenu(): void {
  const menu = document.getElementById('ctx-menu');
  const container = document.getElementById('graph-container');
  if (!menu || !container) return;

  container.addEventListener('contextmenu', (ev) => {
    const ng = (ev.target as Element).closest?.('.node-g');
    const name = ng?.getAttribute('data-var');
    const v = name ? S.network?.getVariable(name) : undefined;
    if (!v) { hideContextMenu(); return; }
    ev.preventDefault();
    clearPreview();
    const cur = S.interventions.get(v.name);
    let html = `<div class="ctx-head">${escapeHtml(v.name)}</div>`;
    v.outcomes.forEach((o, i) => {
      html += `<button data-i="${i}" class="${cur === o ? 'on' : ''}">${cur === o ? 'Clear ' : 'Intervene '}do(${escapeHtml(v.name)} = ${escapeHtml(o)})</button>`;
    });
    menu.innerHTML = html;
    menu.classList.add('visible');
    menu.style.left = Math.min(ev.clientX, window.innerWidth - 220) + 'px';
    menu.style.top = Math.min(ev.clientY, window.innerHeight - menu.offsetHeight - 8) + 'px';
    menu.querySelectorAll<HTMLElement>('button').forEach(b => b.addEventListener('click', () => {
      hideContextMenu();
      toggleIntervention(v, v.outcomes[Number(b.dataset.i)]);
    }));
  });

  document.addEventListener('click', (ev) => { if (!(ev.target as Element).closest('#ctx-menu')) hideContextMenu(); });
  container.addEventListener('wheel', hideContextMenu, { passive: true });
}
