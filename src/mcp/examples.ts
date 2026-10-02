/**
 * Catalog of the example networks / datasets the viewer offers.
 *
 * Names are the same paths the viewer uses (see index.html): plain file names
 * live in src/examples (served at /examples/<file>), `bench/<x>.bif` models in
 * bench/models (served at /bench/models/<x>.bif) and `bench/<x>.csv` datasets
 * in bench/samples (served at /bench/samples/<x>.csv).
 *
 * The catalog is static metadata; the bytes come from platform-specific
 * `McpAssets` (filesystem on Node, the static-assets binding on Workers).
 */

export interface ExampleInfo {
  /** Name to pass as `network` (or `csv` for datasets). */
  name: string;
  title: string;
  kind: 'network' | 'csv';
  /** Number of variables / columns, when known. */
  variables: number;
}

const net = (name: string, title: string, variables: number): ExampleInfo =>
  ({ name, title, kind: 'network', variables });

export const EXAMPLES: readonly ExampleInfo[] = [
  net('dogproblem.xmlbif', 'Dog Problem (classic 5-node toy)', 5),
  net('alarm.xml', 'Alarm', 37),
  net('car-starts.xml', 'Car Starts', 18),
  net('car-starts-light.xml', 'Car Starts Light', 18),
  net('simple.xml', 'Simple', 2),
  net('simple2.xml', 'Simple 2', 3),
  net('example1.xml', 'Example 1', 20),
  net('example2.xml', 'Example 2', 20),
  net('example3.xml', 'Example 3', 20),
  net('example4.xml', 'Example 4', 20),
  net('example5.xml', 'Example 5', 20),
  net('example6.xml', 'Example 6', 20),
  net('example7.xml', 'Example 7', 20),
  net('example8.xml', 'Example 8', 20),
  net('example9.xml', 'Example 9', 20),
  net('example10.xml', 'Example 10', 20),
  net('Graph1.xml', 'Graph 1', 80),
  net('elimbel2.xml', 'Elimbel 2', 10),
  net('b30-101.xml', 'Random b30-101', 30),
  net('b40-51.xml', 'Random b40-51', 40),
  net('b90-31.xml', 'Random b90-31', 90),
  net('b200-31.xml', 'Random b200-31', 200),
  net('b500-31.xml', 'Random b500-31', 500),
  net('b900-31.xml', 'Random b900-31', 900),
  net('bench/asia.bif', 'Asia (bnlearn)', 8),
  net('bench/sachs.bif', 'Sachs (bnlearn)', 11),
  net('bench/child.bif', 'Child (bnlearn)', 20),
  net('bench/insurance.bif', 'Insurance (bnlearn)', 27),
  net('bench/water.bif', 'Water (bnlearn)', 32),
  net('bench/mildew.bif', 'Mildew (bnlearn)', 35),
  net('bench/alarm.bif', 'Alarm (bnlearn)', 37),
  net('bench/barley.bif', 'Barley (bnlearn)', 48),
  net('bench/hailfinder.bif', 'Hailfinder (bnlearn)', 56),
  net('bench/hepar2.bif', 'Hepar2 (bnlearn)', 70),
  net('bench/win95pts.bif', 'Win95pts (bnlearn)', 76),
  net('bench/pathfinder.bif', 'Pathfinder (bnlearn)', 109),
  net('bench/munin1.bif', 'Munin1 (bnlearn)', 186),
  net('bench/andes.bif', 'Andes (bnlearn)', 223),
  net('bench/diabetes.bif', 'Diabetes (bnlearn)', 413),
  net('bench/pigs.bif', 'Pigs (bnlearn)', 441),
  net('bench/link.bif', 'Link (bnlearn)', 724),
  { name: 'bench/weather.csv', title: 'Weather dataset (200 rows)', kind: 'csv', variables: 5 },
  { name: 'bench/students.csv', title: 'Students dataset (300 rows)', kind: 'csv', variables: 5 },
];

/**
 * Resolve a user-supplied name to a catalog entry. Tolerant: case-insensitive,
 * extension optional (`asia`, `bench/asia`, `Asia.bif`), `bench/` optional when
 * unambiguous. Networks win over datasets with the same stem.
 */
export function findExample(input: string): ExampleInfo | undefined {
  const raw = input.trim().replace(/^\/+/, '').replace(/^(examples|bench\/models|bench\/samples)\//, m => (m.startsWith('bench') ? 'bench/' : ''));
  const lower = raw.toLowerCase();
  const exact = EXAMPLES.find(e => e.name.toLowerCase() === lower);
  if (exact) return exact;
  const stem = (s: string) => s.toLowerCase().replace(/\.(xml|xmlbif|bif|csv)$/, '');
  const target = stem(lower);
  return EXAMPLES.find(e => stem(e.name) === target)
    ?? EXAMPLES.find(e => stem(e.name.replace(/^bench\//, '')) === target);
}

/** Static URL (relative to the viewer origin) under which an example is served. */
export function exampleAssetPath(info: ExampleInfo): string {
  if (!info.name.startsWith('bench/')) return `/examples/${info.name}`;
  const rest = info.name.slice('bench/'.length);
  return info.kind === 'csv' ? `/bench/samples/${rest}` : `/bench/models/${rest}`;
}
