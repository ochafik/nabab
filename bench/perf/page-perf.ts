#!/usr/bin/env npx tsx
/**
 * Real-browser page-load gate. Needs `npm run build:viewer` first and Chromium
 * (`npx playwright install chromium`).
 *
 *   npm run perf:page             load every dropdown model, compare, exit 1 on regression
 *   npm run perf:page:baseline    record bench/perf/page-timings.json (add --provisional when not run on the CI runner)
 *
 * For each model, in a fresh page (cold: bundle + model fetch + parse + layout + inference + render):
 *   render   ms from navigation start to the first frame in which every node is in the DOM
 *   task     longest main-thread task (PerformanceObserver 'longtask', i.e. >= 50 ms) until then
 * and functional checks that catch a blank or broken page: all nodes present, >= 90 % of them inside
 * the viewport (the auto-fit), no page errors, and for networks over the clique budget the
 * "Showing structure only" status instead of posteriors.
 *
 * Gates: absolute caps (CAP_*), and median-of-N vs the committed baseline (x2.5 + 300 ms, warn-only
 * while the baseline is provisional). One retry of a failing model.
 */
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, statSync, appendFileSync, mkdirSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { deflateSync } from 'node:zlib';
import { chromium } from 'playwright';
import { BayesianNetwork } from '../../src/lib/network.js';
import { estimateInferenceCost, DEFAULT_MAX_CLIQUE_ENTRIES } from '../../src/lib/inference.js';
import { parseCSV, learnStructure } from '../../src/lib/structure-learning.js';
import { listModels, readModel, ROOT, type ModelSpec } from './models.js';

const CAP_RENDER_MS = 3000;     // navigation -> everything drawn
const CAP_TASK_MS = 1000;       // longest single main-thread task
/** Models known to be heavy (measured on a laptop); they get a looser absolute cap, still catching a blow-up. */
const HEAVY: Record<string, { render: number; task: number }> = {
  'bench/link.bif': { render: 8000, task: 5000 },
  'bench/diabetes.bif': { render: 8000, task: 5000 },
  'bench/pigs.bif': { render: 5000, task: 3000 },
};
const FACTOR = 2.5;
const SLACK_MS = 300;
const RUNS = 3;
const MIN_VISIBLE = 0.9;
/** The fit is clamped at a minimum zoom (fit-view.ts MIN_ZOOM), so the biggest graphs overflow the viewport by design. */
const MIN_VISIBLE_BIG: Record<string, number> = { 'bench/diabetes.bif': 0.4, 'bench/link.bif': 0.8 };

const DIST = join(ROOT, 'dist', 'viewer');
const BASELINE = join(import.meta.dirname, 'page-timings.json');
const OUT_DIR = join(import.meta.dirname, 'out');

interface PageStat { render: number; task: number }
interface PageBaseline { version: 1; provisional: boolean; recordedAt: string; models: Record<string, PageStat> }

const MIME: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.xml': 'application/xml', '.xmlbif': 'application/xml', '.bif': 'text/plain', '.csv': 'text/csv', '.svg': 'image/svg+xml' };

function serve(): Promise<{ url: string; close: () => void }> {
  const server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? '/').split(/[?#]/)[0]);
    let file = normalize(join(DIST, path === '/' ? 'index.html' : path));
    if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
    file = '';
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => {
    const addr = server.address() as { port: number };
    resolve({ url: `http://127.0.0.1:${addr.port}/`, close: () => server.close() });
  }));
}

/** What the page should show, computed with the library: node count, and whether inference is over the clique budget. */
function expectation(spec: ModelSpec): { nodes: number; structureOnly: boolean } {
  const text = readModel(spec);
  const bn = spec.kind === 'csv' ? new BayesianNetwork(learnStructure(parseCSV(text))) : BayesianNetwork.parse(text);
  const cost = estimateInferenceCost(bn.variables, bn.cpts);
  return { nodes: bn.variables.length, structureOnly: cost.maxCliqueEntries > DEFAULT_MAX_CLIQUE_ENTRIES };
}

const hashFor = (id: string) => deflateSync(Buffer.from(JSON.stringify({ s: { t: 'b', n: id } }))).toString('base64');
const median = (a: number[]) => [...a].sort((x, y) => x - y)[a.length >> 1];

interface Sample extends PageStat { problems: string[] }

