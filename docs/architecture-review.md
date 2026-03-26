# Architecture Review: nabab

A detailed analysis of nabab's TypeScript Bayesian network engine, covering what works well, what's missing, and where to go next.

---

## 1. Overall Architecture

nabab is organized into three layers:

```
src/lib/          -- Pure inference engine (DOM-free*, publishable as npm package)
  types.ts        -- Variable, CPT, Evidence, Distribution type definitions
  factor.ts       -- Factor algebra: multiply, marginalize, evidence, normalize
  graph.ts        -- DAG, moralization, triangulation, clique finding, junction tree
  inference.ts    -- Junction tree inference (collect/distribute evidence)
  network.ts      -- BayesianNetwork class (combines parsing + inference)
  xmlbif-parser.ts -- XMLBIF 0.3 parser (*uses DOMParser)
  index.ts        -- Public API re-exports

src/viewer/       -- Interactive web viewer (D3 + dagre)
  main.ts         -- Single 800-line file: rendering, interaction, state persistence

src/mcp/          -- Model Context Protocol server
  server.ts       -- Stdio-based MCP server with tools for load/query/evidence

test/             -- Vitest test suite
  factor.test.ts, graph.test.ts, inference.test.ts, triangulation.test.ts,
  xmlbif-parser.test.ts, cross-validation.test.ts
```

The library is published from `dist/lib/` (via `tsconfig.lib.json`), the viewer builds to `dist/viewer/` (via Vite), and the MCP server runs directly via `tsx`.

---

## 2. The Inference Engine

### 2.1 What It Does Well

**Factor operations (`src/lib/factor.ts`)** are correct, efficient, and well-structured:

- **Float64Array storage**: factors use typed arrays for cache-friendly, garbage-free arithmetic. The flat row-major layout with precomputed strides is the standard approach used by libDAI and pgmpy internally.
- **Stride-based indexing**: `multiplyFactors` and `marginalize` use precomputed stride mappings (`f1Map`, `f2Map`, `resultMap`) to avoid per-element hash lookups. This is the right design---it converts the inner loop from Map lookups (O(1) amortized but cache-unfriendly) to array arithmetic.
- **Immutable factors**: every operation returns a new Factor. This avoids subtle aliasing bugs that plague mutable factor implementations.
- **Correct evidence application**: `applyEvidence` delegates to `applyLikelihood` with a delta weight vector, ensuring hard evidence is a special case of soft evidence. This is cleaner than having separate code paths.

**Junction tree construction (`src/lib/graph.ts`)** implements the full pipeline correctly:

- `moralize()`: correctly marries co-parents.
- `triangulate()`: uses minimum-degree elimination ordering---a significant improvement over naive approaches. The implementation correctly maintains a mutable copy of the adjacency structure and collects fill-in edges.
- `findMaximalCliques()`: greedy growth with deduplication via canonical key strings.
- `buildJunctionTree()`: Kruskal's algorithm on maximum-weight spanning tree (weight = separator size). Union-Find with path compression.

**Message passing (`src/lib/inference.ts`)** faithfully reproduces the Hugin architecture:

- `passMessage`: marginalizes source, divides by old separator, multiplies into destination. This is a direct port of the Java `JunctionTreeAlgorithmUtils.passMessage`.
- `collectEvidence` / `distributeEvidence`: correct two-phase traversal with boolean marking.
- CPT assignment to cliques checks containment correctly (all factor variables must be in the clique).
- The whole pipeline is verified against Java reference values in `test/cross-validation.test.ts`.

**Soft/likelihood evidence** (`applyLikelihood` in `factor.ts`, plumbed through `inference.ts`):

- Correctly multiplies factor entries by per-outcome weights.
- Enables continuous slider interaction in the viewer (not just hard clamping).
- This is genuinely unusual for a lightweight BN engine---pgmpy added virtual evidence support only in 2021, and many educational tools still lack it.

### 2.2 What's Missing or Could Be Improved

#### 2.2.1 Triangulation Heuristic

**Current**: min-degree (pick the vertex with fewest remaining neighbors).

**Improvement**: min-fill (pick the vertex that introduces the fewest fill-in edges) is generally better for reducing maximum clique size. The difference is small for simple networks but can be dramatic for networks with irregular structure.

Implementation cost: ~10 additional lines in `triangulate()`. For each candidate vertex, count the number of neighbor pairs that aren't already connected, and pick the minimum. The current code already has the neighbor list; just need to count non-edges.

