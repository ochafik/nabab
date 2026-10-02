/** Model catalogue of the perf gate: everything the viewer's dropdown offers. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const ROOT = join(import.meta.dirname, '..', '..');
const EXAMPLES = join(ROOT, 'src', 'examples');
const BENCH_MODELS = join(ROOT, 'bench', 'models');
const BENCH_SAMPLES = join(ROOT, 'bench', 'samples');

export interface ModelSpec {
  /** Viewer dropdown value, e.g. `alarm.xml` or `bench/alarm.bif` (also the key in the baselines). */
  id: string;
  kind: 'network' | 'csv';
  path: string;
}

/** The ids the viewer's dropdown offers, read from index.html so the gate follows the page. */
export function dropdownIds(): string[] {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf-8');
  const select = html.match(/<select id="example-select">([\s\S]*?)<\/select>/)?.[1] ?? '';
  return [...select.matchAll(/<option value="([^"]+)"/g)].map(m => m[1]);
}

export function listModels(): ModelSpec[] {
  return dropdownIds().map((id): ModelSpec => {
    const path = id.startsWith('bench/')
      ? join(id.endsWith('.csv') ? BENCH_SAMPLES : BENCH_MODELS, id.slice('bench/'.length))
      : join(EXAMPLES, id);
    return { id, kind: id.endsWith('.csv') ? 'csv' : 'network', path };
  });
}

export const readModel = (m: ModelSpec): string => readFileSync(m.path, 'utf-8');