async function loadOnce(browser: import('playwright').Browser, base: string, spec: ModelSpec, exp: { nodes: number; structureOnly: boolean }): Promise<Sample> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const problems: string[] = [];
  page.on('pageerror', e => problems.push(`page error: ${e.message}`));
  // Scripts are plain strings: tsx's esbuild injects a `__name` helper into function bodies that the page does not have.
  await page.addInitScript(`(() => {
    const w = window;
    w.__tasks = 0;
    w.__renderAt = -1;
    new PerformanceObserver(list => {
      for (const e of list.getEntries()) w.__tasks = Math.max(w.__tasks, e.duration);
    }).observe({ type: 'longtask', buffered: true });
    const poll = () => {
      if (w.__renderAt < 0 && document.querySelectorAll('.node-g').length >= ${exp.nodes}) { w.__renderAt = performance.now() - (w.__t0 || 0); if (!${spec.kind === 'csv'}) return; }
      requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
  })()`);
  if (spec.kind === 'csv') {
    // CSVs are learned from the dropdown (no hash form): load the default page, then switch, timing from the switch.
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForFunction('document.querySelectorAll(".node-g").length > 0', undefined, { timeout: 15000 });
    await page.evaluate(`(() => {
      document.querySelectorAll('.node-g').forEach(n => n.remove());
      window.__renderAt = -1;
      window.__t0 = performance.now();
      const sel = document.getElementById('example-select');
      sel.value = ${JSON.stringify(spec.id)};
      sel.dispatchEvent(new Event('change'));
    })()`);
  } else {
    await page.goto(`${base}#${hashFor(spec.id)}`, { waitUntil: 'commit' });
  }
  try {
    await page.waitForFunction('window.__renderAt >= 0', undefined, { timeout: 15000, polling: 50 });
  } catch {
    problems.push(`nodes never all rendered (expected ${exp.nodes}, got ${await page.locator('.node-g').count()})`);
  }
  const render = await page.evaluate('window.__renderAt') as number;
  // Let the fit-to-view transition (300 ms) and any trailing work settle, then look at the result.
  await page.waitForTimeout(400);
  const task = await page.evaluate('window.__tasks') as number;
  const view = await page.evaluate(`(() => {
    const c = document.getElementById('graph-container').getBoundingClientRect();
    let total = 0, inside = 0;
    for (const n of document.querySelectorAll('.node-g')) {
      const r = n.getBoundingClientRect();
      total++;
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      if (cx >= c.left && cx <= c.right && cy >= c.top && cy <= c.bottom) inside++;
    }
    return { total, inside, status: (document.getElementById('network-name') || {}).textContent || '' };
  })()`) as { total: number; inside: number; status: string };
  if (view.total < exp.nodes) problems.push(`only ${view.total}/${exp.nodes} nodes drawn`);
  if (view.total > 0 && view.inside / view.total < (MIN_VISIBLE_BIG[spec.id] ?? MIN_VISIBLE)) problems.push(`only ${view.inside}/${view.total} nodes inside the viewport (auto-fit broken?)`);
  if (exp.structureOnly && !/structure only/i.test(view.status)) problems.push(`expected the structure-only message, status is "${view.status}"`);
  if (!exp.structureOnly && /structure only|unavailable|too expensive/i.test(view.status)) problems.push(`unexpected inference failure message: "${view.status}"`);
  await context.close();
  return { render, task, problems };
}

interface Row { id: string; render: number; task: number; base?: PageStat; capR: number; capT: number; problems: string[]; status: 'ok' | 'FAIL' | 'warn' }