**Weighted min-fill** (weight each fill-in edge by product of domain sizes) would be even better for networks with heterogeneous cardinalities (e.g., some binary variables, some with 5+ outcomes). This matters because a clique's table size is the product of its variables' domain sizes, not just the number of variables.

#### 2.2.2 Clique Finding

`findMaximalCliques()` uses a greedy growth approach with a lexicographic ordering constraint for deduplication. This works but:

- **Correctness concern**: the `isMaximal` flag is set based on whether *any* candidate could extend the clique. But the ordering constraint (`v.name < c.name`) means some valid extensions are skipped. If the only extending candidates have names less than all current members, `isMaximal` is set to `true` even though the clique isn't actually maximal. However, those larger cliques would be discovered starting from a different seed vertex, so the final result is correct---just potentially includes some non-maximal cliques that are subsets of other found cliques.

- **Alternative**: since the graph is chordal (post-triangulation), the maximal cliques correspond exactly to the eliminated vertex + its remaining neighbors at elimination time. This is already computed during triangulation! Extracting cliques directly from the elimination process would be both simpler and guaranteed correct, eliminating the separate clique-finding pass.

#### 2.2.3 Factor Operation Performance

For networks with large CPTs (e.g., a variable with 5 parents each having 4 outcomes = 4^6 = 4096 entries), the inner loops in `multiplyFactors` and `marginalize` dominate. Current issues:

- **The inner loop recomputes indices from scratch for each entry**: `for (let j = 0; j < variables.length; j++) { idx1 += indices[j] * f1Map[j]; }`. This is O(k) per entry where k = number of variables. An alternative is to maintain running indices and update them incrementally when the "odometer" ticks over. This would reduce the inner loop to O(1) amortized.
- **indexOf calls**: `f1.variables.indexOf(v)` in the stride mapping is O(n) per variable. For large factors with many variables this adds up. Using a Map<Variable, number> for variable-to-index lookup would be O(1).
- **No SIMD**: TypeScript/V8 doesn't expose SIMD intrinsics for Float64Array. WebAssembly SIMD could help for very large factors but is probably overkill for networks under 100 variables.

#### 2.2.4 Memory Allocation

Every factor operation allocates a new `Float64Array`. For interactive use (slider dragging triggers inference on every mouse move), this creates GC pressure. Options:

- **Factor pool**: pre-allocate a pool of Float64Arrays and reuse them.
- **In-place operations**: for the distribute phase where old potentials are no longer needed.
- **Lazy evaluation**: the Java engine used `Functions.cache()` to lazily evaluate factor expressions. The TS engine eagerly computes everything, which is simpler but allocates more.

In practice, modern V8 handles short-lived typed arrays well, so this is likely not a bottleneck until networks exceed ~50 variables.

#### 2.2.5 Incremental Inference

Currently, every evidence change triggers a full junction tree rebuild + propagation. For interactive use, this means:

1. Rebuild DAG (fast)
2. Moralize (fast)
3. Triangulate (fast for small networks)
4. Find cliques (fast)
5. Build junction tree (fast)
6. Initialize potentials (moderate)
7. Two-pass message passing (moderate)

Steps 1-5 don't need to be repeated when only evidence changes. The junction tree structure is fixed for a given network. Caching the junction tree and only re-running steps 6-7 would cut inference time roughly in half for interactive use.

Further, **lazy propagation** (Madsen & Jensen, 1999) defers factor operations until marginals are actually requested. If the user only queries a few variables after each evidence change, this can be dramatically faster.

---

## 3. The Triangulation Fix and Why It Matters

The original TypeScript port (before the minimum-degree fix) likely used a naive triangulation approach---possibly connecting all neighbors simultaneously rather than using an elimination ordering. For the dog-problem network (5 variables), this could produce a single clique of size 5 instead of 3 cliques of size 3.

The test in `test/triangulation.test.ts` verifies:
```typescript
expect(cliques.length).toBeGreaterThanOrEqual(3);
expect(cliques.every(c => c.length < 5)).toBe(true);
const maxSize = Math.max(...cliques.map(c => c.length));
expect(maxSize).toBeLessThanOrEqual(3);
```

Why this matters quantitatively for dog-problem:
- **Naive** (1 clique of size 5): table has 2^5 = 32 entries. Message passing trivial (only 1 clique) but initialization multiplies all 5 CPTs into one huge factor.
- **Min-degree** (3 cliques of max size 3): tables have at most 2^3 = 8 entries each. Total storage: ~24 entries. Messages are small.

