/** CPT inspector: probability table HTML for the info panel. */
import { S } from './state.js';

/** Build CPT HTML for a single variable. */
export function buildCptHtml(varName: string): string {
  if (!S.network) return '';
  const cpt = S.network.cpts.find(c => c.variable.name === varName);
  if (!cpt) return '';

  const v = cpt.variable;
  const parents = cpt.parents;
  const outcomes = v.outcomes;
  const parentNames = parents.map(p => p.name).join(', ');
  const title = parents.length > 0 ? `P(${v.name} | ${parentNames})` : `P(${v.name})`;

  let html = `<div class="cpt-title">${escapeHtml(title)}</div><table class="cpt-table">`;

  if (parents.length === 0) {
    html += '<thead><tr>';
    for (const o of outcomes) html += `<th>${escapeHtml(o)}</th>`;
    html += '</tr></thead><tbody><tr>';
    for (let i = 0; i < outcomes.length; i++) html += `<td>${formatProb(cpt.table[i])}</td>`;
    html += '</tr></tbody>';
  } else {
    html += '<thead><tr>';
    for (const p of parents) html += `<th class="cpt-parent-col">${escapeHtml(p.name)}</th>`;
    html += `<th></th>`;
    for (const o of outcomes) html += `<th>${escapeHtml(o)}</th>`;
    html += '</tr></thead><tbody>';
    const parentSizes = parents.map(p => p.outcomes.length);
    const numCombinations = parentSizes.reduce((a, b) => a * b, 1);
    const numOutcomes = outcomes.length;
    for (let row = 0; row < numCombinations; row++) {
      html += '<tr>';
      let remainder = row;
      for (let pi = parents.length - 1; pi >= 0; pi--) {
        const pSize = parentSizes[pi];
        html += `<td class="cpt-parent-col">${escapeHtml(parents[pi].outcomes[remainder % pSize])}</td>`;
        remainder = Math.floor(remainder / pSize);
      }
      html += `<td class="cpt-separator"></td>`;
      for (let oi = 0; oi < numOutcomes; oi++) html += `<td>${formatProb(cpt.table[row * numOutcomes + oi])}</td>`;
      html += '</tr>';
    }
    html += '</tbody>';
  }
  html += '</table>';
  return html;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function formatProb(p: number): string {
  if (p === 0) return '0';
  if (p === 1) return '1';
  // Show up to 4 decimal places, remove trailing zeros
  return p.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}
