/**
 * Parser for the BIF (Bayesian Interchange Format) used by bnlearn.
 * See: https://www.bnlearn.com/bnrepository/
 *
 * BIF is a plain-text format (NOT XML) that looks like:
 *
 *   network name { }
 *   variable Foo { type discrete [ 2 ] { yes, no }; }
 *   probability ( Foo | Bar, Baz ) { (val1, val2) p1, p2; ... }
 *
 * DOM-free: uses regex-based parsing, works in any JS environment
 * (browser, Node.js, Deno, Bun, Cloudflare Workers, etc.)
 */
import type { Variable, CPT } from './types.js';
import type { ParsedNetwork } from './xmlbif-parser.js';

/**
 * Strip C-style and C++-style comments from the input.
 */
function stripComments(text: string): string {
  return text.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Extract all top-level `block_type name { ... }` blocks.
 * Handles nested braces correctly.
 */
function extractBlocks(text: string, blockType: string): { header: string; body: string }[] {
  const results: { header: string; body: string }[] = [];
  const re = new RegExp(`\\b${blockType}\\b`, 'gi');
  let match;
  while ((match = re.exec(text)) !== null) {
    // Find the opening brace
    let i = match.index + match[0].length;
    while (i < text.length && text[i] !== '{') i++;
    if (i >= text.length) continue;

    const header = text.slice(match.index + match[0].length, i).trim();

    // Find matching closing brace
    let depth = 0;
    let start = i;
    while (i < text.length) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') {
        depth--;
        if (depth === 0) break;
      }
      i++;
    }

    const body = text.slice(start + 1, i).trim();
    results.push({ header, body });
  }
  return results;
}

/**
 * Parse a BIF-format string into a network definition.
 * Pure string parsing -- no DOM required.
 *
 * @param content BIF file content
 */
