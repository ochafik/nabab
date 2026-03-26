# Research Report: The State of Bayesian Network Inference (2008--2026)

This document surveys the algorithms, software, and research trends in Bayesian network inference, with an emphasis on what has changed since the "classical" era (pre-2008) and what is practically relevant to an engine like nabab.

---

## 1. Exact Inference Algorithms

### 1.1 Variable Elimination (VE)

The simplest exact algorithm. Given a query variable Q and evidence E, VE:

1. Constructs a factor for each CPT.
2. Iteratively picks a non-query, non-evidence variable, multiplies all factors mentioning it, and marginalizes (sums) it out.
3. The final product of remaining factors, once normalized, gives P(Q | E).

**Complexity.** The cost is dominated by the largest intermediate factor, which depends on the **elimination order**. Finding the optimal order is NP-hard (equivalent to treewidth computation). In practice, heuristics work:

| Heuristic | Description | Quality |
|-----------|-------------|---------|
| Min-degree | Eliminate the variable with fewest remaining neighbors | Good general-purpose; what nabab uses |
| Min-fill | Eliminate the variable that adds the fewest fill-in edges | Often slightly better cliques than min-degree |
| Min-weight | Minimize the product of domain sizes of neighbors | Better for heterogeneous cardinalities |
| Weighted min-fill | Min-fill weighted by domain sizes | State-of-the-art heuristic (Gogate & Dechter, 2004) |