The difference is modest for binary variables but grows exponentially: for 5-outcome variables, a 5-clique has 5^5 = 3125 entries vs 5^3 = 125 entries per clique. For the ALARM network (37 vars, some with 4 outcomes), proper triangulation is the difference between milliseconds and minutes.

---

## 4. DOM-Free Library: The XMLBIF Parser Dependency

### The Problem

`src/lib/xmlbif-parser.ts` line 32:
```typescript
const parser = domParser ?? new DOMParser();
```

`DOMParser` is a browser API. In Node.js, it doesn't exist. The library works around this by:

1. Accepting an optional `domParser` parameter.
2. The MCP server (`src/mcp/server.ts`) injects a JSDOM-based parser.
3. The viewer runs in a browser where `DOMParser` is native.

But the **npm package** (`src/lib/`) lists no dependency on JSDOM. If a Node.js consumer calls `BayesianNetwork.fromXmlBif(content)` without passing a parser, it crashes.

### The Fix

Three options, in order of preference:

1. **Pure-TS XML parser**: write a minimal XMLBIF parser that doesn't use DOM APIs at all. XMLBIF is a very simple format (no namespaces, no attributes beyond VERSION and TYPE, no CDATA). A ~50-line regex/split parser would suffice. This makes the library truly zero-dependency for Node.js.

2. **Conditional import**: dynamically import JSDOM when DOMParser is unavailable. This works but adds a large transitive dependency (JSDOM is ~5MB).

3. **Current approach** (explicit parameter) is workable but poor DX. Users shouldn't need to know about DOM parsers to use a probability library.

Additionally, there should be a **programmatic API** for building networks without XMLBIF at all. `BayesianNetwork` already accepts a `ParsedNetwork` in its constructor, and the test files (`test/inference.test.ts`) construct networks from code. But this isn't documented or highlighted in the public API. Making `new BayesianNetwork({ name, variables, cpts })` the primary API and XMLBIF a secondary import would decouple the library from all DOM concerns.

---

## 5. MCP Server Design Review

### 5.1 Current Implementation (`src/mcp/server.ts`)

Five tools:
- `list_examples` -- list bundled example files
- `load_network` -- parse XMLBIF content or load example by name
- `set_evidence` -- set hard evidence on a variable
- `clear_evidence` -- clear evidence (all or specific)
- `query` -- run inference and return posteriors
- `get_network_info` -- describe the loaded network

### 5.2 What Works

- Clean tool definitions with Zod schema validation.
- Stateful (keeps `currentNetwork` and `currentEvidence` across calls). This is the right design for a conversational interaction where an LLM incrementally explores a network.
- JSDOM injection for Node.js XML parsing.
- Good error messages with variable name suggestions.

### 5.3 Issues and Improvements

**Hardcoded example path** (line 35):
```typescript
const examplesDir = resolve(__dirname, '../../../src/main/resources/com/ochafik/math/bayes');
```
This points to the legacy Java resource directory relative to `src/mcp/server.ts`. After compilation, this path resolves differently. The server should use `resolve(__dirname, '../../src/examples')` to point at the TS port's example files, or better, embed example content at build time.

**No soft evidence tool**: `set_evidence` only supports hard evidence. Adding a `set_soft_evidence` tool (variable + weights map) would expose nabab's differentiating feature to LLMs.

**No batch operations**: setting evidence on 5 variables requires 5 tool calls. A `set_multiple_evidence` tool accepting a Record<string, string> would be more efficient.

**No structural queries**: an LLM might want to ask "what are the parents of X?" or "what is the Markov blanket of X?" without parsing `get_network_info` output. Dedicated tools for `get_parents`, `get_children`, `get_markov_blanket` would be more ergonomic.

**No causal queries**: even without full do-calculus, a `do_intervention` tool that performs graph surgery (removes incoming edges to a variable, then sets evidence) would be a powerful demonstration of causal reasoning.

**Viewer integration**: the MCP server doesn't serve the viewer. An `open_viewer` tool that starts a Vite dev server or serves the built viewer and returns a URL would enable visual interaction alongside LLM conversation.

---

## 6. Viewer Architecture

### 6.1 Strengths

`src/viewer/main.ts` is a single-file D3.js application that does a lot:

