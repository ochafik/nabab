/**
 * Copy runtime-fetched static assets into the built viewer output.
 *
 * The viewer fetches example networks and benchmark models at runtime via
 * plain URLs (/examples/<file>, /bench/models/<file>, /bench/samples/<file>).
 * Vite does not know about those fetches, so they must be copied next to the
 * built index.html for the standalone deployment to work.
 */
import { cpSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const outDir = resolve(import.meta.dirname, '../dist/viewer');

mkdirSync(resolve(outDir, 'bench'), { recursive: true });
cpSync(resolve(import.meta.dirname, '../src/examples'), resolve(outDir, 'examples'), { recursive: true });
cpSync(resolve(import.meta.dirname, '../bench/models'), resolve(outDir, 'bench/models'), { recursive: true });
cpSync(resolve(import.meta.dirname, '../bench/samples'), resolve(outDir, 'bench/samples'), { recursive: true });

console.log('Copied src/examples and bench/{models,samples} into dist/viewer');
