# Nabab

**Bayesian network inference engine in TypeScript with interactive web viewer.**

<!-- Badges placeholder -->
<!-- [![npm version](https://img.shields.io/npm/v/nabab.svg)](https://www.npmjs.com/package/nabab) -->
[![CI](https://github.com/ochafik/nabab/actions/workflows/ci.yml/badge.svg)](https://github.com/ochafik/nabab/actions)

Nabab is a pure TypeScript library for exact and approximate inference on discrete Bayesian networks. It ships with an interactive D3-based viewer, an MCP server for LLM integration, and benchmarks against 17 standard models from bnlearn.

**Try it live:** [nabab.ochafik.workers.dev](https://nabab.ochafik.workers.dev/) — the web viewer, with an MCP server at [`/mcp`](https://nabab.ochafik.workers.dev/mcp) ([help](https://nabab.ochafik.workers.dev/help)).

## Features

- **Multiple inference algorithms**
  - **Junction Tree (JT)** -- exact inference via clique tree message passing
  - **Cached JT** -- keeps a calibrated junction tree between queries: new evidence costs one message pass, retracting or switching evidence re-initialises from cached clique products, and repeating a query is free (10-30x faster per query on the large benchmark models)
  - **Query pruning** -- `queryVariables` drops barren and d-separated nodes before building the junction tree, so single-variable queries stay cheap even on networks whose full junction tree is too large (e.g. munin1)
  - **Variable Elimination (VE)** -- exact single-variable query, often faster than full JT when you only need one posterior
  - **Loopy Belief Propagation (LBP)** -- approximate sum-product message passing on the factor graph; fast on high-treewidth networks where exact methods struggle
  - **Worker-based inference** -- runs inference in a Web Worker (browser) or `worker_threads` (Node.js) to keep the main thread responsive
  - **GPU-ready factor ops** (experimental) -- prototype TensorFlow.js backend expressing factor multiply/marginalize as tensor broadcast + sum (WebGPU/WASM acceleration path)
  - **Soft evidence (Jeffrey's rule)** -- likelihood weighting on any variable, not just hard observations
- **Interactive D3 viewer** with dagre layout, probability bar sliders, soft/hard evidence toggling, CPT inspection, drag-and-drop XML loading, and URL state persistence
- **DOM-free library** -- the inference engine uses regex-based XML parsing and has zero DOM dependencies; works in Node.js, Deno, Bun, Cloudflare Workers, or any browser
- **MCP server** for Claude and other LLM tool-use integration, with an interactive MCP App viewer
- **17 standard benchmark models** (Asia, Alarm, Sachs, Child, Insurance, Water, Hepar2, Hailfinder, Win95pts, Pathfinder, Barley, Mildew, Diabetes, Link, Pigs, Andes, Munin1)
- **679 tests** across 36 test files covering factors, graphs, triangulation, inference, evidence validation, parsers, cross-validation, LBP, VE, cached inference, worker inference, the MCP server, and TensorFlow.js factor ops

### Stability

The core library (factors, junction tree / cached / VE / LBP inference, parsers, sampling, MPE, VOI, sensitivity, CPT templates, temporal nodes) is tested and considered stable. Prototype-grade modules are tagged `@experimental` in their JSDoc and may change or disappear without notice: `tfjs-factor.ts` (TensorFlow.js factor ops, not exported from the package entry point), `wasm-factor.ts` (typed-array experiment), `gaussian.ts` (continuous / CLG variables) and `causal-discovery.ts` (wrapper over `@kanaries/causal`, the library's only runtime dependency).

### Evidence semantics

Evidence is validated by every inference entry point (`validateEvidence`): unknown variables, unknown outcomes, negative / NaN weights and all-zero likelihood vectors throw a descriptive `Error`. Evidence with probability zero (e.g. contradictory observations) throws `ImpossibleEvidenceError` rather than returning NaN posteriors. `InferenceResult.probabilityOfEvidence` exposes P(evidence).

## Quick Start

```bash
# Install dependencies (Node >= 22.12)
npm install

# Start the interactive viewer (Vite dev server)
npm run dev

# Lint, run the test suite
npm run lint
npm test

# Build the library and viewer
npm run build
```

## Library Usage

Nabab exports a clean, DOM-free API from `src/lib/index.ts`.

### Load a network and run inference

```typescript
import { BayesianNetwork } from 'nabab';

// Parse from XMLBIF string
const network = BayesianNetwork.fromXmlBif(xmlbifContent);

// Get prior distributions (no evidence)
const priors = network.priors();
for (const [variable, distribution] of priors) {
  console.log(`${variable.name}:`, Object.fromEntries(distribution));
}
```

### Set hard evidence

```typescript
const evidence = new Map([['Alarm', 'True']]);
const result = network.infer(evidence);
const posterior = result.posteriors.get(network.getVariable('Burglary')!);
console.log('P(Burglary | Alarm=True):', Object.fromEntries(posterior!));
```

### Set soft (likelihood) evidence

```typescript
const softEvidence = new Map([
  ['Rain', new Map([['true', 0.8], ['false', 0.2]])],
]);
const result = network.infer(undefined, softEvidence);
```

### Query a single variable with Variable Elimination

```typescript
import { BayesianNetwork, variableElimination } from 'nabab';

const network = BayesianNetwork.fromXmlBif(xmlbifContent);
const queryVar = network.getVariable('Burglary')!;
const dist = variableElimination(
  network.variables,
  network.cpts,
  queryVar,
  new Map([['Alarm', 'True']]),
);
console.log('P(Burglary | Alarm=True):', Object.fromEntries(dist));
```

### Use cached inference for repeated queries

```typescript
import { BayesianNetwork, CachedInferenceEngine } from 'nabab';

const network = BayesianNetwork.fromXmlBif(xmlbifContent);
const engine = new CachedInferenceEngine(network);

// First call builds the junction tree; the tree then stays calibrated, so
// adding evidence is one message pass and an unchanged query is free
const result1 = engine.infer(new Map([['Alarm', 'True']]));
const result2 = engine.infer(new Map([['Alarm', 'True'], ['Earthquake', 'True']]));
```

### Query only some variables

```typescript
// Prunes the network to what P(Burglary | Alarm=True) depends on before
// building the junction tree. Works with infer() and CachedInferenceEngine.
const result = network.infer(
  new Map([['Alarm', 'True']]), undefined, { queryVariables: ['Burglary'] },
);
```

The posteriors of the query variables are identical to a full run, but only they
are returned, and evidence that is d-separated from them is ignored: the
reported `probabilityOfEvidence` covers only the relevant evidence, and
contradictions confined to irrelevant evidence are not reported as
`ImpossibleEvidenceError`. Omit `queryVariables` when either matters.

### Approximate inference with Loopy Belief Propagation

```typescript
import { BayesianNetwork, loopyBeliefPropagation } from 'nabab';

const network = BayesianNetwork.fromXmlBif(xmlbifContent);
const result = loopyBeliefPropagation(
  network.variables,
  network.cpts,
  new Map([['Alarm', 'True']]),
  undefined,
  { maxIterations: 100, tolerance: 1e-6, damping: 0.5 },
);
console.log('Converged:', result.converged, 'in', result.iterations, 'iterations');
```

### Parse BIF format (bnlearn models)

```typescript
import { parseBif, BayesianNetwork } from 'nabab';

const parsed = parseBif(bifFileContent);
const network = new BayesianNetwork(parsed);
```

### Sampling, MPE / k-best, CPT templates, temporal nodes

**Monte-Carlo sampling** (seeded, column-major samples; `likelihoodWeighting` clamps hard
evidence and weights by likelihood evidence):

```typescript
import { forwardSample, likelihoodWeighting, sampledMarginals } from 'nabab';

const prior = forwardSample(network.variables, network.cpts, 20000, { seed: 42 });
const post = likelihoodWeighting(
  network.variables, network.cpts,
  new Map([['dysp', 'yes']]),                       // hard evidence
  new Map([['xray', new Map([['yes', 0.9], ['no', 0.2]])]]), // likelihood evidence
  20000, { seed: 42 },
);
sampledMarginals(post, 'lung');   // Distribution
sampledMarginals(post);           // Map<Variable, Distribution>
// post.columns[i][s] = outcome index of post.variables[i] in sample s; post.weights[s] its weight
```

**Most probable explanation and k-best** (max-product variable elimination with traceback;
k-best by Lawler/Nilsson constraint splitting, constraints expressed as zero likelihood weights):

```typescript
import { mostProbableExplanation, kBestExplanations } from 'nabab';

const mpe = mostProbableExplanation(network.variables, network.cpts, new Map([['dysp', 'yes']]));
mpe.assignment;      // Map<string, string> over ALL variables
mpe.logProbability;  // ln P(assignment, evidence) — joint, not normalised by P(e)

const top = kBestExplanations(network.variables, network.cpts, 10, new Map([['dysp', 'yes']]));
// descending logProbability; disjoint assignments; ≤ k if evidence leaves fewer
```

**Templated CPTs** — build tables from O(#parents) parameters instead of the full Cartesian
product. `gatedLogisticCPT`: a hard CNF gate (AND of OR-groups over parent outcomes) forces the
null outcome when unsatisfied; otherwise `softmax(log base + Σ applicable log-odds shifts)`.
`noisyOrCPT` is the classic binary noisy-OR.

```typescript
import { gatedLogisticCPT, noisyOrCPT } from 'nabab';

const cpt = gatedLogisticCPT({
  variable: outcome,           // outcomes ['none', 'partial', 'full']
  parents: [prereq, support],
  gate: [[{ parent: 'prereq', outcomes: ['done'] }]],       // prereq must be done
  base: [0.5, 0.3, 0.2],                                    // prior when the gate holds
  shifts: [{ parent: 'support', outcome: 'strong', logOdds: [0, 0, 1.5] }], // or a sparse Map
});
const alarm = noisyOrCPT({ variable: alarmVar, parents: [burglary, earthquake], leak: 0.001, weights: [0.94, 0.29] });
```

**Temporal nodes** — "time as a bucketed outcome": one variable per event whose outcomes are
`[none, o₁@b₁, o₁@b₂, …]`. `hazardPrior` spreads `pOccur` over outcomes × buckets;
`delayShifts` encodes "child resolves ≥ `delay` buckets after the parent" as `-Infinity`
shifts for `gatedLogisticCPT`.

```typescript
import { temporalVariable, hazardPrior, priorCPT, delayShifts, parseTemporalOutcome, bucketIndex } from 'nabab';

const buckets = ['Q1-27', 'Q2-27', 'H2-27', '2028'];
const P = temporalVariable({ name: 'ceasefire', outcomes: ['partial', 'full'], buckets });
const C = temporalVariable({ name: 'elections', outcomes: ['held'], buckets });
const pCpt = priorCPT(P, hazardPrior({ outcomes: new Map([['partial', 0.6], ['full', 0.4]]), pOccur: 0.7, buckets, hazard: [1, 2, 2, 1] }));
const cCpt = gatedLogisticCPT({
  variable: C, parents: [P],
  gate: [[{ parent: 'ceasefire', outcomes: P.outcomes.filter(o => o !== 'none') }]], // needs a ceasefire
  base: hazardPrior({ outcomes: new Map([['held', 1]]), pOccur: 0.8, buckets, hazard: [1, 1, 1, 1] }),
  shifts: delayShifts({ parent: P, child: C, buckets, delay: 1 }),                    // ≥ 1 bucket later
});
parseTemporalOutcome('full@H2-27'); // { outcome: 'full', bucket: 'H2-27' }
bucketIndex(buckets, 'H2-27');      // 2
```

**Sample-based VOI** — information gain and criticality from a sample result, no inference
(`sampledMutualInformation(result, A, [B…])` is exactly `valueOfInformation` when B is a single target):

```typescript
import { sampledInformationGainRanking, sampledCriticality } from 'nabab';

sampledInformationGainRanking(post, candidateNames, ['elections']); // [{ variable, bits }] descending
sampledCriticality(post, candidateNames, 'elections', 'held@2028');  // drop in P(target) when candidate = null
```

## Viewer

The interactive viewer runs locally with `npm run dev` and is deployed at [nabab.ochafik.workers.dev](https://nabab.ochafik.workers.dev/). It provides:

- **Dagre auto-layout** of the Bayesian network graph
- **Scroll to pan**, **⌘/Ctrl+scroll or pinch to zoom** (drag and Fit View also work)
- **Probability bars** on each node showing the current posterior distribution
- **What-if hover preview**: hover an outcome bar (or its label) and the horizontal position picks a target of 0, 25, 50, 75 or 100% for that outcome (snap ticks appear on the bar). Every other node shows the posterior it *would* have: a marker at the new value, the gained part tinted green and the lost part red, a signed delta badge (e.g. `+12%`) for the largest change, and a halo whose strength follows the total variation distance of the node. Unaffected (d-separated) nodes dim. 100% is hard evidence, intermediate values are soft evidence via Jeffrey's rule (same semantics as the slider), 0% rules the outcome out. **Click commits exactly the previewed value**; drag a thumb for continuous values. Toggle with the *Preview* button; on touch, long-press a bar. Esc cancels.
- **Explain** (toolbar): runs `mostProbableExplanation` / `kBestExplanations` (k=5) on the current evidence, marks each node's MPE outcome and lists the explanations with their log-probabilities; click one to highlight it
- **Interventions (do-operator)**: Alt-click an outcome bar/label, or right-click a node, to set do(X = x) via graph surgery (`mutilateNetwork`). The node gets a distinct "do" style, its incoming edges are drawn dashed and faded, and inference, previews, VOI and sensitivity run on the mutilated network. Repeat the gesture to clear. Interventions are stored in the URL state like evidence.
- **P(e)**: the probability of the observed evidence is shown in the header when evidence is set
- **Click to cycle** through hard evidence states for any variable (click the name)
- **Drag sliders** to set soft/likelihood evidence with continuous weights
- **Eye toggle** to enable/disable observations per node
- **Value-of-information and sensitivity panels** for the current selection
- **CPT inspection** panel (click a node to view its conditional probability table)
- **Keyboard**: `Esc` clears the preview, menus and selection, `Space` toggles the selected nodes' observations, `?` opens the interactions help
- **Drag-and-drop** any `.xml`, `.xmlbif`, `.bif` or `.csv` file (CSV runs structure learning) to load a custom network
- **URL state persistence** -- evidence, interventions, zoom, and layout are compressed into the URL hash
- **17 built-in example networks** in the toolbar, plus 17 bnlearn benchmark models (up to 724 nodes) and 2 CSV datasets for structure learning
- **Dark mode** support via `prefers-color-scheme`

**Preview performance.** On entering an outcome the five snap targets of that outcome (and, when inference is fast, of the node's other outcomes) are queued in `PreviewComputer` (`src/viewer/preview-computer.ts`): one inference per macrotask, results cached by (network, interventions, evidence) key in an LRU, stale queue entries dropped when the pointer moves on. Networks whose full inference takes more than 40 ms run previews in a `WorkerInferenceEngine` so the UI thread is never blocked; if the exact snap is not ready after 150 ms the nearest computed snap is shown and a spinner appears in the hovered node. The preview only draws an overlay on the existing SVG (no re-render). Pure logic (snapping, evidence model, keys, deltas) lives in `evidence-model.ts` and `preview-logic.ts` and is unit-tested.

## MCP Server

Nabab includes an MCP (Model Context Protocol) server that lets an LLM **model** with Bayesian networks end to end: build a network from a compact JSON spec, query it, explain observations, decide what to observe next, probe parameter sensitivity, reason causally, and learn a network from CSV. The `query` tool renders an interactive **MCP App** viewer in the client.

### Connect

Remote (recommended — deployed on Cloudflare Workers, one Durable Object per session):

```bash
claude mcp add --transport http nabab https://nabab.ochafik.workers.dev/mcp
```

Local stdio:

```bash
claude mcp add nabab -- npx tsx src/mcp/node.ts --stdio
```

or in `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "nabab": {
      "command": "npx",
      "args": ["tsx", "src/mcp/node.ts", "--stdio"],
      "cwd": "/path/to/nabab"
    }
  }
}
```

A local HTTP mode is also available: `npm run mcp` (defaults to `http://localhost:3001/mcp`).

### How the tools work

Tools are **stateless with respect to evidence**: every call passes its full `evidence` (hard: `{"Smoking": "yes"}`) and, where supported, `softEvidence` (`{"Alarm": {"on": 0.8, "off": 0.2}}`). There is no hidden "current evidence".

Every tool takes a `network`, which is any of:

- a **handle** (`bn_…`, a content hash) returned by an earlier call (`build_network`, `learn_from_csv`, `describe_network`, `query`, …);
- a **bundled example name** (`asia`, `alarm.xml`, `bench/insurance.bif`, … see `list_examples`; all the viewer's examples and bnlearn models are available);
- an **http(s) URL** to an XMLBIF/BIF file (5 MB cap, 15 s timeout);
- **inline** XMLBIF, BIF or nabab JSON text.

### Available MCP tools

| Tool | Description |
|------|-------------|
| `build_network` | Build a network from a JSON spec (variables, outcomes, parents and CPTs given as explicit tables, conditional rules, noisy-OR, gated-logistic or temporal `hazardPrior`/`delays` templates). Validates thoroughly, reports every problem found, returns a handle, the structure and prior marginals |
| `query` | Posterior probabilities for chosen or all variables, shown as change vs prior, plus P(evidence); renders the MCP App viewer. `method`: `exact` (default, guarded by a cost estimate), `sampling` (likelihood weighting) or `auto` |
| `explain` | Most probable explanation, or the k best (MPE) |
| `what_to_observe` | Value of information: which unobserved variable most reduces uncertainty about the target(s) |
| `sensitivity` | Which CPT parameters most influence a query: exact derivatives or tornado sweep |
| `intervene` | Pearl's do-operator, compared with plain observation, plus average causal effect |
| `learn_from_csv` | Learn structure and parameters from categorical CSV text, URL or bundled dataset |
| `describe_network` | Variables, outcomes, parents, inference cost, optionally CPTs |
| `export_network` | Export as XMLBIF 0.3 or nabab JSON |
| `list_examples` | The bundled networks and datasets |

Exact inference is refused (with advice to use `method: "sampling"` or a smaller network) when the junction tree's largest clique would exceed the budget (`DEFAULT_MAX_CLIQUE_ENTRIES`, 32M entries; the Worker uses 4M).

Example `build_network` spec:

```json
{"name": "Sprinkler", "variables": [
  {"name": "Rain", "outcomes": ["yes", "no"], "cpt": [0.2, 0.8]},
  {"name": "Sprinkler", "outcomes": ["on", "off"], "parents": ["Rain"],
   "cpt": {"type": "conditional", "rows": [
     {"when": {"Rain": "yes"}, "probs": {"on": 0.01, "off": 0.99}},
     {"when": {"Rain": "no"},  "probs": {"on": 0.4,  "off": 0.6}}]}},
  {"name": "WetGrass", "outcomes": ["wet", "dry"], "parents": ["Rain", "Sprinkler"],
   "cpt": {"type": "noisyOr", "leak": 0, "weights": {"Rain": 0.9, "Sprinkler": 0.8},
           "activeOutcomes": {"Rain": "yes", "Sprinkler": "on"}, "nullOutcome": "dry"}}]}
```

CPT kinds: a bare array/map (root prior or explicit table), `conditional` (first matching rule wins), `noisyOr`, `gatedLogistic` (gate, log-odds `shifts`, temporal `delays`), `hazardPrior` (temporal roots), `uniform`. Temporal variables are declared with `"temporal": {"outcomes": [...], "buckets": [...]}` and map onto `temporalVariable`, `hazardPrior`, `delayShifts`, `gatedLogisticCPT` and `noisyOrCPT` from the library.

## Deployment

Everything is deployed to Cloudflare Workers as a single Worker (`wrangler.jsonc`):

| Path | Serves |
|------|--------|
| `/` | The web viewer (static assets from `dist/viewer`) |
| `/mcp` | MCP streamable-HTTP endpoint |
| `/help` | Links and install instructions |

```bash
npm run deploy   # builds the viewer + MCP App, then wrangler deploy
```

**Sessions.** Each MCP session is hosted by its own SQLite-backed Durable Object (`idFromName(sessionId)`), so a heavy inference only blocks that session. On `initialize` the Worker mints the session id and routes to that object; later requests are routed by their `Mcp-Session-Id`. The object persists the client's `initialize` request and the source of every network handle in its storage. If the object is evicted, the next request transparently rebuilds the MCP transport by replaying the stored `initialize` under the same session id, and handles are rebuilt from storage (large sources over ~1.8 MB are kept in memory only; examples and URLs are stored by reference). Idle sessions are deleted after 24 hours by a Durable Object alarm; an unknown or expired session id gets a clean `404` so clients re-initialize.

**Examples** are not bundled into the Worker script: the Worker reads them from the static-assets binding (`env.ASSETS`, the same `/examples/*` and `/bench/models/*` files the viewer fetches).

## Benchmark Results

Per-query latency on the standard bnlearn models (Apple Silicon, Node.js v26), measured by `bench/results/perf-bench.ts` on one long-lived `CachedInferenceEngine`, as the viewer uses it. Each model sees the same sequence of evidence changes (add three observations, repeat, switch one outcome, retract one, clear), with evidence taken from a seeded forward sample so it is always possible. Times are milliseconds per query, averaged over the sequence.

| Model | Nodes | Treewidth | Largest clique (entries) | Before (ms) | After (ms) | Speedup |
|-------|------:|----------:|-------------------------:|------------:|-----------:|--------:|
| alarm | 37 | 4 | 144 | 0.13 | 0.02 | 7.6x |
| hepar2 | 70 | 6 | 384 | 0.18 | 0.04 | 4.9x |
| pathfinder | 109 | 6 | 32,256 | 4.77 | 0.29 | 16.6x |
| andes | 223 | 17 | 262,144 | 8.65 | 1.20 | 7.2x |
| pigs | 441 | 10 | 177,147 | 15.1 | 1.97 | 7.7x |
| diabetes | 413 | 4 | 154,275 | 203 | 18.6 | 10.9x |
| mildew | 35 | 4 | 1,756,800 | 62.1 | 6.36 | 9.8x |
| water | 32 | 10 | 1,769,472 | 117 | 5.54 | 21.2x |
| barley | 48 | 7 | 13,063,680 | 551 | 45.5 | 12.1x |
| link | 724 | 15 | 16,777,216 | 761 | 64.2 | 11.9x |

An unchanged query costs 0.01-2.4 ms (reading the marginals), adding evidence is a single message pass, and the one-shot `infer()` (which also builds the junction tree) is 2-5x faster, 34x on andes, where building the tree used to dominate. munin1 (largest clique 274M entries) cannot be answered in full, but with `queryVariables` the relevant sub-network is tiny: random single-variable queries with up to three observations take 0.5 ms on average. Where the speedups come from: in-place Hugin messages with precomputed loop plans instead of allocating new tables per message, a tree that stays calibrated between queries, junction-tree construction that reads the maximal cliques off the elimination order, and pruning.

See `bench/results/perf-summary.md` for the full before/after tables (one-shot, per step kind, single-variable queries), and `bench/results/before-full-summary.md` / `after-full-summary.md` for the original `run-full-bench.ts` harness (parse, junction tree build, inference, 10-query cached comparison).

## Architecture

```
src/lib/                -- Pure inference library (npm-publishable)
  types.ts              -- Variable, CPT, Evidence, Distribution types
  factor.ts             -- Factor algebra (multiply, marginalize, evidence, normalize)
                           Optimized with Int32Array stride maps, subset fast paths,
                           trailing/leading marginalization fast paths
  evidence.ts           -- Evidence validation (validateEvidence, ImpossibleEvidenceError)
  graph.ts              -- DAG, moralization, min-fill triangulation, clique finding,
                           max-weight spanning tree junction tree construction
  inference.ts          -- Junction tree inference (infer, size guard, InferOptions)
  calibrated-tree.ts    -- Hugin propagation on a junction tree that stays calibrated:
                           in-place messages, incremental evidence, lazy clique potentials
  pruning.ts            -- Query-relevant pruning (Bayes-ball: barren + d-separated nodes)
  cached-inference.ts   -- Cached JT engine (calibrated tree + pruned sub-engines)
  variable-elimination.ts -- Variable elimination with min-fill ordering
  loopy-bp.ts           -- Loopy belief propagation (damped sum-product)
  worker-inference.ts   -- Off-main-thread inference (Web Worker / worker_threads)
  inference-worker.ts   -- Worker script (counterpart to worker-inference.ts)
  tfjs-factor.ts        -- (experimental) factor ops via TensorFlow.js tensors
  network.ts            -- BayesianNetwork class (parsing + inference facade)
  xmlbif-parser.ts      -- XMLBIF 0.3 parser (regex-based, DOM-free)
  bif-parser.ts         -- BIF format parser (bnlearn plain text format)
  index.ts              -- Public API re-exports

src/viewer/             -- Interactive web viewer
  main.ts               -- DOM wiring, toolbar, drag-drop/paste, boot
  state.ts              -- Shared mutable viewer state store
  graph-render.ts       -- d3 + dagre rendering, sliders, layout, render loop
  evidence.ts           -- Hard/soft (Jeffrey's rule) evidence model
  loading.ts            -- Examples, parsing, CSV structure learning, state restore
  persistence.ts        -- URL hash / localStorage serialization
  info-panel.ts         -- VOI / sensitivity / CPT inspector panel
  cpt-panel.ts          -- CPT table HTML
  selection.ts          -- Node selection
  mcp-app.ts            -- MCP App lifecycle (host connection, streaming input)
  render-bus.ts         -- Late-bound render trigger (keeps modules acyclic)

src/mcp/                -- MCP server for LLM integration
  server.ts             -- Transport-agnostic server factory (tool definitions)
  analysis.ts           -- Analysis cores and text formatting behind the tools, cost guards
  build-spec.ts         -- build_network: JSON spec -> validated BayesianNetwork
  networks.ts           -- `network` references, handles, URL fetching, session store interface
  examples.ts           -- Catalog of the viewer's examples / bnlearn models / datasets
  node.ts, node-assets.ts -- Node entry: stdio or express HTTP (`npm run mcp`), filesystem assets
  worker.ts             -- Cloudflare Workers entry: session routing, help page, assets binding
  session-host.ts       -- One session inside a Durable Object: persistence and resume

test/                   -- Vitest test suite (679 tests)
bench/                  -- Benchmark runner and 17 bnlearn models
  models/               -- .bif files (asia, alarm, sachs, child, etc.)
  run-bench.ts          -- Benchmark runner
  results/              -- Baseline and before/after results (perf-bench.ts, run-full-bench.ts)

wrangler.jsonc          -- Cloudflare Workers config (static assets, DO, text modules)
scripts/copy-viewer-assets.mjs -- Copies examples + bench models into the build
```

## API Reference

Key exports from `nabab` (via `src/lib/index.ts`):

### Classes

- **`BayesianNetwork`** -- main entry point; wraps parsing + inference
  - `static fromXmlBif(content: string): BayesianNetwork`
  - `infer(evidence?, likelihoodEvidence?, options?: InferOptions): InferenceResult`
  - `query(variableName, evidence?): Distribution`
  - `priors(): Map<Variable, Distribution>`
  - `getVariable(name): Variable | undefined`
  - `getParents(variable): Variable[]`
  - `getChildren(variable): Variable[]`
- **`CachedInferenceEngine`** -- calibrated junction tree for fast repeated queries
  - `infer(evidence?, likelihoodEvidence?, options?: { queryVariables }): InferenceResult`
- **`WorkerInferenceEngine`** -- async off-thread inference
  - `async infer(evidence?, likelihoodEvidence?): Promise<WorkerInferenceResult>`
  - `terminate(): void`

### Functions

- **`infer(variables, cpts, evidence?, likelihoodEvidence?, options?)`** -- junction tree inference (`options`: `maxCliqueEntries`, `eliminationHeuristic`, `queryVariables`)
- **`variableElimination(variables, cpts, queryVariable, evidence?, ...)`** -- VE for single-variable queries
- **`loopyBeliefPropagation(variables, cpts, evidence?, likelihoodEvidence?, options?)`** -- approximate inference
- **`parseXmlBif(content)`** -- parse XMLBIF format
- **`parseBif(content)`** -- parse BIF format
- **`buildJunctionTree(dag)`** -- build junction tree from directed graph
- **`createFactor(variables, values)`**, **`multiplyFactors(f1, f2)`**, **`marginalize(factor, vars)`** -- factor operations
- **`forwardSample(variables, cpts, n, opts?)`**, **`likelihoodWeighting(variables, cpts, evidence?, likelihoodEvidence?, n, opts?)`**, **`sampledMarginals(result, variable?)`** -- seeded Monte-Carlo sampling
- **`mostProbableExplanation(variables, cpts, evidence?, likelihoodEvidence?)`**, **`kBestExplanations(variables, cpts, k, evidence?, likelihoodEvidence?)`** -- max-product MPE and k-best
- **`gatedLogisticCPT(opts)`**, **`noisyOrCPT(opts)`** -- templated CPT construction
- **`temporalVariable(opts)`**, **`hazardPrior(opts)`**, **`priorCPT(variable, dist)`**, **`delayShifts(opts)`**, **`parseTemporalOutcome(s)`**, **`bucketIndex(buckets, bucket)`** -- temporal nodes
- **`sampledMutualInformation(result, a, bs)`**, **`sampledInformationGainRanking(result, candidates, targets)`**, **`sampledCriticality(result, candidates, target, outcome, nullOf?)`** -- sample-based VOI

### Types

- `Variable` -- `{ name, outcomes, position? }`
- `CPT` -- `{ variable, parents, table: Float64Array }`
- `Evidence` -- `Map<string, string>` (hard evidence)
- `LikelihoodEvidence` -- `Map<string, Map<string, number>>` (soft evidence)
- `Distribution` -- `Map<string, number>`
- `Factor` -- `{ variables, values: Float64Array, strides }`
- `InferenceResult` -- `{ posteriors, junctionTree, cliquePotentials, probabilityOfEvidence }`
- `SampleResult` -- `{ variables, n, columns, weights, totalWeight }` (column-major samples)
- `Explanation` -- `{ assignment: Map<string, string>, logProbability }`

## Contributing

```bash
# Lint
npm run lint

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run benchmarks (requires .bif files in bench/models/)
npx tsx bench/run-bench.ts

# Run full benchmark suite with cached comparison
npx tsx bench/results/run-full-bench.ts

# Start development viewer
npm run dev

# Deploy viewer + MCP server to Cloudflare Workers
npm run deploy
```

### Adding a new benchmark model

1. Place the `.bif` file in `bench/models/`
2. Run `npx tsx bench/run-bench.ts modelname`
3. Verify the marginals against a reference implementation

### Adding a new viewer example

1. Place the `.xml` or `.xmlbif` file in `src/examples/`
2. Add an `<option>` entry in `index.html`

## License

MIT