- **Graph layout**: dagre for automatic top-down layout, with manual drag-to-reposition.
- **Interactive evidence**: eye toggle, click-to-cycle outcomes, drag sliders for soft evidence.
- **Multi-outcome support**: binary variables get a compact slider; multi-outcome variables get per-outcome bar charts with individual sliders.
- **State persistence**: full state (network, evidence, positions, zoom) compressed into URL hash via DeflateStream. Enables shareable links.
- **Dark mode**: CSS custom properties with prefers-color-scheme media query.
- **Zoom/pan**: D3 zoom behavior with transform persistence across re-renders.
- **Node selection**: shift-click for multi-select, drag to move selected nodes together.
- **PostMessage API**: `nabab-set-evidence`, `nabab-load-network`, `nabab-posteriors` for iframe embedding.
- **Paste/drop XMLBIF**: paste or drag-drop XML files directly into the viewer.

### 6.2 Pain Points

**Single-file monolith**: at ~800 lines, `viewer/main.ts` combines state management, rendering, event handling, layout, and evidence manipulation. This makes it hard to:
- Test individual components.
- Add features without risk of regressions.
- Support alternative rendering backends (Canvas, WebGL for very large networks).

Suggested decomposition:
```
viewer/
  state.ts        -- Evidence state, selection, source tracking
  layout.ts       -- dagre wrapper, position management
  render.ts       -- D3 rendering (nodes, edges, sliders)
  interaction.ts  -- Event handlers (drag, click, keyboard, paste/drop)
  hash.ts         -- URL hash serialization/deserialization
  main.ts         -- Initialization, wiring
```

**Full re-render on every change**: `render()` clears the SVG and redraws everything. For small networks (5-40 nodes) this is imperceptible. For 100+ nodes, it will cause visible flicker and dropped frames during slider dragging. D3's enter/update/exit pattern would allow incremental updates.

**Inconsistent evidence detection** (line 616):
```typescript
const isDegenerate = dist ? [...dist.values()].every(p => p === 0 || isNaN(p)) : false;
```
This catches impossible evidence combinations after the fact. A better UX would prevent inconsistent evidence from being set, or at least show a warning with the conflicting variables identified.

**Slider precision**: the binary slider snaps to hard evidence at 99.5% (`t > 0.995` in `setSlider`). This is a reasonable UX choice but could be configurable. For demonstration purposes, users might want to explore the full [0, 1] range without snapping.

**No export**: there's no way to export the current network (possibly modified with evidence) back to XMLBIF, or to export a screenshot/SVG. An export button would be useful for academic use.

**No undo**: evidence changes are not tracked. Ctrl-Z doesn't work. For exploratory analysis, undo/redo would be valuable.

---

## 7. Scaling to 100s or 1000s of Nodes

### 7.1 Inference Scaling

For networks with treewidth < 15, the current JTA implementation will handle hundreds of nodes in under a second. The bottleneck is:

1. **Clique finding**: `findMaximalCliques` is O(n * 2^k) in the worst case where k is the max degree. For chordal graphs, extracting cliques from the elimination order (as noted in section 2.2.2) would be O(n * k^2).

2. **Factor size**: a clique with 15 binary variables has a table of 2^15 = 32,768 entries. Manageable. But 15 variables with 4 outcomes each: 4^15 = 1 billion entries. Not manageable.

For treewidth > 20, nabab needs an approximate fallback:

- **Loopy BP** is the most natural addition. The existing factor infrastructure (multiply, marginalize) can be reused. LBP on a cluster graph uses the same `passMessage` operation but iterates until convergence. Implementation estimate: ~100 lines.

- **Gibbs sampling**: even simpler. For each variable, the full conditional P(X_i | Markov blanket) is the product of the variable's CPT and the CPTs of its children, evaluated at the current state. Implementation estimate: ~80 lines.

### 7.2 Viewer Scaling

For 100+ nodes, the current D3 SVG renderer will struggle:

- **Layout**: dagre handles hundreds of nodes but becomes slow (seconds) for 1000+. Consider WebCola or ELK for larger graphs, or a force-directed layout with constraints.
- **Rendering**: SVG with 1000 node groups (each with multiple rects, texts, sliders) will hit DOM limits. Canvas rendering (d3-canvas or Pixi.js) would be necessary.
- **Interaction**: at 500+ nodes, individual sliders per node become impractical. A detail panel (select a node, see its CPT and sliders in a side panel) would scale better.
- **Culling**: only render nodes visible in the current viewport. D3 can manage this with a quadtree spatial index.

### 7.3 Memory

