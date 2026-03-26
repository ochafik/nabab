# Competitive Landscape: nabab vs. Open-Source Bayesian Network Tools

---

## 1. Feature Matrix

| Feature | nabab | pgmpy | bnlearn (R) | pomegranate | libDAI | GeNIe/SMILE | Stan |
|---------|-------|-------|-------------|-------------|--------|-------------|------|
| **Language** | TypeScript | Python | R | Python/Cython | C++ | C++ | Stan DSL |
| **Exact inference (JTA)** | Yes | Yes | Yes (via gRain) | Yes | Yes | Yes | N/A |
| **Variable elimination** | No | Yes | N/A | Yes | Yes | N/A | N/A |
| **Loopy BP** | No | Yes | No | No | Yes | N/A | N/A |
| **Gibbs sampling** | No | Yes | No | No | Yes | N/A | N/A (continuous) |
| **Soft/likelihood evidence** | Yes | Partial (v0.1.23+) | Yes (gRain) | No | Yes | Yes | N/A |
| **Structure learning** | No | Yes (HC, MMHC, PC, etc.) | Yes (extensive) | Yes (Chow-Liu) | No | Yes (structural EM) | No |
| **Parameter learning** | No | Yes (MLE, Bayesian) | Yes (MLE, Bayesian) | Yes (MLE, EM) | No | Yes | Yes (MCMC) |
| **Causal inference** | No | Yes (do-calculus) | No | No | No | No | No |
| **XMLBIF import** | Yes | Yes | No | No | No | Yes (XDSL) | N/A |
| **Interactive viewer** | Yes (web) | No | No (static plots) | No | No | Yes (desktop) | No |
| **Browser-native** | Yes | No | No | No | No | No | No |
| **MCP server** | Yes | No | No | No | No | No | No |
| **Continuous variables** | No | Limited | No | Yes | No | Yes | Yes |
| **Dynamic BNs** | No | Yes | No | No | No | Yes | No |
| **Influence diagrams** | No | No | No | No | No | Yes | No |
| **API maturity** | Early | Mature | Mature | v1.0 rewrite | Stable | Mature | Mature |
| **Install size** | ~2 MB (npm) | ~50 MB (pip) | ~20 MB (R) | ~30 MB (pip) | Compile from source | 50 MB installer | ~100 MB |

---

## 2. Detailed Comparisons

### 2.1 pgmpy (Python)

**The most directly comparable open-source library.** pgmpy is the de facto standard for Bayesian networks in the Python ecosystem.

**What pgmpy offers that nabab doesn't**:

- **Structure learning**: hill-climbing, tabu search, MMHC, PC algorithm, exhaustive search (small networks), tree search. This is probably pgmpy's biggest draw---researchers use it to learn network structure from data.
- **Parameter learning**: maximum likelihood estimation, Bayesian estimation, expectation-maximization for incomplete data.
- **Causal inference**: `CausalInference` class implementing backdoor, frontdoor, and do-calculus. `pgmpy.inference.CausalInference.query(variables, do, evidence)` is exactly the API nabab could replicate.
- **Multiple inference algorithms**: VE, BP, MPLP (max-product LP), sampling (forward, rejection, likelihood weighting, Gibbs).
- **Dynamic Bayesian Networks**: DBN class with interface unrolling.
- **Extensive model zoo**: built-in access to bnlearn repository networks (ALARM, Asia, Sachs, Insurance, etc.).
- **Markov networks**: undirected graphical models, not just BNs.
- **BIF, XMLBIF, UAI file format support**.

**What pgmpy doesn't have that nabab does**:

- No interactive web viewer. pgmpy can plot networks with matplotlib/networkx, but these are static images, not interactive tools.
- No browser deployment. pgmpy requires a Python environment (Jupyter, script, or API server).
- No MCP integration. An LLM using pgmpy would need a custom tool wrapper; nabab provides this out of the box.
- No real-time evidence manipulation with visual feedback.
- pgmpy's soft evidence support came late (v0.1.23, 2023) and is less mature than nabab's first-class slider-based approach.

**Performance comparison** (rough estimates for ALARM, 37 variables):

| Operation | pgmpy | nabab |
|-----------|-------|-------|
| Parse XMLBIF | ~10 ms | ~1 ms |
| Build JT | ~20 ms | ~2 ms |
| Inference (all marginals) | ~15 ms (VE) | ~3 ms (JTA) |
| Inference (all marginals) | ~8 ms (BP) | N/A |

pgmpy is implemented in pure Python with numpy for numerics. nabab's TypeScript with Float64Array is likely faster per-operation, though neither has published benchmarks. For small networks, both are "instant."

### 2.2 bnlearn (R)

**The dominant BN library in the R ecosystem.** Maintained by Marco Scutari; published alongside the textbook "Bayesian Networks with Examples in R."

**What bnlearn offers that nabab doesn't**:

- **Best-in-class structure learning**: constraint-based (PC, grow-shrink, IAMB variants), score-based (hill-climbing, tabu search), hybrid (MMHC, H2PC), and local discovery (ARACNE, Chow-Liu).
- **Scoring functions**: BIC, AIC, BDe, BDs, K2, log-likelihood, custom.
- **Conditional independence tests**: mutual information (discrete), correlation/partial correlation (continuous), kernel-based.
- **Bayesian parameter estimation** with Dirichlet priors.
- **Cross-validation** for model comparison.
- **Gaussian BNs** (continuous variables with linear Gaussian CPDs).
- **Hybrid BNs** (mixed discrete/continuous, via Conditional Linear Gaussian).

**What bnlearn doesn't have**:

- No built-in inference engine. bnlearn delegates to gRain (JTA) or bnlearn's own sampling methods for inference. The focus is structure/parameter learning, not interactive inference.
- No interactive visualization (uses Rgraphviz or bnviewer for static plots).
- No browser deployment.
- No MCP integration.

bnlearn is the right tool for researchers who want to learn a network from data in R. It is not a competitor for interactive inference tools.

### 2.3 pomegranate (Python)

**A general-purpose probabilistic modeling library**, covering BNs, HMMs, GMMs, and Markov chains. Rewritten from scratch for v1.0 (2023) using PyTorch as the backend.

**What pomegranate offers**:

- **GPU-accelerated inference** via PyTorch tensors. Factor operations run on CUDA if available.
- **Batched inference**: query multiple evidence configurations simultaneously.
- **Parameter learning with gradient descent**: differentiable CPTs trained end-to-end.
- **Broad model support**: BNs are one of many model types.

**What pomegranate doesn't have**:

- No structure learning (v1.0 removed it; it was buggy in v0.x).
- No approximate inference (JTA only).
- No interactive viewer.
- API is more complex than nabab's focused BN API.
- The v1.0 rewrite broke backward compatibility and is still stabilizing.

pomegranate's interesting angle is GPU-accelerated differentiable inference. If nabab wanted to explore automatic CPT learning from data, pomegranate's approach (PyTorch backend, gradient through JTA) is a template.

### 2.4 libDAI (C++)

**The most algorithmically comprehensive inference library.** Implements ~15 inference algorithms, rigorously benchmarked.

**Algorithms**: JT, BP, fractional BP, tree-EP, mean field, HAK (generalized BP), double-loop, Gibbs, conditioned BP, decimation, and more.

**What libDAI offers**:

- **Algorithm selection**: easily switch between exact and approximate methods.
- **Factor graph representation**: more general than BN-specific representations.
- **Benchmarking framework**: standardized UAI format, inference competition results.
- **Proven correctness**: used as a reference implementation in dozens of papers.

**What libDAI doesn't have**:

- No structure learning. Inference only.
- No visualization.
- C++ compilation required (no pip install, no npm install).
- API is low-level (factor graphs, not named variables with outcomes).
- Last significant update: 2015. Maintained but not actively developed.

libDAI is a reference for algorithm implementation quality. If nabab adds loopy BP, libDAI's implementation would be the gold standard to compare against.

### 2.5 GeNIe / SMILE (C++ / Desktop)

**The closest competitor in terms of interactive experience.** GeNIe is a desktop GUI; SMILE is its C++ inference library.

**What GeNIe offers**:

- Polished desktop application with drag-drop network editing.
- Influence diagrams (decision + utility nodes).
- Dynamic BNs, continuous nodes.
- Sensitivity analysis built in.
- Structural EM for parameter learning.
- XDSL file format (widely used in BN community).

**What GeNIe doesn't have**:

- Not browser-based. Requires installation.
- Not open-source (free for academic use, commercial license for production).
- No MCP integration.
- No programmatic API for web applications.
- Desktop-only; cannot be embedded in web pages.

GeNIe is the standard that nabab's viewer aspires to. The gap is significant in features (GeNIe has decades of development), but nabab's web-native nature is a fundamental architectural advantage for modern deployment scenarios.

### 2.6 Other Notable Tools

