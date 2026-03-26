/**
 * Parser for the XMLBIF 0.3 format (Bayesian Interchange Format).
 * See: http://www.cs.cmu.edu/~fgcozman/Research/InterchangeFormat/
 */
import type { Variable, CPT } from './types.js';

function getText(node: Element | null): string {
  return node?.textContent?.trim() ?? '';
}

function select(parent: Element | Document, tagName: string): Element[] {
  return [...parent.getElementsByTagName(tagName)];
}

function parsePosition(value?: string): { x: number; y: number } | undefined {
  if (!value) return undefined;
  const match = /\((\d+)\s*,\s*(\d+)\)/.exec(value);
  return match ? { x: Number(match[1]), y: Number(match[2]) } : undefined;
}

export interface ParsedNetwork {
  name: string;
  variables: Variable[];
  cpts: CPT[];
}

/**
 * Parse an XMLBIF string into a network definition.
 * Works in both browser (DOMParser) and Node.js (with a DOM polyfill).
 */
export function parseXmlBif(content: string, domParser?: { parseFromString(s: string, t: string): Document }): ParsedNetwork {
  const parser = domParser ?? new DOMParser();
  const doc = parser.parseFromString(content, 'text/xml');

  const networkName = getText(select(doc, 'NAME')[0]) || 'Untitled';

  // Parse variables
  const variablesByName = new Map<string, Variable>();
  const variables: Variable[] = [];

  for (const vElem of select(doc, 'VARIABLE')) {
    const name = getText(select(vElem, 'NAME')[0]);
    const outcomes = select(vElem, 'OUTCOME').map(getText);
    const properties = new Map(
      select(vElem, 'PROPERTY').map(getText).map(s => {
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

  for (const dElem of select(doc, 'DEFINITION')) {
    const varName = getText(select(dElem, 'FOR')[0]);
    const variable = variablesByName.get(varName);
    if (!variable) throw new Error(`Unknown variable: ${varName}`);

    const parents = select(dElem, 'GIVEN').map(getText).map(name => {
      const v = variablesByName.get(name);
      if (!v) throw new Error(`Unknown parent variable: ${name}`);
      return v;
    });

    const tableValues = getText(select(dElem, 'TABLE')[0])
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