Each factor stores a Float64Array. For a network with 1000 binary variables and treewidth 10:
- ~1000 cliques, each with tables of size 2^10 = 1024
- Total factor storage: ~1000 * 1024 * 8 bytes = ~8 MB
- Separator potentials: similar magnitude
- Total: ~20-30 MB. Comfortable for browsers.

For treewidth 20: 2^20 = 1M entries per clique = ~8 GB. Impossible in a browser. This is where approximate methods become mandatory.

---

## 8. Recommended Next Steps (Prioritized)

### Tier 1: Quick Wins (< 1 day each)

1. **Cache the junction tree in BayesianNetwork**. Avoid rebuilding the tree on every `infer()` call. The tree depends only on the network structure, not evidence. Store it as a private field, rebuild only when CPTs change.

2. **Extract cliques during triangulation**. Record the clique (eliminated vertex + its remaining neighbors) at each elimination step. Replace `findMaximalCliques` with this simpler, guaranteed-correct extraction.

3. **Fix the MCP example path**. Change the hardcoded path to point at `src/examples/` or embed examples.

4. **Add `set_soft_evidence` MCP tool**. Expose nabab's differentiating feature to LLMs.

5. **Pure-TS XMLBIF parser**. Replace DOMParser usage with a simple string parser. Remove the jsdom runtime dependency from the library.

### Tier 2: Moderate Effort (1-3 days each)

6. **Incremental inference**. Cache the initialized clique potentials (before message passing). On evidence change, re-apply evidence to cached potentials and re-run only the message passing phases.

7. **Min-fill triangulation heuristic**. Upgrade from min-degree to min-fill. Add weighted min-fill as an option. Benchmark on ALARM and larger networks.

8. **Loopy BP fallback**. Implement cluster-graph LBP reusing the existing factor ops. Auto-detect when treewidth exceeds a threshold (e.g., max clique > 20 variables) and switch to LBP.

9. **Do-intervention tool**. Implement graph surgery (remove incoming edges to intervened variable) and expose as both a library API and MCP tool: `network.doIntervention('X', 'x1')` returns P(Y | do(X=x1)).

10. **Decompose the viewer** into separate modules (state, layout, rendering, interaction, hash persistence). Add viewer-level tests.

### Tier 3: Larger Projects (1+ weeks)

11. **Programmatic network builder API**. Fluent API for constructing networks:
    ```typescript
    const net = new NetworkBuilder('MyNet')
      .addVariable('Rain', ['true', 'false'])
      .addVariable('Wet', ['true', 'false'])
      .addEdge('Rain', 'Wet')
      .setCPT('Rain', [0.2, 0.8])
      .setCPT('Wet', { 'true': [0.9, 0.1], 'false': [0.1, 0.9] })
      .build();
    ```

12. **Structure learning** (hill-climbing with BIC score). Would enable learning from data, a major feature gap vs pgmpy/bnlearn.

13. **Canvas/WebGL renderer** for large networks (100+ nodes). Keep SVG for small networks (better text rendering, accessibility).

14. **BIF/JSON/ONNX import/export**. Support more interchange formats beyond XMLBIF.

15. **Sensitivity analysis tool**. Given evidence, which CPT parameters have the largest effect on a query variable? This is a single-pass computation after JTA propagation and is highly useful for model validation.

---

## 9. Code Quality Assessment

**Strengths**:
- TypeScript strict mode throughout.
- Clean separation between library (`src/lib/`) and application (`src/viewer/`, `src/mcp/`).
- Comprehensive test suite covering factor ops, graph construction, inference correctness, cross-validation with Java, triangulation quality, soft evidence, and XMLBIF parsing.
- Immutable data structures in the factor and graph layers.
- Float64Array for numerical stability (vs regular JavaScript numbers, which are also Float64 but typed arrays signal intent and enable engine optimizations).

**Weaknesses**:
- The viewer is a monolith.
- No CI configuration visible (no `.github/workflows/`).
- `cross-validation.test.ts` has syntax errors (missing closing `}` on the Java reference objects, extra `)` on `parseXmlBif` calls). These tests likely don't pass currently.
- No benchmarking infrastructure. Performance claims need measurement.
- The `package.json` puts `jsdom` and `@types/jsdom` in `dependencies` rather than `devDependencies`, inflating the npm package for library consumers.

Overall, the codebase is clean, well-factored at the library level, and demonstrates deep understanding of the underlying algorithms. The main architectural improvements are about scaling (caching, incremental inference, approximate methods) and DX (DOM-free parsing, programmatic API, better MCP tools).