**Infer.NET** (Microsoft, C#): Expectation Propagation and Variational Message Passing for .NET. Very different scope (continuous models, factor graphs) but excellent documentation of message-passing algorithms.

**Stan**: MCMC/HMC for continuous Bayesian models. Not applicable to discrete BNs directly, but the NumPyro/Pyro ecosystem that complements Stan can handle discrete variables.

**dagitty** (R/JavaScript): browser-based DAG editor with causal inference capabilities (d-separation, adjustment sets, instrumental variables). Not an inference engine, but its JavaScript DAG manipulation code could complement nabab's inference.

**jsbayes** (JavaScript): abandoned (last commit 2017). Implemented basic VE, no JTA, no soft evidence, no visualization. Confirms the gap in the JavaScript ecosystem.

**bayesjs** (JavaScript): minimal implementation, limited to small networks, no active development.

---

## 3. nabab's Unique Angles

### 3.1 Browser-Native Inference Engine

No other maintained library provides a full junction tree algorithm in JavaScript/TypeScript that runs natively in browsers. This enables:

- **Zero-install demonstrations**: share a URL, the network loads and runs inference in the browser.
- **Embedding in web applications**: `<iframe>` or direct `import { BayesianNetwork } from 'nabab'`.
- **Offline capability**: no server round-trips for inference.
- **Edge deployment**: run on devices without Python/R/C++ toolchains.

This is not merely a convenience---it's a fundamentally different deployment model. pgmpy requires a Jupyter server or API backend; bnlearn requires R; GeNIe requires a desktop app. nabab runs where the user already is: the browser.

### 3.2 Interactive Evidence Manipulation

The viewer's slider-based soft evidence is genuinely novel among open-source tools. Most BN viewers (GeNIe included) treat evidence as binary: either a variable is observed or it isn't. nabab's continuous sliders enable:

- **Gradual "what-if" exploration**: slide from "80% sure it rained" to "20% sure."
- **Sensitivity visualization**: see how posteriors change smoothly as evidence strength varies.
- **Teaching**: demonstrate the difference between hard and soft evidence interactively.

### 3.3 MCP Integration

nabab is (as of this writing) the only Bayesian network engine with a native Model Context Protocol server. This means:

- LLMs can load networks, set evidence, and query posteriors through structured tool calls.
- No custom wrapper code needed---just point an MCP-compatible client at nabab's server.
- Enables conversational exploration: "What happens if we observe that the dog is barking?"

This positions nabab at the intersection of probabilistic reasoning and LLM-based AI assistants---a niche that will grow as MCP adoption increases.

### 3.4 Shareable State via URL Hash

The viewer compresses full state (network, evidence, positions, zoom) into a URL hash. This enables:

- Bookmarkable inference results.
- Shareable links for collaboration or teaching.
- Embedding specific evidence configurations in documentation.

No other BN tool offers this level of state portability.

---

## 4. Where nabab Could Carve a Niche

### 4.1 Education and Demonstration

**Target**: university courses on probabilistic graphical models, AI/ML courses that cover BNs, conference tutorials.

**Why nabab fits**: zero-install, interactive, shareable URLs. A professor can embed a nabab viewer in course slides (iframe) and have students manipulate evidence live. No conda environments, no kernel crashes.

**What's needed**: a curated set of pedagogical examples (Asia, Sprinkler, Student, ALARM), step-by-step inference visualization (show cliques, show message passing), and documentation.

### 4.2 Embedded BN Widget for Web Applications

**Target**: medical decision support tools, risk dashboards, diagnostic interfaces.

**Why nabab fits**: the library is ~50KB minified (excluding viewer), has zero runtime dependencies (once XMLBIF parsing is decoupled from DOM), and provides a clean programmatic API. A healthcare startup could embed `BayesianNetwork.infer()` directly in their frontend.

**What's needed**: proper npm packaging (move jsdom to devDependencies, pure-TS parser), API documentation, and a `BayesianNetwork.fromJSON()` method for non-XML workflows.

### 4.3 LLM-Powered Probabilistic Reasoning

**Target**: AI assistants that need to reason about uncertainty, diagnose problems, or explain causal relationships.

**Why nabab fits**: the MCP server provides a ready-made interface. An LLM can:
1. Load a domain-specific network (medical diagnosis, troubleshooting, risk assessment).
2. Incorporate user-provided observations as evidence.
3. Query posteriors and explain results in natural language.
4. Perform sensitivity analysis ("which observation would most change the diagnosis?").

**What's needed**: do-calculus support (to distinguish "observing X" from "intervening on X"), soft evidence in the MCP tool, and possibly a `most_informative_observation` tool that computes expected information gain for each unobserved variable.

### 4.4 Lightweight Causal Inference in JavaScript

**Target**: data scientists who need causal reasoning in Node.js pipelines or browser-based tools.

**Why nabab fits**: no existing JS library combines DAG manipulation with probabilistic inference. dagitty does causal graph analysis (d-separation, adjustment sets) but has no inference engine. nabab has inference but no causal analysis. Combining both would create the only JavaScript causal inference tool.

**What's needed**: implement d-separation testing, backdoor criterion identification, graph surgery for do-operator, and the ID algorithm for causal effect identification.

---

## 5. Competitive Strategy Summary

| Dimension | pgmpy/bnlearn territory | nabab's territory |
|-----------|------------------------|-------------------|
| **Audience** | Researchers, data scientists | Developers, educators, AI assistants |
| **Deployment** | Python/R scripts, Jupyter | Browser, npm, MCP |
| **Strength** | Structure learning, algorithm breadth | Interactivity, zero-install, embeddability |
| **Weakness** | No visualization, heavy runtime | No learning, limited algorithms |
| **Right play** | Stay broad, be the reference | Stay focused, own the web+LLM niche |

nabab should **not** try to compete with pgmpy on structure learning or algorithm breadth. Instead, it should double down on what pgmpy cannot do:

1. **Run in a browser** with no installation.
2. **Provide interactive visual exploration** of Bayesian networks.
3. **Integrate with LLMs** via MCP.
4. **Be embeddable** in web applications as a lightweight library.

The competitive moat is not algorithmic sophistication---it's deployment model and user experience. pgmpy will always have more algorithms. nabab should aim to be the tool people reach for when they need to *show* a Bayesian network to someone, *explore* it interactively, or *connect* it to an AI assistant.
