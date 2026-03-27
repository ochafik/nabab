# Nabab

**Bayesian network inference engine in TypeScript with interactive web viewer.**

<!-- Badges placeholder -->
<!-- [![npm version](https://img.shields.io/npm/v/nabab.svg)](https://www.npmjs.com/package/nabab) -->
<!-- [![CI](https://github.com/ochafik/nabab/actions/workflows/ci.yml/badge.svg)](https://github.com/ochafik/nabab/actions) -->

Nabab is a pure TypeScript library for exact and approximate inference on discrete Bayesian networks. It ships with an interactive D3-based viewer, an MCP server for LLM integration, and benchmarks against 17 standard models from bnlearn.

## Features

- **Multiple inference algorithms**
  - **Junction Tree (JT)** -- exact inference via clique tree message passing
  - **Cached JT** -- reuses the junction tree structure across queries; only rebuilds evidence-affected clique potentials (up to 8x faster on repeated queries)
  - **Variable Elimination (VE)** -- exact single-variable query, often faster than full JT when you only need one posterior
  - **Loopy Belief Propagation (LBP)** -- approximate sum-product message passing on the factor graph; fast on high-treewidth networks where exact methods struggle
  - **Worker-based inference** -- runs inference in a Web Worker (browser) or `worker_threads` (Node.js) to keep the main thread responsive
  - **GPU-ready factor ops** -- prototype TensorFlow.js backend expressing factor multiply/marginalize as tensor broadcast + sum (WebGPU/WASM acceleration path)
  - **Soft evidence (Jeffrey's rule)** -- likelihood weighting on any variable, not just hard observations
- **Interactive D3 viewer** with dagre layout, probability bar sliders, soft/hard evidence toggling, CPT inspection, drag-and-drop XML loading, and URL state persistence
- **DOM-free library** -- the inference engine uses regex-based XML parsing and has zero DOM dependencies; works in Node.js, Deno, Bun, Cloudflare Workers, or any browser
- **MCP server** for Claude and other LLM tool-use integration
- **17 standard benchmark models** (Asia, Alarm, Sachs, Child, Insurance, Water, Hepar2, Hailfinder, Win95pts, Pathfinder, Barley, Mildew, Diabetes, Link, Pigs, Andes, Munin1)
- **121 tests** across 12 test files covering factors, graphs, triangulation, inference, parsers, cross-validation, LBP, VE, cached inference, worker inference, and TensorFlow.js factor ops

## Quick Start

```bash
# Install dependencies
npm install

# Start the interactive viewer (Vite dev server)
npm run dev

# Run the test suite
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

// First call builds the junction tree; subsequent calls reuse it
const result1 = engine.infer(new Map([['Alarm', 'True']]));
const result2 = engine.infer(new Map([['Earthquake', 'True']]));
```

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

## Viewer

The interactive viewer (`npm run dev`) provides:

- **Dagre auto-layout** of the Bayesian network graph
- **Probability bars** on each node showing the current posterior distribution
- **Click to cycle** through hard evidence states for any variable
- **Drag sliders** to set soft/likelihood evidence with continuous weights
- **Eye toggle** to enable/disable observations per node
- **CPT inspection** panel (click a node to view its conditional probability table)
- **Drag-and-drop** any `.xml` or `.xmlbif` file to load a custom network
- **URL state persistence** -- evidence, zoom, and layout are compressed into the URL hash
- **17 built-in example networks** selectable from the toolbar
- **Dark mode** support via `prefers-color-scheme`

## MCP Server

Nabab includes an MCP (Model Context Protocol) server that lets LLMs like Claude interact with Bayesian networks through tool calls.

### Setup with Claude Desktop

Add to your Claude Desktop configuration (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "nabab": {
      "command": "npx",
      "args": ["tsx", "src/mcp/server.ts"],
      "cwd": "/path/to/nabab"
    }
  }
}
```

### Available MCP tools

| Tool | Description |
|------|-------------|
| `list_examples` | List available example network files |
| `load_network` | Load a network from XMLBIF content or example file name |
| `set_evidence` | Set observed evidence for a variable |
| `clear_evidence` | Clear all evidence or for a specific variable |
| `query` | Query posterior distributions given current evidence |
| `get_network_info` | Get variables, parents, outcomes, and current evidence |

## Benchmark Results

Benchmarks run on all 17 standard bnlearn models (Apple Silicon, Node.js v23). Timing includes parsing, junction tree construction, and inference with multiple evidence scenarios.

### Single-query performance

| Model | Nodes | Edges | Treewidth | Parse (ms) | JT Build (ms) | Inference (ms) | Total (ms) |
|-------|------:|------:|----------:|-----------:|---------------:|---------------:|-----------:|
| asia | 8 | 8 | 2 | 0.20 | 0.06 | 0.07 | 0.50 |
| sachs | 11 | 17 | 3 | 0.33 | 0.07 | 0.07 | 0.70 |
| child | 20 | 25 | 3 | 1.34 | 0.14 | 0.62 | 3.50 |
| alarm | 37 | 46 | 4 | 1.79 | 9.19 | 3.25 | 19.00 |
| hailfinder | 56 | 66 | 4 | 1.64 | 0.93 | 4.42 | 15.01 |
| hepar2 | 70 | 123 | 6 | 0.89 | 1.33 | 1.90 | 11.42 |
| win95pts | 76 | 112 | 8 | 1.41 | 4.14 | 3.97 | 23.47 |
| pathfinder | 109 | 195 | 6 | 25.86 | 3.50 | 26.52 | 163.65 |
| andes | 223 | 338 | 17 | 1.82 | 532.72 | 592.53 | 3472.28 |
| pigs | 441 | 592 | 10 | 6.60 | 34.28 | 121.47 | 664.43 |
| diabetes | 413 | 602 | 4 | 74.90 | 27.16 | 1053.98 | 4731.94 |
| link | 724 | 1125 | 15 | 7.95 | 424.95 | 6526.85 | 33254.34 |

### Cached vs uncached inference (10 queries each)

| Model | Uncached (ms) | Cached (ms) | Speedup |
|-------|-------------:|------------:|--------:|
| asia | 0.39 | 0.16 | 2.4x |
| alarm | 8.52 | 3.25 | 2.6x |
| hepar2 | 17.39 | 5.65 | 3.1x |
| win95pts | 30.43 | 5.76 | 5.3x |
| andes | 5795.06 | 695.86 | 8.3x |
| pigs | 1267.28 | 936.97 | 1.4x |

See `bench/results/baseline-summary.md` for the full table including all 16 models.

## Architecture

```
src/lib/                -- Pure inference library (npm-publishable)
  types.ts              -- Variable, CPT, Evidence, Distribution types
  factor.ts             -- Factor algebra (multiply, marginalize, evidence, normalize)
                           Optimized with Int32Array stride maps, subset fast paths,
                           trailing/leading marginalization fast paths
  graph.ts              -- DAG, moralization, min-fill triangulation, clique finding,
                           max-weight spanning tree junction tree construction
  inference.ts          -- Junction tree inference (collect + distribute evidence)
  cached-inference.ts   -- Cached JT engine (reuses structure across queries)
  variable-elimination.ts -- Variable elimination with min-fill ordering
  loopy-bp.ts           -- Loopy belief propagation (damped sum-product)
  worker-inference.ts   -- Off-main-thread inference (Web Worker / worker_threads)
  inference-worker.ts   -- Worker script (counterpart to worker-inference.ts)
  tfjs-factor.ts        -- GPU-accelerated factor ops via TensorFlow.js tensors
  network.ts            -- BayesianNetwork class (parsing + inference facade)
  xmlbif-parser.ts      -- XMLBIF 0.3 parser (regex-based, DOM-free)
  bif-parser.ts         -- BIF format parser (bnlearn plain text format)
  index.ts              -- Public API re-exports

src/viewer/             -- Interactive web viewer
  main.ts               -- D3 + dagre rendering, interaction, state persistence

src/mcp/                -- MCP server for LLM integration
  server.ts             -- Stdio-based MCP server (load, query, evidence tools)

test/                   -- Vitest test suite (121 tests)
bench/                  -- Benchmark runner and 17 bnlearn models
  models/               -- .bif files (asia, alarm, sachs, child, etc.)
  run-bench.ts          -- Benchmark runner
  results/              -- Baseline results and comparison tools
```

## API Reference

Key exports from `nabab` (via `src/lib/index.ts`):

### Classes

- **`BayesianNetwork`** -- main entry point; wraps parsing + inference
  - `static fromXmlBif(content: string): BayesianNetwork`
  - `infer(evidence?, likelihoodEvidence?): InferenceResult`
  - `query(variableName, evidence?): Distribution`
  - `priors(): Map<Variable, Distribution>`
  - `getVariable(name): Variable | undefined`
  - `getParents(variable): Variable[]`
  - `getChildren(variable): Variable[]`
- **`CachedInferenceEngine`** -- cached junction tree for fast repeated queries
  - `infer(evidence?, likelihoodEvidence?): InferenceResult`
- **`WorkerInferenceEngine`** -- async off-thread inference
  - `async infer(evidence?, likelihoodEvidence?): Promise<WorkerInferenceResult>`
  - `terminate(): void`

### Functions

- **`infer(variables, cpts, evidence?, likelihoodEvidence?)`** -- junction tree inference
- **`variableElimination(variables, cpts, queryVariable, evidence?, ...)`** -- VE for single-variable queries
- **`loopyBeliefPropagation(variables, cpts, evidence?, likelihoodEvidence?, options?)`** -- approximate inference
- **`parseXmlBif(content)`** -- parse XMLBIF format
- **`parseBif(content)`** -- parse BIF format
- **`buildJunctionTree(dag)`** -- build junction tree from directed graph
- **`createFactor(variables, values)`**, **`multiplyFactors(f1, f2)`**, **`marginalize(factor, vars)`** -- factor operations

### Types

- `Variable` -- `{ name, outcomes, position? }`
- `CPT` -- `{ variable, parents, table: Float64Array }`
- `Evidence` -- `Map<string, string>` (hard evidence)
- `LikelihoodEvidence` -- `Map<string, Map<string, number>>` (soft evidence)
- `Distribution` -- `Map<string, number>`
- `Factor` -- `{ variables, values: Float64Array, strides }`
- `InferenceResult` -- `{ posteriors, junctionTree, cliquePotentials }`

## Contributing

```bash
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