export function parseBif(content: string): ParsedNetwork {
  const text = stripComments(content);

  // Parse network name
  const networkBlocks = extractBlocks(text, 'network');
  const networkName = networkBlocks.length > 0 ? networkBlocks[0].header || 'unknown' : 'unknown';

  // Parse variables
  const variablesByName = new Map<string, Variable>();
  const variables: Variable[] = [];

  for (const { header, body } of extractBlocks(text, 'variable')) {
    const name = header.trim();

    // Parse: type discrete [ N ] { val1, val2, ... };
    const typeMatch = /type\s+discrete\s*\[\s*\d+\s*\]\s*\{([^}]*)\}/i.exec(body);
    if (!typeMatch) {
      throw new Error(`Could not parse type for variable "${name}"`);
    }

    const outcomes = typeMatch[1]
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    // Parse optional position property
    let position: { x: number; y: number } | undefined;
    const posMatch = /property\s+position\s*=\s*\((\d+)\s*,\s*(\d+)\)/i.exec(body);
    if (posMatch) {
      position = { x: Number(posMatch[1]), y: Number(posMatch[2]) };
    }

    const variable: Variable = { name, outcomes, ...(position ? { position } : {}) };
    variablesByName.set(name, variable);
    variables.push(variable);
  }

  // Parse probability blocks
  const cpts: CPT[] = [];

  for (const { header, body } of extractBlocks(text, 'probability')) {
    // Header is like: ( VAR ) or ( VAR | PARENT1, PARENT2 )
    const headerMatch = /\(\s*([^|)]+?)(?:\s*\|\s*([^)]*))?\s*\)/.exec(header);
    if (!headerMatch) {
      throw new Error(`Could not parse probability header: "${header}"`);
    }

    const varName = headerMatch[1].trim();
    const variable = variablesByName.get(varName);
    if (!variable) throw new Error(`Unknown variable in probability block: "${varName}"`);

    const parentNames = headerMatch[2]
      ? headerMatch[2].split(',').map(s => s.trim()).filter(s => s.length > 0)
      : [];

    const parents: Variable[] = parentNames.map(pName => {
      const p = variablesByName.get(pName);
      if (!p) throw new Error(`Unknown parent variable: "${pName}"`);
      return p;
    });

    // Compute expected table size
    const numOutcomes = variable.outcomes.length;
    const numParentCombinations = parents.reduce((acc, p) => acc * p.outcomes.length, 1);
    const tableSize = numParentCombinations * numOutcomes;

    // Try to parse the body. Two formats:
    // 1. table p1, p2, ...; (flat row-major, no parents or all combos listed)
    // 2. (val1, val2) p1, p2; ... (one line per parent combination)

    const tableValues = new Float64Array(tableSize);

    const tableMatch = /\btable\b\s+([\s\S]*?);/i.exec(body);

    if (tableMatch) {
      // Format 1: flat table
      const values = tableMatch[1]
        .split(/[\s,]+/)
        .filter(s => s.length > 0)
        .map(Number);

      if (values.length !== tableSize) {
        throw new Error(
          `Table size mismatch for ${varName}: expected ${tableSize}, got ${values.length}`
        );
      }
      tableValues.set(values);
    } else {
      // Format 2: conditional rows like (val1, val2) p1, p2, ...;
      // Each row specifies the parent outcome combination and the child probabilities.
      //
      // The BIF format lists rows in the order the parent values are
      // enumerated in the probability header.  For our CPT storage
      // (row-major, parents outermost, child innermost) we need to map
      // each parent-value combination to the correct row index.

      // Match all rows: (val1, val2, ...) num, num, ...;
      const rowRe = /\(([^)]*)\)\s*([\d\s.,eE+\-]+);/g;
      let rowMatch;
      let rowCount = 0;

      while ((rowMatch = rowRe.exec(body)) !== null) {
        const parentValuesRaw = rowMatch[1].split(',').map(s => s.trim());
        const probs = rowMatch[2]
          .split(/[\s,]+/)
          .filter(s => s.length > 0)
          .map(Number);

        if (probs.length !== numOutcomes) {
          throw new Error(
            `Row probability count mismatch for ${varName}: expected ${numOutcomes}, got ${probs.length}`
          );
        }

        // Compute the row index from the parent value combination.
        // Row index = sum_i (parentValueIndex_i * product_j>i(parentCard_j))
        // This produces a row-major index with the first parent varying slowest.
        let rowIndex = 0;
        for (let pi = 0; pi < parents.length; pi++) {
          const valIdx = parents[pi].outcomes.indexOf(parentValuesRaw[pi]);
          if (valIdx < 0) {
            throw new Error(
              `Unknown outcome "${parentValuesRaw[pi]}" for parent "${parents[pi].name}" in CPT of "${varName}"`
            );
          }
          let stride = 1;
          for (let pj = pi + 1; pj < parents.length; pj++) {
            stride *= parents[pj].outcomes.length;
          }
          rowIndex += valIdx * stride;
        }

        const offset = rowIndex * numOutcomes;
        for (let k = 0; k < probs.length; k++) {
          tableValues[offset + k] = probs[k];
        }
        rowCount++;
      }

      if (rowCount === 0 && parents.length === 0) {
        // No parents and no table keyword: try parsing bare numbers
        const bareProbs = body
          .replace(/;/g, '')
          .split(/[\s,]+/)
          .filter(s => s.length > 0 && !isNaN(Number(s)))
          .map(Number);
        if (bareProbs.length === numOutcomes) {
          tableValues.set(bareProbs);
        } else {
          throw new Error(`Could not parse probability for ${varName}`);
        }
      } else if (rowCount !== numParentCombinations) {
        throw new Error(
          `Row count mismatch for ${varName}: expected ${numParentCombinations}, got ${rowCount}`
        );
      }
    }

    cpts.push({ variable, parents, table: tableValues });
  }

  return { name: networkName, variables, cpts };
}
