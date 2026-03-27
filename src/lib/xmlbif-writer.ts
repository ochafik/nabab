/**
 * Serializer for the XMLBIF 0.3 format (Bayesian Interchange Format).
 * Produces valid XMLBIF that can be re-loaded by parseXmlBif.
 */
import type { BayesianNetwork } from './network.js';

/** Escape XML special characters. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Serialize a BayesianNetwork to XMLBIF 0.3 format.
 *
 * The output is a valid XMLBIF document that can be re-loaded by parseXmlBif.
 */
export function toXmlBif(network: BayesianNetwork): string {
  let xml = `<?xml version="1.0"?>\n<BIF VERSION="0.3">\n<NETWORK>\n<NAME>${esc(network.name)}</NAME>\n\n`;

  // Variables
  for (const v of network.variables) {
    xml += `<VARIABLE TYPE="nature">\n`;
    xml += `\t<NAME>${esc(v.name)}</NAME>\n`;
    for (const o of v.outcomes) {
      xml += `\t<OUTCOME>${esc(o)}</OUTCOME>\n`;
    }
    if (v.position) {
      xml += `\t<PROPERTY>position = (${v.position.x}, ${v.position.y})</PROPERTY>\n`;
    }
    xml += `</VARIABLE>\n\n`;
  }

  // Definitions (CPTs)
  for (const cpt of network.cpts) {
    xml += `<DEFINITION>\n`;
    xml += `\t<FOR>${esc(cpt.variable.name)}</FOR>\n`;
    for (const parent of cpt.parents) {
      xml += `\t<GIVEN>${esc(parent.name)}</GIVEN>\n`;
    }
    xml += `\t<TABLE>${Array.from(cpt.table).join(' ')}</TABLE>\n`;
    xml += `</DEFINITION>\n\n`;
  }

  xml += `</NETWORK>\n</BIF>`;
  return xml;
}