async function measure(browser: import('playwright').Browser, base: string, spec: ModelSpec, exp: ReturnType<typeof expectation>): Promise<{ stat: PageStat; problems: string[] }> {
  const samples: Sample[] = [];
  for (let i = 0; i < RUNS; i++) samples.push(await loadOnce(browser, base, spec, exp));
  const good = samples.filter(s => s.render >= 0);
  const problems = [...new Set(samples.flatMap(s => s.problems))];
  return { stat: { render: Math.round(median(good.length ? good.map(s => s.render) : [Infinity])), task: Math.round(median(samples.map(s => s.task))) }, problems };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const record = args.includes('--record');
  const provisional = args.includes('--provisional');
  const only = args.find(a => a.startsWith('--models='))?.slice(9).split(',');
  const specs = listModels().filter(s => !only || only.some(o => s.id.includes(o)));
  if (!existsSync(join(DIST, 'index.html'))) throw new Error('dist/viewer is missing: run `npm run build:viewer` first');

  const server = await serve();
  const browser = await chromium.launch();
  const base: PageBaseline | null = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf-8')) : null;
  const t0 = Date.now();
  const rows: Row[] = [];
  const current: Record<string, PageStat> = {};
  try {
    // Throwaway load: first launch pays one-off browser start-up costs.
    await loadOnce(browser, server.url, specs[0], expectation(specs[0]));
    for (const spec of specs) {
      const exp = expectation(spec);
      const cap = HEAVY[spec.id] ?? { render: CAP_RENDER_MS, task: CAP_TASK_MS };
      const b = base?.models[spec.id];
      const judge = (stat: PageStat, problems: string[]): Row => {
        const issues = [...problems];
        let status: Row['status'] = 'ok';
        if (stat.render > cap.render) issues.push(`render ${stat.render} ms > cap ${cap.render} ms`);
        if (stat.task > cap.task) issues.push(`longest task ${stat.task} ms > cap ${cap.task} ms`);
        if (issues.length) status = 'FAIL';
        if (b) {
          const slow = stat.render > b.render * FACTOR + SLACK_MS || stat.task > b.task * FACTOR + SLACK_MS;
          if (slow) { issues.push(`slower than baseline x${FACTOR} + ${SLACK_MS} ms (${b.render}/${b.task} ms)`); status = base!.provisional ? (status === 'ok' ? 'warn' : status) : 'FAIL'; }
        }
        return { id: spec.id, ...stat, base: b, capR: cap.render, capT: cap.task, problems: issues, status };
      };
      let m = await measure(browser, server.url, spec, exp);
      let row = judge(m.stat, m.problems);
      if (row.status === 'FAIL') {
        const m2 = await measure(browser, server.url, spec, exp); // one retry absorbs a noisy moment
        const row2 = judge(m2.stat, m2.problems);
        if (row2.status !== 'FAIL' || m2.stat.render < m.stat.render) { m = m2; row = row2; }
        row.problems = row.problems.map(p => p);
      }
      current[spec.id] = m.stat;
      rows.push(row);
      console.log(`${row.status.padEnd(4)} ${spec.id.padEnd(24)} render ${String(row.render).padStart(5)} ms  task ${String(row.task).padStart(5)} ms${row.problems.length ? '  <- ' + row.problems.join('; ') : ''}`);
    }
  } finally {
    await browser.close();
    server.close();
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const out: PageBaseline = { version: 1, provisional, recordedAt: new Date().toISOString(), models: current };
  writeFileSync(join(OUT_DIR, 'page-timings.current.json'), JSON.stringify(out, null, 1) + '\n');
  if (record) {
    if (!only) writeFileSync(BASELINE, JSON.stringify(out, null, 1) + '\n');
    console.log(`recorded page baseline (${provisional ? 'provisional' : 'final'})`);
    return;
  }

  const failed = rows.filter(r => r.status === 'FAIL');
  const warned = rows.filter(r => r.status === 'warn');
  const L = [
    `## Page-load gate: ${failed.length ? 'FAILED' : 'passed'}`, '',
    `${rows.length} models, median of ${RUNS} cold loads in headless Chromium, ${((Date.now() - t0) / 1000).toFixed(0)} s. ` +
      `Caps: render ${CAP_RENDER_MS} ms, longest task ${CAP_TASK_MS} ms (looser for heavy models); baseline limit x${FACTOR} + ${SLACK_MS} ms${base?.provisional ? ' (baseline PROVISIONAL: warn only)' : ''}.`, '',
    '| model | render ms | baseline | longest task ms | baseline | cap render/task | status | notes |', '|---|---:|---:|---:|---:|---:|---|---|',
    ...rows.map(r => `| ${r.id} | ${r.render} | ${r.base?.render ?? '-'} | ${r.task} | ${r.base?.task ?? '-'} | ${r.capR}/${r.capT} | ${r.status} | ${r.problems.join('; ')} |`), '',
  ];
  console.log(`${failed.length} failed, ${warned.length} warnings`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, L.join('\n') + '\n');
  if (failed.length) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