VE answers one query at a time. For all-marginals queries (computing every variable's posterior), the junction tree algorithm is more efficient because it amortizes the computation.

### 1.2 Junction Tree Algorithm (JTA)

Also called the Shafer-Shenoy or Lauritzen-Spiegelhalter algorithm. This is what nabab implements. The steps:

1. **Moralize** the DAG: drop edge directions, marry co-parents.
2. **Triangulate** the moral graph: add fill-in edges to make it chordal.
3. **Identify maximal cliques** of the chordal graph.
4. **Build a junction tree** (clique tree): a maximum-weight spanning tree over cliques, where edge weight = |separator| (intersection size). This ensures the **running intersection property**: for any variable, the set of cliques containing it forms a connected subtree.
5. **Initialize clique potentials**: assign each CPT to the smallest clique containing all its variables; multiply assigned CPTs together.
6. **Two-pass message passing**:
   - **Collect** (leaves to root): each clique sends its marginalized potential to its parent.
   - **Distribute** (root to leaves): each clique sends updated potential to its children.
7. **Read off marginals**: for any variable V, find a clique containing V, marginalize out the rest, normalize.

After propagation, every clique potential is consistent (the "calibrated" junction tree). This means all single-variable marginals can be read off in O(1) per variable.

**Message passing formula.** When clique C_i sends to C_j:

```
new_separator(i,j) = sum_{C_i \ C_j} potential(C_i)
new_potential(C_j) *= new_separator(i,j) / old_separator(i,j)
```

The division by old_separator (Hugin architecture) avoids double-counting. nabab implements exactly this (see `passMessage` in `src/lib/inference.ts`).

**Complexity.** O(n * d^w) where n = number of cliques, d = max domain size, w = treewidth (max clique size - 1). For the alarm network (37 variables, treewidth ~4), this is instantaneous. For networks with treewidth > 20, exact inference becomes impractical.

### 1.3 Bucket Elimination

A generalization of VE that organizes computation into "buckets" (one per variable in the elimination order). Functionally equivalent to VE but provides a framework for:

- **Mini-bucket elimination**: approximate inference by splitting large buckets, bounding the result.
- **AND/OR search**: combining bucket elimination with branch-and-bound for MAP queries.

### 1.4 Recursive Conditioning

Darwiche's algorithm (2001) trades time for space: O(n * d^w) time but only O(n * d * w) space (linear in treewidth). Useful when memory is the bottleneck---e.g., networks with treewidth 15-25 where junction trees would require gigabytes for clique tables but recursive conditioning fits in megabytes.

---

## 2. Approximate Inference

When treewidth exceeds ~20-25, exact methods are infeasible. Approximate methods trade accuracy for tractability.

### 2.1 Loopy Belief Propagation (LBP)

Run the junction tree message-passing rules on a graph that is **not** a tree (i.e., the cluster graph has loops). Messages are passed iteratively until convergence (or a fixed iteration limit).

- **Convergence**: not guaranteed; may oscillate. Damping (weighted average of old and new messages) helps.
- **Accuracy**: often surprisingly good, especially for graphs with long loops. Theoretical guarantees exist for certain graph families (e.g., attractive models, single-loop graphs).
- **Variants**: Generalized Belief Propagation (Yedidia, Freeman, Weiss 2005), Tree-Reweighted BP (Wainwright et al. 2005), Fractional BP.

LBP is the workhorse of many practical systems (error-correcting codes, computer vision) and runs in O(iterations * edges * d^2) for pairwise models.

### 2.2 Variational Methods

Frame inference as optimization: find an approximate distribution q(X) that minimizes some divergence from the true posterior p(X|E).

#### Mean Field Variational Inference
- Assumes q factorizes: q(X) = product_i q_i(X_i).
- Minimizes KL(q || p) by coordinate ascent over each q_i.
- Fast but underestimates uncertainty (mode-seeking).

#### Expectation Propagation (EP)
- Projects p onto an exponential family by minimizing KL(p || q) locally at each factor.
- Better calibrated than mean field; used in Infer.NET.

#### Variational Message Passing (VMP)
- Structured mean field on a factor graph; each variable node updates by taking expectations over its Markov blanket.
- Implemented in Edward, Pyro, and Infer.NET.

#### Amortized Variational Inference (AVI)
- Train a neural network (the "encoder" or "inference network") to map observations directly to approximate posterior parameters.
- This is the core of Variational Autoencoders (Kingma & Welling, 2014).
- One-time training cost; then inference is a single forward pass (milliseconds).
- Relevant to nabab: could pre-train an inference network for a given BN structure, then use it for instant approximate posteriors without running JTA each time.

### 2.3 Monte Carlo Methods

#### Gibbs Sampling
- Initialize all non-evidence variables randomly.
- Repeatedly sample each variable from its conditional distribution given its Markov blanket.
- After burn-in, samples approximate the posterior.
- Simple to implement; converges for any positive distribution; can be slow to mix in tightly coupled networks.

#### Metropolis-Hastings and Hamiltonian Monte Carlo (HMC)
- HMC exploits gradient information (requires continuous variables or relaxation).
- Stan's NUTS sampler (Hoffman & Gelman, 2014) auto-tunes HMC; gold standard for continuous Bayesian models.
- Not directly applicable to discrete BNs without tricks (e.g., Gumbel-Softmax relaxation).

#### Particle Filters / Sequential Monte Carlo (SMC)
- Designed for temporal/dynamic Bayesian networks.
- Maintains a population of weighted samples ("particles"), resampled at each time step.
- Particle count determines accuracy/cost tradeoff: 100-10,000 particles typical.
- Used heavily in robotics (SLAM), tracking, and real-time monitoring.

#### Importance Sampling and Likelihood Weighting
- Sample from the prior, weight by likelihood of evidence.
- Simple but high variance when evidence is unlikely.
- Adaptive variants (AIS, SMC samplers) much better.

### 2.4 Comparison: When to Use What

| Method | Network Size | Treewidth | Evidence Type | Speed | Accuracy |
|--------|-------------|-----------|---------------|-------|----------|
| Junction Tree | <500 vars | <20 | Any | ms-sec | Exact |
| Variable Elimination | <500 vars | <20 | Single query | ms | Exact |
| Loopy BP | 1K-1M vars | Any | Hard only* | sec-min | ~Good |
| Mean Field VI | 1K-100K vars | Any | Any | sec | Approximate |
| Gibbs Sampling | <10K vars | Any | Any | sec-min | Converges |
| Particle Filter | Dynamic BNs | Any | Sequential | ms per step | ~Good |
| Amortized VI | Any (fixed structure) | Any | Any | ms (after training) | ~Good |

*LBP with soft evidence requires modifications (virtual evidence nodes or likelihood-weighted messages).

---

## 3. Modern Advances (2008--2026)

### 3.1 Structure Learning

Learning the DAG structure from data, rather than specifying it by hand.

- **Score-based**: search over DAGs optimizing BIC, AIC, or Bayesian score (BDeu). Exact methods (integer programming, dynamic programming) scale to ~30 variables; heuristic search (hill-climbing, tabu search, FGES) to thousands.
- **Constraint-based**: PC algorithm, FCI. Use conditional independence tests to orient edges. Scale well but sensitive to test errors.
- **Hybrid**: MMHC (Tsamardinos et al., 2006) combines constraint-based skeleton discovery with score-based orientation. Popular default in bnlearn.
- **Continuous optimization**: NOTEARS (Zheng et al., 2018) formulates DAG learning as a continuous optimization problem with an acyclicity constraint. Enables gradient-based learning; extended by DAG-GNN, GOLEM, etc.
- **Causal discovery from interventions**: combining observational and experimental data (e.g., Hauser & Buhlmann, 2012).

### 3.2 Causal Inference

Pearl's do-calculus (2000s, formalized and extended through 2020s) provides a formal framework for answering causal ("interventional") queries from observational data:

- **do-operator**: P(Y | do(X=x)) differs from P(Y | X=x) in general. The do-operator "cuts" incoming edges to X.
- **Backdoor criterion**: if a set Z blocks all backdoor paths from X to Y, then P(Y|do(X=x)) = sum_z P(Y|X=x,Z=z)P(Z=z).
- **Front-door criterion**: for cases where no valid backdoor set exists.
- **Identification algorithms**: Tian & Pearl (2002), Shpitser & Pearl (2006) give complete algorithms for determining whether a causal effect is identifiable from a given DAG.

This matters for nabab because: a Bayesian network viewer that could distinguish observational conditioning from interventional conditioning would be a significant differentiator. Currently, `infer(evidence)` computes P(Y|X=x) (conditioning), but P(Y|do(X=x)) requires graph surgery (deleting edges into X) followed by inference.

**Modern causal ML** (Double ML, causal forests, targeted learning) uses BNs as the structural model but fits nuisance parameters with ML. Libraries: DoWhy (Microsoft), CausalML, EconML.

### 3.3 Deep Probabilistic Programming

The convergence of deep learning and probabilistic inference:

- **Pyro** (Uber, 2017): built on PyTorch. Supports stochastic variational inference (SVI), NUTS, and amortized inference. Can mix neural networks with probabilistic models.
- **NumPyro**: JAX-based Pyro variant; JIT-compiled, very fast NUTS and SVI.
- **Edward / TensorFlow Probability** (Google, 2016-2018): TFP provides distributions, bijectors, and MCMC/VI on TensorFlow's computation graph. Edward2 integrated into TFP.
- **Stan** (2012-present): domain-specific language for Bayesian modeling. NUTS sampler. Not "deep" but the gold standard for MCMC. Stan Math library has excellent automatic differentiation.
- **Gen** (MIT, 2019): Julia-based; programmable inference. Supports custom proposal distributions and inference compilation.

These systems are designed for continuous latent variables and complex likelihoods (neural nets as observation models). For *discrete* Bayesian networks specifically, they are overkill---but they represent where the field has moved.

### 3.4 GPU Acceleration

- **cuBNLearn** (2019): GPU-accelerated structure learning.
- **TensorFlow Probability** / **Pyro**: leverage GPU for gradient-based VI and MCMC.
- **Factor graph on GPU**: embarrassingly parallel factor operations. Each factor multiplication/marginalization is a tensor operation; CUDA kernels can parallelize across table entries.
- **For nabab**: the Float64Array factor operations in `factor.ts` are already cache-friendly and vectorizable. A WebGPU backend could parallelize `multiplyFactors` and `marginalize` for large factors, but the bottleneck in JTA is sequential message passing, not individual factor ops. GPU helps more for LBP (all messages can be passed in parallel) or sampling (many particles simultaneously).

### 3.5 Automatic Differentiation for Inference

A major trend: treat inference as a differentiable computation.

- **Differentiable junction tree**: Sethuraman et al. (2020) showed that JTA can be made differentiable, enabling gradient-based learning of CPT parameters.
- **Probabilistic circuits** (PCs): sum-product networks generalized. Compile a BN into a PC for guaranteed polynomial-time marginal inference. Tools: SPFlow, Juice.jl.
- **Knowledge compilation**: compile a BN into a d-DNNF or SDD (Sentential Decision Diagram) for constant-time per-query inference after a one-time exponential compilation. Tool: c2d, D4, PySDD.

### 3.6 Neural Network Integration

- **Neural Bayes nets**: replace CPTs with neural networks that parameterize conditional distributions. Train end-to-end.
- **Graph Neural Networks for inference**: use message-passing GNNs to approximate belief propagation. Yoon et al. (2019) showed GNNs can learn to do inference on unseen BN structures.
- **Neural inference compilation** (Le et al., 2017): train a neural network to propose samples for importance sampling, dramatically reducing variance.

---

## 4. Key Libraries and Frameworks

### 4.1 Classical BN Libraries

| Library | Language | Exact | Approximate | Structure Learning | Active |
|---------|----------|-------|-------------|-------------------|--------|
| **pgmpy** | Python | VE, JTA, BP | Gibbs, BayesBall | HC, MMHC, PC, etc. | Yes |
| **bnlearn** | R | Exact (via gRain) | N/A | HC, Tabu, MMHC, PC, GS | Yes |
| **libDAI** | C++ | JT, BP, HAK | LBP, Mean Field, etc. | No | Maintained |
| **pomegranate** | Python/Cython | Sum-product | Sampling | Some | v1.0 rewrite |
| **Netica** | C/API | JT | Sampling | Limited | Commercial |
| **Hugin** | C | JT | N/A | Limited | Commercial |
| **GeNIe/SMILE** | C++ | JT, AIS | Importance sampling | Structural EM | Free academic |

### 4.2 Deep Probabilistic Programming

| Framework | Language | Backend | Strengths |
|-----------|----------|---------|-----------|
| **Stan** | Stan DSL | C++ | NUTS, gold standard MCMC |
| **Pyro** | Python | PyTorch | SVI, amortized inference, flexible |
| **NumPyro** | Python | JAX | Fast NUTS, JIT compilation |
| **TensorFlow Probability** | Python | TensorFlow | Production-grade, distributions library |
| **Infer.NET** | C# | .NET | EP, VMP, enterprise use |
| **Bean Machine** | Python | PyTorch | Compositional inference (Meta) |

### 4.3 Causal Inference

| Library | Language | Focus |
|---------|----------|-------|
| **DoWhy** | Python | Causal effect estimation, refutation |
| **CausalNex** | Python | Structure learning + causal inference |
| **Tetrad** | Java | Causal discovery (PC, FCI, GES) |
| **causal-learn** | Python | Python port of Tetrad algorithms |
| **dagitty** | R/JS | DAG drawing + identification |

### 4.4 Browser-Native / JavaScript

This is where the landscape is thin:

| Library | Status | Notes |
|---------|--------|-------|
| **jsbayes** | Unmaintained (2017) | Simple VE, no JTA |
| **bayesjs** | Small, limited | Basic networks only |
| **nabab** | Active | Full JTA, soft evidence, interactive viewer, MCP |
| **dagitty** | Active | DAG tool but not an inference engine |

There is no mature, full-featured Bayesian network inference engine in TypeScript/JavaScript. This is nabab's primary niche opportunity.

---

## 5. Quantitative Comparisons

### 5.1 Inference Speed Benchmarks (approximate, from literature)

For the ALARM network (37 variables, max CPT 4 parents):

| Engine | Method | Time |
|--------|--------|------|
| libDAI (C++) | JT | ~0.1 ms |
| pgmpy (Python) | VE | ~5 ms |
| pgmpy (Python) | BP | ~10 ms |
| nabab (TypeScript) | JT | ~1-2 ms (estimated) |
| GeNIe (C++) | JT | ~0.05 ms |

For larger networks (e.g., Barley, 48 vars, treewidth ~7):

| Engine | Method | Time |
|--------|--------|------|
| libDAI | JT | ~1 ms |
| pgmpy | VE | ~50 ms |
| Hugin (C) | JT | ~0.5 ms |

For networks with treewidth > 15 (e.g., Pigs, 441 vars, treewidth ~10):

| Engine | Method | Time |
|--------|--------|------|
| libDAI | JT | ~100 ms |
| pgmpy | VE | ~2 sec |
| pgmpy | LBP | ~500 ms |

### 5.2 Scaling Laws

- **Junction tree**: O(n * exp(treewidth)). Doubling treewidth roughly squares the cost.
- **LBP**: O(iterations * edges * d^2). Scales linearly with graph size for fixed degree.
- **Gibbs sampling**: O(samples * n). Linear in graph size per sample, but may need many samples.
- **VI**: O(iterations * n * d). Linear in graph size per iteration.

---

## 6. The Role of Bayesian Networks in Modern AI/ML

### 6.1 Causal ML and Explainability

BNs are experiencing a renaissance because of the demand for **explainable AI**. A BN makes its assumptions explicit (the DAG structure) and its predictions interpretable (conditional probabilities).

- **Medical diagnosis**: ALARM, QMR-DT, and modern clinical decision support systems use BNs. Regulatory requirements (EU AI Act) favor interpretable models.
- **Risk assessment**: insurance, finance, cybersecurity.
- **Explainable recommendations**: "this prediction was influenced by X because X affects Y through Z."

### 6.2 Decision Support

Influence diagrams (BNs + decision + utility nodes) are used in:
- Military planning (DARPA)
- Oil exploration (Hugin's original market)
- Healthcare treatment optimization

### 6.3 Integration with ML Pipelines

Modern use of BNs often involves:
1. Use ML (random forests, neural nets) to estimate CPT parameters from data.
2. Use the BN structure for reasoning about interventions, counterfactuals, or missing data.
3. Use BN inference to propagate uncertainty through a system model.

This is the "neuro-symbolic" approach: neural networks for perception, BNs for reasoning.

### 6.4 Where BNs Are Less Relevant

- **High-dimensional continuous data**: deep generative models (VAEs, diffusion models, normalizing flows) have largely replaced BNs.
- **Sequence modeling**: transformers and RNNs dominate.
- **Reinforcement learning**: POMDPs use BN-like structures but with specialized solvers.

BNs remain strongest for **discrete, structured domains** where the graph is known or partially known, and where **interpretability** and **causal reasoning** matter.

---

## 7. Summary: What Matters for nabab

1. **The JTA implementation is the right choice** for an interactive engine targeting networks up to ~100 variables with treewidth < 15. Exact inference is fast enough for real-time interaction.

2. **Min-degree elimination ordering** (what nabab uses) is good but not optimal. Switching to **min-fill** or **weighted min-fill** would improve clique sizes for pathological networks at negligible code complexity cost.

3. **Soft evidence support** is a genuine differentiator. Most educational BN tools only support hard evidence. nabab's `applyLikelihood` is correct and useful.

4. **For larger networks (100+ variables, treewidth > 15)**, nabab would need either:
   - A loopy BP fallback (relatively easy to implement on the existing factor infrastructure).
   - A mini-bucket approximation.
   - A sampling method (Gibbs is simplest for discrete BNs).

5. **Causal inference** (do-calculus support) would be a high-value addition: graph surgery + inference is mechanically simple given the existing JTA.

6. **The browser-native niche is real**: no other mature JS/TS library offers JTA + interactive visualization + MCP integration. pgmpy and bnlearn require Python/R environments.

7. **Structure learning** is the biggest missing capability compared to pgmpy/bnlearn, but it's also the hardest to add and may not be the right priority for an inference-focused interactive tool.
