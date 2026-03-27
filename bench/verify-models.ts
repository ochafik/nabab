import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { parseBif } from '../src/lib/bif-parser.js';

const dir = resolve(import.meta.dirname, 'models');
for (const f of readdirSync(dir).filter(f => f.endsWith('.bif')).sort()) {
  try {
    const content = readFileSync(resolve(dir, f), 'utf-8');
    const net = parseBif(content);
    console.log(`OK ${f}: ${net.variables.length} nodes, ${net.cpts.reduce((s, c) => s + c.parents.length, 0)} edges`);
  } catch (e) {
    console.log(`FAIL ${f}: ${(e as Error).message}`);
  }
}
