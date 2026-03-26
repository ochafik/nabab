/**
 * Parser for the XMLBIF 0.3 format (Bayesian Interchange Format).
 * See: http://www.cs.cmu.edu/~fgcozman/Research/InterchangeFormat/
 *
 * DOM-free: uses regex-based parsing, works in any JS environment
 * (browser, Node.js, Deno, Bun, Cloudflare Workers, etc.)
 */
import type { Variable, CPT } from './types.js';

export interface ParsedNetwork {
  name: string;
  variables: Variable[];
  cpts: CPT[];
}

/** Extract all content blocks matching <TAG>...</TAG> within a parent string. */
function findBlocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'gi');
  const results: string[] = [];
  let m;
  while ((m = re.exec(xml)) !== null) results.push(m[1]);
  return results;
}

/** Extract the text content of the first <TAG>...</TAG> within a string. */
function firstText(xml: string, tag: string): string {
  const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(xml);
  return m ? m[1].trim() : '';
}

/** Extract all text contents of <TAG>...</TAG> within a string. */
function allTexts(xml: string, tag: string): string[] {
  return findBlocks(xml, tag).map(s => s.trim());
}

function parsePosition(value?: string): { x: number; y: number } | undefined {
  if (!value) return undefined;
  const match = /\((\d+)\s*,\s*(\d+)\)/.exec(value);
  return match ? { x: Number(match[1]), y: Number(match[2]) } : undefined;
}

/**
 * Parse an XMLBIF string into a network definition.
 * Pure string parsing — no DOM required.
 *
 * @param content XMLBIF XML string
 * @param _domParser Deprecated, ignored. Kept for backward compatibility.
 */
export function parseXmlBif(content: string, _domParser?: unknown): ParsedNetwork {
  // Find the <NETWORK> block
  const networkBlock = findBlocks(content, 'NETWORK')[0] ?? content;
  const networkName = firstText(networkBlock, 'NAME') || 'Untitled';

  // Parse variables
  const variablesByName = new Map<string, Variable>();
  const variables: Variable[] = [];

  for (const varBlock of findBlocks(networkBlock, 'VARIABLE')) {
    const name = firstText(varBlock, 'NAME');
    const outcomes = allTexts(varBlock, 'OUTCOME');
    const properties = new Map(
      allTexts(varBlock, 'PROPERTY').map(s => {
        const [k, ...rest] = s.split('=');
        return [k.trim(), rest.join('=').trim()] as [string, string];
      }),
    );
    const variable: Variable = {
      name,
      outcomes,
      position: parsePosition(properties.get('position')),
    };
    variablesByName.set(name, variable);
    variables.push(variable);
  }

  // Parse definitions (CPTs)
  const cpts: CPT[] = [];

  for (const defBlock of findBlocks(networkBlock, 'DEFINITION')) {
    const varName = firstText(defBlock, 'FOR');
    const variable = variablesByName.get(varName);
    if (!variable) throw new Error(`Unknown variable: ${varName}`);

    const parents = allTexts(defBlock, 'GIVEN').map(name => {
      const v = variablesByName.get(name);
      if (!v) throw new Error(`Unknown parent variable: ${name}`);
      return v;
    });

    const tableValues = firstText(defBlock, 'TABLE')
      .split(/\s+/)
      .filter(s => s.length > 0)
      .map(Number);

    cpts.push({
      variable,
      parents,
      table: new Float64Array(tableValues),
    });
  }

  return { name: networkName, variables, cpts };
}
