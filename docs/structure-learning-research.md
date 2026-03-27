# Research Report: Bayesian Network Structure Learning from Data

**Question:** Is it feasible to build a "drop CSV, get Bayesian network" feature -- where a user uploads a spreadsheet and the app infers variables, distributions, and network structure automatically?

**Short answer:** Yes, for small-to-medium datasets (up to ~50 variables, ~10k rows). Hill climbing with BIC scoring is implementable in pure TypeScript and runs in-browser in under a second for typical inputs. A working MVP is a focused weekend-to-week project; a polished, production-quality feature with discretization, missing data handling, and interactive refinement is a 2--4 week effort. The critical enabler is `@kanaries/causal` (v0.1.1, March 2026), a TypeScript library that already implements PC, GES, and other algorithms with browser support.

---

## 1. Structure Learning Algorithms

Structure learning is the problem of discovering the DAG (or its equivalence class) from observational data. It is NP-hard in general (Chickering, 2004). The algorithms fall into five families.

### 1.1 Constraint-Based Methods

These algorithms use **conditional independence (CI) tests** to infer the graph skeleton, then orient edges using orientation rules.

#### PC Algorithm (Spirtes & Glymour, 1991)

The workhorse constraint-based method. Steps:

1. Start with a complete undirected graph.
2. For each pair (X, Y), test if X _||_ Y | Z for conditioning sets Z of increasing size. If independent, remove the edge.
3. Orient v-structures: if X -- Z -- Y, X and Y are not adjacent, and Z is not in the separating set, orient as X -> Z <- Y.
4. Apply Meek's orientation rules to propagate edge directions without creating new v-structures or cycles.

**CI test:** For discrete data, the chi-squared test or G-test. For continuous Gaussian data, Fisher's z-test on partial correlations. The choice of significance level alpha (typically 0.01--0.05) controls sparsity.

**Complexity:** O(n^d) CI tests in the worst case, where n is the number of variables and d is the maximum degree. In practice, sparse graphs make this manageable. The "stable" variant (PC-stable) gives order-independent results.

**Strengths:** Principled statistical foundation; works well with large sample sizes; naturally outputs a CPDAG (completed partially directed acyclic graph), which represents the Markov equivalence class.

**Weaknesses:** Sensitive to errors in early CI tests (cascading failures); requires large samples for reliable testing; assumes causal sufficiency (no latent confounders).

#### FCI (Fast Causal Inference) (Spirtes, Meek & Richardson, 2000)

An extension of PC that handles **latent confounders**. Instead of outputting a CPDAG, it outputs a PAG (Partial Ancestral Graph) that uses bidirected edges (X <-> Y) to indicate possible hidden common causes.

**Key difference from PC:** Additional steps to detect and mark possible latent confounders using discriminating paths and supplemental orientation rules.

**Complexity:** More expensive than PC due to extra orientation phase. Practical for up to ~30--50 variables.

**Strengths:** Correct even with hidden confounders (under faithfulness). Essential when you cannot guarantee all relevant variables are measured.

**Weaknesses:** Output PAGs are harder to interpret than DAGs; more edges may remain unoriented; computationally heavier.

#### IC / IC* (Inductive Causation) (Verma & Pearl, 1991)

Pearl's foundational algorithms. IC recovers the skeleton by testing all pairs for d-separation, then orients v-structures. IC* extends this to handle latent variables (analogous to FCI). Historically important as the theoretical foundation for PC and FCI, but rarely used directly in implementations today -- PC is strictly more practical.

### 1.2 Score-Based Methods

These algorithms search DAG space by optimizing a scoring function that balances data fit against model complexity.

#### Scoring Functions

| Score | Formula (per family X_i with parents Pa_i) | Notes |
|-------|---------------------------------------------|-------|
| **BIC** (Schwarz, 1978) | LL(D \| theta_MLE) - (k/2) * ln(N) | LL = log-likelihood, k = #parameters, N = sample size. Equivalent to MDL. Consistent: recovers true structure as N -> inf. **Recommended default.** |
| **AIC** (Akaike, 1974) | LL(D \| theta_MLE) - k | Weaker penalty than BIC; tends to overfit with moderate samples. |
| **BDeu** (Heckerman et al., 1995) | Bayesian Dirichlet equivalent uniform score. Uses Dirichlet priors with an equivalent sample size (ESS) hyperparameter. | Bayesian score; good with small data; sensitive to ESS choice (typical: 1--10). |
| **K2** (Cooper & Herskovits, 1992) | Special case of BDeu with uniform priors (ESS=1 per cell). | Simple but less flexible. |

Empirical comparisons consistently show **BIC outperforms BDeu, AIC, and fNML** for recovering true structure (de Campos, 2006; Liu et al., 2012).

All these scores are **decomposable**: the total network score is the sum of local scores for each variable given its parents. This enables efficient incremental updates during search.

#### Hill Climbing (HC)

The simplest and most practical score-based algorithm:

1. Start from an empty graph (or a given initial structure).
2. At each step, evaluate all possible single-edge operations: **add**, **delete**, or **reverse** an edge.
3. Apply the operation that improves the score the most.
4. Stop when no operation improves the score (local maximum).

**Complexity:** Each step evaluates O(n^2) candidate operations. Each operation requires recomputing one local score, which takes O(N * |outcomes|^(|parents|+1)) for discrete data. For a typical dataset (n=20 variables, N=1000 rows, max 4 parents), each step takes milliseconds. The algorithm typically converges in O(n) to O(n^2) steps.

**Strengths:** Simple to implement (~200 lines of code); fast; produces a DAG directly; easy to incorporate prior knowledge (blacklists/whitelists on edges).

**Weaknesses:** Gets stuck in local optima. Mitigated by random restarts or tabu search.

#### Tabu Search

Extends hill climbing with a **tabu list** -- a memory of recently visited states that are temporarily forbidden. This forces the search away from local optima.

**Typical parameters:** Tabu list length of 5--20. The bnlearn R package uses tabu length = 10 * sqrt(n) by default.

**Performance:** Empirically better than HC, especially for larger networks. With large samples, tabu search achieves the lowest structural Hamming distance (SHD) on 10/10 benchmark networks (Scutari et al., 2019).

#### K2 Algorithm (Cooper & Herskovits, 1992)

A greedy search that requires a **fixed variable ordering** as input:

1. For each variable (in order), greedily add the parent from preceding variables that most improves the score.
2. Stop adding parents when no addition improves the score (or a max-parent limit is reached).

**Strengths:** Very fast -- O(n^2) total evaluations. No edge reversals needed.

**Weaknesses:** Results depend entirely on the variable ordering. An incorrect ordering produces an incorrect structure. Impractical when the ordering is unknown (which is the common case for CSV-upload scenarios).

#### GES (Greedy Equivalence Search) (Chickering, 2002)

Searches the space of **equivalence classes** (CPDAGs) rather than individual DAGs:

1. **Forward phase:** Start from the empty graph. Greedily add edges (in equivalence class space) that improve the score.
2. **Backward phase:** Greedily remove edges that improve the score.

**Complexity:** Total states visited is at most n(n-1). In practice, linear in n. But evaluating neighbors at each state can be expensive for dense graphs.

**Strengths:** Provably finds the optimal equivalence class in the large-sample limit (assuming faithfulness). Avoids some local optima that trap HC.

**Weaknesses:** More complex to implement than HC. The equivalence class operators are non-trivial. Slower per step than HC.

**FGES (Fast GES):** Ramsey et al. (2017) introduced a parallelized version that scales to thousands of variables.

### 1.3 Hybrid Methods

Combine constraint-based skeleton discovery with score-based edge orientation.

#### MMHC (Max-Min Hill Climbing) (Tsamardinos et al., 2006)

The most well-known hybrid:

1. **MMPC phase:** Use the Max-Min Parents and Children algorithm (a constraint-based method) to learn an undirected skeleton. MMPC performs CI tests to identify the neighborhood of each variable.
2. **HC phase:** Orient edges using greedy hill climbing with BDeu scoring, restricted to edges in the skeleton from step 1.

**Strengths:** The constraint phase prunes the search space dramatically, making the score-based phase much faster. Empirically strong performance across many benchmarks.

**Weaknesses:** Errors in the skeleton phase propagate to the orientation phase. Two hyperparameters to tune (CI test alpha + scoring function).

#### H2PC (Gasse et al., 2014)

Similar to MMHC but uses the HPC (Hybrid Parents and Children) subroutine instead of MMPC. HPC combines incremental and divide-and-conquer constraint-based methods for more accurate neighborhood discovery. Experimentally outperforms MMHC on goodness-of-fit and structural accuracy.

### 1.4 Exact Methods

Guaranteed to find the globally optimal structure (for a given score), but with exponential cost.

#### Dynamic Programming (Koivisto & Sood, 2004; Silander & Myllymaki, 2006)

- Enumerate all possible parent sets for each variable.
- Use DP over subsets to find the highest-scoring DAG.
- **Time:** O(n * 2^n) to O(n^2 * 2^n). **Space:** O(2^n).
- Practical limit: **~25 variables** (2^25 = 33M states). For 30 variables: 2^30 = 1 billion states -- out of reach for in-browser use.

#### A* Search (Yuan & Malone, 2013)

Uses admissible heuristics (pattern databases, parent set bounds) to prune the search. Can handle slightly larger networks than DP but still limited to ~25--30 variables.

**Bottom line for a browser app:** Exact methods are out of scope for typical CSV datasets.

### 1.5 Modern / Deep Learning Methods

These reformulate structure learning as a continuous optimization problem, avoiding combinatorial search entirely.

#### NOTEARS (Zheng et al., NeurIPS 2018)

**Key idea:** The DAG constraint "W has no cycles" can be expressed as a smooth equality constraint on the weighted adjacency matrix W:

    h(W) = tr(e^(W * W)) - d = 0

where * denotes element-wise product, e^A is the matrix exponential, tr is the trace, and d is the number of variables. When h(W) = 0, the graph encoded by W is guaranteed acyclic.

**Algorithm:** Solve the continuous optimization problem:

    minimize   ||X - XW||^2_F       (least-squares loss)
    subject to h(W) = 0             (acyclicity)

using an augmented Lagrangian method. The entire algorithm is ~50 lines of Python.

**Complexity:** O(d^3) per iteration (matrix exponential). Scales to hundreds of variables.

**Strengths:** Elegant formulation; no combinatorial search; easy to extend to nonlinear models.

**Weaknesses:** Assumes linear Gaussian model (extensions exist for nonlinear). The trace exponential constraint has poor gradient behavior for large cycles (Ng et al., 2022). A critical analysis by Kaiser & Sipos (2022) found NOTEARS can be "unsuitable" for some real-world problems due to sensitivity to equal variances.

**JS feasibility:** The core computation is matrix multiplication and eigenvalue computation. With TensorFlow.js or a custom linear algebra implementation, this could run in-browser. The `@kanaries/causal` library already has infrastructure for this.

#### GOLEM (Ng et al., NeurIPS 2020)

Improves on NOTEARS by:
- Directly optimizing the data likelihood instead of least squares.
- Studying the role of sparsity and the acyclicity constraint.
- Specialized for linear Gaussian SEMs.

#### DAG-GNN (Yu et al., ICML 2019)

Uses a variational autoencoder with a graph neural network to learn nonlinear structure. The encoder learns an adjacency matrix; acyclicity is enforced via the same trace exponential constraint.

**Not practical for browser:** Requires PyTorch and GPU for training.

#### DAGMA (Bello et al., NeurIPS 2022)

Replaces the trace exponential acyclicity constraint with a **log-determinant** characterization:

    h(W) = -log det(sI - W * W) + d * log(s) = 0

This formulation: (1) detects large cycles more effectively, (2) has better-behaved gradients, and (3) runs ~10x faster than NOTEARS in practice.

**Most promising modern method** for practical use.

---

## 2. Parameter Learning

Once the structure (DAG) is known, we need to estimate the conditional probability tables (CPTs).

### 2.1 Maximum Likelihood Estimation (MLE)

For complete data (no missing values), MLE is trivial for discrete BNs:

    P(X_i = x | Pa_i = pa) = count(X_i = x, Pa_i = pa) / count(Pa_i = pa)

This is just counting co-occurrences in the data. O(N) per variable. **This is what a browser implementation should use as the default.**

**Problem:** Zero counts produce zero probabilities, which break inference. Solution: add pseudocounts (Laplace smoothing).

### 2.2 Bayesian Estimation (Dirichlet Priors)

The Dirichlet distribution is the conjugate prior for multinomial/categorical distributions. Given Dirichlet hyperparameters alpha:

    P(X_i = x | Pa_i = pa) = (count(X_i = x, Pa_i = pa) + alpha_x) / (count(Pa_i = pa) + sum(alpha))

With uniform priors (alpha_x = 1 for all x), this reduces to Laplace smoothing. With alpha_x = 0.5, it is Jeffreys' prior. BDeu uses alpha_x = ESS / (|outcomes| * |parent_configs|).

**Advantages over MLE:** No zero probabilities; regularization against overfitting; principled handling of sparse data.

**Implementation cost:** Trivially different from MLE -- just add pseudocounts.

### 2.3 EM Algorithm for Missing Data

When data has missing values (which is common in real CSV files):

**E-step:** Using current parameter estimates, compute expected sufficient statistics for missing entries via inference (e.g., junction tree).

**M-step:** Re-estimate parameters using the completed sufficient statistics (same formula as MLE/Bayesian estimation, but with fractional expected counts).

Iterate until convergence.

**Two variants:**
- **Soft EM:** Uses belief propagation to compute expected counts. Theoretically correct but requires running inference for each data point with missing values.
- **Hard EM:** Imputes the most likely values, then counts. Faster but biased; good enough in practice for most applications.

**Implementation cost:** Moderate. Requires an inference engine (nabab already has junction tree and variable elimination) plus iteration logic. The main challenge is performance -- running inference per incomplete row is expensive.

**Practical recommendation for a browser app:** For the MVP, require complete data or drop rows with missing values. Add EM as a later enhancement.

### 2.4 Discretization of Continuous Variables

Discrete BNs require categorical variables. Continuous columns must be discretized:

| Method | Description | When to use |
|--------|-------------|-------------|
| **Equal-width** | Divide range into k bins of equal width | Simple; poor for skewed data |
| **Equal-frequency (quantile)** | Each bin has approximately N/k observations | Robust to outliers; generally recommended |
| **K-means clustering** | Cluster values into k groups | Good for multi-modal distributions |
| **Domain-based** | Use meaningful thresholds (e.g., age: <18, 18-65, >65) | Best if domain knowledge available |
| **Sturges' rule** | k = ceil(1 + log2(N)) | Simple rule of thumb for k |
| **Scott's rule** | bin_width = 3.5 * std / N^(1/3) | Assumes approximately normal data |

**Recommended default:** Equal-frequency with k = 3--5 bins (labeled "Low", "Medium", "High" or similar). This is robust and interpretable.

**Auto-detection of variable types:**
1. If all values are 0/1 or True/False: **binary**.
2. If <= 10 unique values and all are strings/integers: **categorical**.
3. If numeric with > 10 unique values: **continuous** -- apply discretization.
4. Date columns: extract features (day-of-week, month) as categorical.

---

## 3. Available Libraries

### 3.1 Python Libraries

#### pgmpy (v1.0.0, 2025)

The most comprehensive Python library for Bayesian network modeling.

**Structure learning:**
- `HillClimbSearch`: Hill climbing with configurable scoring (BIC, K2, BDeu).
- `ExhaustiveSearch`: Brute-force enumeration (small networks only).
- `PC`: PC-stable algorithm with chi-squared or G-test.
- `MmhcEstimator`: MMHC hybrid algorithm.
- `TreeSearch`: Chow-Liu tree learning.
- `ExpertInLoop`: Interactive structure learning combining CI tests with expert knowledge.

**Parameter learning:** MLE, Bayesian estimation, EM for missing data.

**Scoring:** `BicScore`, `K2Score`, `BDeuScore`, `AICScore`.

**I/O:** BIF, XMLBIF, UAI formats.

Website: [pgmpy.org](https://pgmpy.org)

#### bnlearn (R, v5.0+, updated August 2025)

The gold standard for BN structure learning. The most complete implementation available.

**Structure learning:**
- Constraint-based: `pc.stable()`, `gs()` (Grow-Shrink), `iamb()`, `fast.iamb()`, `inter.iamb()`, `iamb.fdr()`, `mmpc()`, `si.hiton.pc()`, `hpc()`
- Score-based: `hc()` (hill climbing), `tabu()` (tabu search)
- Hybrid: `mmhc()`, `rsmax2()`, `h2pc()`
- Pairwise: `aracne()`, `chow.liu()`

**Parameter learning:** MLE and Bayesian (Dirichlet) estimation. Handles discrete, Gaussian, and conditional Gaussian networks.

**Benchmark repository:** [bnlearn.com/bnrepository](https://www.bnlearn.com/bnrepository/) -- gold-standard networks for testing.

Website: [bnlearn.com](https://www.bnlearn.com)

#### causal-learn (v0.1.3.6, Python)

From the PyWhy project (CMU). Focused on causal discovery.

**Algorithms:** PC, FCI, GES, LiNGAM, NOTEARS, CD-NOD, GIN, GRaSP, CAM-UV, plus many variants.

**CI tests:** Chi-squared, G-test, Fisher's z, kernel-based (KCI), MV Fisher's z.

**Strengths:** Pure Python (no R dependency); well-documented; active development.

Repository: [github.com/py-why/causal-learn](https://github.com/py-why/causal-learn)

#### CausalNex (v0.12.1, McKinsey/QuantumBlack)

**Focus:** NOTEARS implementation, built on PyTorch.

**Features:**
- `from_pandas()`: Learn structure from a pandas DataFrame using NOTEARS.
- Supports ordinal, categorical, and Poisson-distributed data.
- DAGRegressor/DAGClassifier: sklearn-compatible interfaces.
- Scales cubically with number of nodes (vs. exponential for combinatorial methods).

Documentation: [causalnex.readthedocs.io](https://causalnex.readthedocs.io)

#### gCastle (v1.0.4, Huawei Noah's Ark Lab, March 2025)

**Focus:** Collection of 19 causal discovery algorithms, especially gradient-based methods.

**Algorithms:** NOTEARS, GOLEM, DAG-GNN, DAGMA, GraN-DAG, PC, GES, ICA-LiNGAM, DirectLiNGAM, and more.

**Features:** GPU acceleration; data simulation; evaluation metrics (SHD, F1, FDR, TPR); prior knowledge insertion.

Repository: [github.com/huawei-noah/trustworthyAI/tree/master/gcastle](https://github.com/huawei-noah/trustworthyAI/tree/master/gcastle)

### 3.2 JavaScript / TypeScript Libraries

#### @kanaries/causal (v0.1.1, March 2026) -- THE KEY FIND

A TypeScript library implementing causal discovery algorithms with **browser support**.

**Algorithms:** PC, GES, CD-NOD, ExactSearch, GIN, GRaSP, CAM-UV, RCD.

**Architecture:**
- `@causal-js/core`: Graph types, matrix containers.
- `@causal-js/discovery`: Algorithm registry, CI tests, score functions.
- `@causal-js/node`: Node.js adapter.
- `@causal-js/web`: Browser adapter with WebWorker support.

**CI tests:** Fisher's z (for continuous data). Score functions: Gaussian BIC.

**Testing:** 30/30 test cases passing against causal-learn parity.

**License:** Apache 2.0.

Repository: [github.com/Kanaries/causal-js](https://github.com/Kanaries/causal-js)

**This is the most significant finding for nabab.** It provides ready-made PC and GES implementations that run in the browser, validated against the Python causal-learn reference implementation.

#### bayesjs (TypeScript)

**Focus:** Inference only (junction tree, variable elimination, enumeration). No structure learning. Useful as a reference for the inference side but not for learning.

npm: [npmjs.com/package/bayesjs](https://www.npmjs.com/package/bayesjs)

#### jsbayes

**Focus:** Inference via likelihood-weighted sampling. No structure learning. Last meaningful update several years ago.

#### @stdlib/stats-chi2test

Chi-squared independence test for JavaScript. Useful building block if implementing PC from scratch.

npm: `@stdlib/stats-chi2test`

#### Other JS statistical building blocks

- `simple-statistics`: Mean, variance, correlation, quantiles. Useful for data preprocessing and discretization.
- `jstat`: More complete statistical library with distributions, hypothesis tests.
- `ml-matrix`: Matrix operations. Could support NOTEARS-style continuous optimization.

### 3.3 Summary Matrix

| Library | Language | Structure Learning | Parameter Learning | Browser | Active |
|---------|----------|-------------------|-------------------|---------|--------|
| **@kanaries/causal** | **TS** | **PC, GES, GRaSP, +5** | **No** | **Yes** | **Yes (2026)** |
| bayesjs | TS | No | No | Yes | Moderate |
| pgmpy | Python | HC, PC, MMHC, GES, +3 | MLE, Bayes, EM | No | Yes |
| bnlearn | R | 15+ algorithms | MLE, Bayes | No | Yes |
| causal-learn | Python | PC, FCI, GES, LiNGAM, NOTEARS, +10 | No | No | Yes |
| CausalNex | Python | NOTEARS (PyTorch) | MLE | No | Low |
| gCastle | Python | 19 algorithms | No | No | Moderate |

---

## 4. Practical Considerations for a Browser App

### 4.1 Data Requirements

| Variables | Minimum rows | Recommended rows | Notes |
|-----------|-------------|-----------------|-------|
| 5--10 | 100--200 | 500+ | HC with BIC works well |
| 10--20 | 300--500 | 1,000+ | Main target for CSV upload |
| 20--50 | 500--1,000 | 5,000+ | Constraint-based methods may need more |
| 50+ | 2,000+ | 10,000+ | Consider MMHC or NOTEARS |

Rule of thumb: at least 10x the number of free parameters. For a BN with n binary variables and average 2 parents, that is roughly 10 * n * 4 = 40n rows. For n=20, that is 800 rows.

Key finding from the literature: improvements in structure accuracy are **steep up to ~500 samples**, then diminishing returns set in. Below 50 samples, overfitting is severe and results are unreliable.

### 4.2 Computational Cost in the Browser

**Hill climbing with BIC on discrete data, 1000 rows x 20 columns:**

- Each candidate edge operation: compute local BIC score for one variable.
  - Count co-occurrences: O(N) = O(1000). A few microseconds in JS.
  - Compute log-likelihood + penalty: O(1). Negligible.
- Number of candidates per step: O(n^2) = O(400).
- Number of steps: O(n) to O(n^2) = 20--400.
- **Total: ~10k--160k score evaluations, each taking ~10 microseconds = 0.1--1.6 seconds.**

This is absolutely feasible in a browser. Even a 50-variable, 10k-row dataset would finish in seconds.

**PC algorithm:**
- Number of CI tests: O(n^2) for the skeleton phase, each test is O(N * |conditioning set size|).
- For sparse graphs with 20 variables: a few thousand tests. Each chi-squared test on 1000 rows: ~100 microseconds.
- **Total: ~0.1--1 second.**

**NOTEARS (if implemented in TF.js):**
- Matrix exponential computation: O(d^3) per iteration. For d=20: 8000 operations. With 100 iterations: 800k operations.
- With TF.js WASM backend: each matrix multiply ~1 microsecond for 20x20.
- **Total: well under 1 second for 20 variables.**

The `@kanaries/causal` library already handles the browser execution model with WebWorker support, so the UI thread would remain responsive.

### 4.3 Discretization Strategy

For the CSV upload feature, automatic discretization should follow this pipeline:

1. **Parse CSV** and detect column types (string vs numeric vs boolean).
2. **Binary detection:** Columns with exactly 2 unique values -> binary variable.
3. **Categorical detection:** String columns or numeric columns with <= 7 unique values -> categorical.
4. **Continuous handling:** Numeric columns with > 7 unique values -> discretize.
   - Default: **equal-frequency binning** with k=3 (terciles: Low/Medium/High).
   - Let the user adjust k (2--7) and method (equal-width, equal-frequency, k-means).

### 4.4 Missing Data Handling

Options in order of implementation difficulty:

1. **Listwise deletion:** Drop rows with any missing value. Simplest. Biased if data is not missing completely at random (MCAR), but acceptable for MVP.
2. **Available-case analysis:** Use all available data for each score computation. More data-efficient but trickier to implement.
3. **Single imputation:** Fill missing values with mode (categorical) or median (continuous before discretization). Simple but underestimates uncertainty.
4. **EM-based learning:** Full Bayesian parameter learning with missing data. Requires running inference per incomplete row per EM iteration. Expensive but correct. **Nabab already has the inference engine for this.**

**Recommendation:** Start with option 1 (listwise deletion) with a warning to the user showing how many rows were dropped. Add option 3 as a quick enhancement. Reserve option 4 for a later version.

### 4.5 User Guidance vs. Auto-Detection

**Auto-detect by default, let user override.** The UI should:

1. Show detected variable types (binary/categorical/continuous) with the ability to reclassify.
2. Show discretization bins for continuous variables with adjustable thresholds.
3. Allow the user to exclude variables (columns) from the analysis.
4. Optionally let the user specify known edges (whitelist) or forbidden edges (blacklist).
5. Let the user choose the algorithm (default: HC with BIC) and tune parameters (significance level for PC, max parents for HC).

### 4.6 Interactive Refinement

This is where nabab's existing viewer becomes a major advantage:

1. **Learn initial structure** from data.
2. **Display in the interactive D3 graph viewer** (already built).
3. **Let user edit:** Add/remove/reverse edges via drag-and-drop.
4. **Re-score:** After each edit, recompute the BIC score and show the delta. Show whether the edit improved or worsened the score.
5. **Re-learn parameters:** After structural edits, re-estimate CPTs from data using MLE.
6. **Run inference:** The user can set evidence on variables and see updated posteriors, all using the existing inference engine.

---

## 5. A Realistic Feature Spec

### 5.1 User Flow

```
[User drops CSV file]
        |
        v
[Parse CSV, detect types]
        |
        v
[Show variable summary table]
  - Name, detected type, unique values, missing count
  - User can: reclassify type, adjust bins, exclude variables
        |
        v
[User clicks "Learn Structure"]
        |
        v
[Run structure learning]
  - Default: Hill climbing + BIC
  - Show progress (if >2 seconds)
        |
        v
[Display learned BN in interactive viewer]
  - Nodes = variables, edges = dependencies
  - Edge thickness proportional to strength of dependency
  - Node color indicates variable type
        |
        v
[Parameter learning]
  - MLE with Laplace smoothing from data
  - CPTs shown on click/hover
        |
        v
[Interactive phase]
  - Edit structure (add/remove/reverse edges)
  - Set evidence on variables
  - See updated posteriors
  - Export as XMLBIF / BIF
```

### 5.2 Input Format

- **CSV file** with a header row. Delimiter auto-detected (comma, tab, semicolon).
- Maximum recommended size: 50 variables, 50,000 rows (limited by browser memory and computation time).
- Encoding: UTF-8 (with BOM detection).

### 5.3 Auto-Detection Pipeline

For each column:
1. Parse all non-empty values.
2. Classify: boolean > integer-categorical (<=7 unique) > string-categorical (<=20 unique) > continuous numeric > high-cardinality string (warn: probably an ID column, exclude by default).
3. For continuous: apply equal-frequency binning into 3 bins by default.

### 5.4 Structure Learning Configuration

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| Algorithm | Hill Climbing | HC, Tabu, PC, GES | Learning algorithm |
| Scoring | BIC | BIC, BDeu, K2, AIC | Scoring function (score-based only) |
| Max parents | 4 | 1--10 | Maximum parents per node |
| Significance (alpha) | 0.05 | 0.001--0.2 | CI test threshold (constraint-based only) |
| Restarts | 5 | 0--20 | Random restarts (HC/Tabu) |
| Tabu length | auto | 5--50 | Tabu list length |
| Edge whitelist | [] | - | Required edges |
| Edge blacklist | [] | - | Forbidden edges |

### 5.5 Output Formats

- **XMLBIF:** Nabab's native format. Full CPTs, variable definitions, positions.
- **BIF:** Alternative text format supported by many tools.
- **JSON:** Custom format for web API consumption.
- **DOT:** For Graphviz visualization.
- **Interactive viewer:** The existing nabab D3-based viewer with CPT inspection and inference.

### 5.6 Validation and Diagnostics

Show the user:
- **BIC score** of the learned network (and comparison to empty/complete graphs).
- **Number of edges** learned.
- **Structural statistics:** Average parents per node, max parents, longest path.
- **Warnings:** "Column X has >50% missing values", "Column Y has 500+ unique values (probably an ID)", "Only N rows after removing missing data (may be insufficient)".

---

## 6. Implementation Estimate

### 6.1 What Is Feasible in Pure TypeScript in the Browser

| Component | Feasibility | Effort | Notes |
|-----------|-------------|--------|-------|
| CSV parsing | Trivial | 1 day | Use Papa Parse or hand-roll |
| Variable type detection | Straightforward | 1 day | Heuristic classification |
| Equal-frequency discretization | Trivial | 0.5 day | Sort + quantile boundaries |
| Hill climbing + BIC | **Feasible** | 2--3 days | ~200--300 lines of core logic |
| Tabu search | Feasible | +1 day | Extension of HC |
| PC algorithm | Feasible | 2--3 days | CI tests + skeleton + orientation |
| GES | Moderate | 3--5 days | Equivalence class operators are tricky |
| MLE parameter learning | Trivial | 0.5 day | Counting co-occurrences |
| Bayesian parameter learning | Trivial | +0.5 day | Add pseudocounts to MLE |
| XMLBIF export | Straightforward | 1 day | Nabab already has a parser; write the inverse |
| Interactive structure editing | Moderate | 2--3 days | Extend existing D3 viewer |
| Re-scoring after edits | Straightforward | 0.5 day | Recompute local BIC |

**Total for MVP (HC + BIC + MLE + CSV parsing + XMLBIF export):** 5--7 days.

**Total for full feature (HC, Tabu, PC, GES + discretization + interactive editing + export):** 2--4 weeks.

### 6.2 Using @kanaries/causal

If using `@kanaries/causal` (recommended), the effort drops significantly:

| Component | Status | Effort |
|-----------|--------|--------|
| PC algorithm | **Already implemented** | Integration only (1 day) |
| GES algorithm | **Already implemented** | Integration only (1 day) |
| GRaSP algorithm | **Already implemented** | Integration only (0.5 day) |
| CI tests (Fisher's z) | **Already implemented** | 0 |
| Score functions (Gaussian BIC) | **Already implemented** | 0 |
| Graph data structures | **Already implemented** | Adapter to nabab types (1 day) |
| Hill climbing (discrete BIC) | **Not in @kanaries/causal** | Implement from scratch (2 days) |
| Discrete CI tests (chi-squared) | **Not in @kanaries/causal** | Implement (1 day) or use @stdlib |
| Parameter learning (MLE) | Not in any JS library | Implement (0.5 day) |
| CSV parsing + type detection | Not available | Implement (1.5 days) |
| Discretization | Not available | Implement (0.5 day) |
| XMLBIF export | Partial (nabab has parser) | Implement serializer (1 day) |

**Important caveat:** `@kanaries/causal` currently provides **Fisher's z test** (for continuous Gaussian data) and **Gaussian BIC** scoring. For discrete data (the primary use case after discretization), you would still need chi-squared CI tests and discrete BIC scoring. The library provides the algorithmic skeleton (PC, GES search logic) but the statistical primitives may need extending for discrete data.

### 6.3 What Needs a Server / Python Backend

None of the core features strictly require a backend. However, a Python backend would unlock:

| Feature | Why Python | Priority |
|---------|-----------|----------|
| NOTEARS/DAGMA | Matrix exponential, augmented Lagrangian | Low (HC is sufficient for most cases) |
| EM for missing data | Iterative inference (expensive in browser for large datasets) | Medium |
| Large dataset handling | >100k rows, >100 variables | Low (edge case) |
| LiNGAM | Requires ICA, specialized linear algebra | Low |
| Benchmarking against bnlearn | R interop for validation | Development only |

**Recommendation:** Build the MVP as a pure browser feature. Add an optional Python backend later for advanced algorithms (NOTEARS, EM) if user demand materializes.

### 6.4 Dataset Size Limits for In-Browser Learning

| Dimension | Comfortable | Feasible | Pushing it |
|-----------|-------------|----------|-----------|
| Rows | <10,000 | 10k--100k | >100k |
| Variables | <30 | 30--50 | >50 |
| Max parents per node | 3--4 | 5--6 | >6 |
| Unique values per variable | <10 | 10--20 | >20 |

**Memory:** A 10k x 50 dataset with 5 categories per variable: ~2MB raw. Contingency tables for scoring: O(n * k^(max_parents+1)) entries. With n=50, k=5, max_parents=4: 50 * 5^5 = 156,250 entries. At 8 bytes each: ~1.2MB. Comfortably within browser limits.

**Time:** HC with BIC on 50 variables, 10k rows, max 4 parents: ~1--5 seconds on modern hardware.

### 6.5 Existing JS Implementations of Core Algorithms

| Algorithm | JS Implementation | Quality | Notes |
|-----------|------------------|---------|-------|
| PC | @kanaries/causal | Good (validated against causal-learn) | Fisher's z only; needs chi-squared extension for discrete data |
| GES | @kanaries/causal | Good | Gaussian BIC only |
| Hill climbing | **None found** | - | Must implement from scratch (~200 lines) |
| Tabu search | **None found** | - | Extension of HC (~50 additional lines) |
| NOTEARS | **None found** | - | Could port using TF.js (~100 lines of core math) |
| Chi-squared CI test | @stdlib/stats-chi2test | Good | Statistical primitive, not integrated into PC |
| MMHC | **None found** | - | Combine MMPC (from PC) + HC |

### 6.6 Verdict: Weekend Project or Research Project?

**It depends on the scope:**

- **Weekend project (2--3 days):** CSV upload -> hill climbing with BIC -> display learned graph. All discrete variables, no missing data, no interactive editing. Bare-bones but functional. Use `@kanaries/causal` for PC/GES on continuous data, implement HC for discrete data from scratch.

- **Polished feature (2--4 weeks):** Full pipeline with auto-detection, discretization, multiple algorithms (HC + PC + GES), parameter learning, interactive editing, XMLBIF export, diagnostics. A solid feature that integrates with nabab's existing viewer and inference engine.

- **Research project:** Implementing NOTEARS/DAGMA in JS, EM-based parameter learning with missing data, benchmarking against bnlearn/pgmpy on standard datasets, handling mixed continuous-discrete data natively, active learning / intervention suggestions. This is open-ended.

**The practical recommendation:** Start with the polished feature. Hill climbing with BIC is well-understood, well-tested (bnlearn has been doing this for 15+ years), and produces good results for the target dataset sizes. The nabab codebase already has all the pieces for inference, graph representation, and visualization. The gap is "only" the structure learning algorithm itself and the CSV-to-variables pipeline.

---

## References

### Foundational Papers

- Cooper, G.F. & Herskovits, E. (1992). A Bayesian Method for the Induction of Probabilistic Networks from Data. *Machine Learning*, 9, 309-347. [K2 algorithm]
- Spirtes, P. & Glymour, C. (1991). An Algorithm for Fast Recovery of Sparse Causal Graphs. *Social Science Computer Review*, 9(1), 62-72. [PC algorithm]
- Verma, T. & Pearl, J. (1991). Equivalence and Synthesis of Causal Models. *UAI*. [IC/IC* algorithms]
- Heckerman, D., Geiger, D. & Chickering, D. (1995). Learning Bayesian Networks: The Combination of Knowledge and Statistical Data. *Machine Learning*, 20, 197-243. [BDeu score]
- Chickering, D.M. (2002). Optimal Structure Identification with Greedy Search. *JMLR*, 3, 507-554. [GES algorithm]
- Tsamardinos, I., Brown, L.E. & Aliferis, C.F. (2006). The Max-Min Hill-Climbing Bayesian Network Structure Learning Algorithm. *Machine Learning*, 65(1), 31-78. [MMHC]
- Gasse, M. et al. (2014). A Hybrid Algorithm for Bayesian Network Structure Learning with Application to Multi-Label Learning. *Expert Systems with Applications*, 41(15), 6755-6772. [H2PC]

### Modern Methods

- Zheng, X. et al. (2018). DAGs with NO TEARS: Continuous Optimization for Structure Learning. *NeurIPS*. [arxiv:1803.01422](https://arxiv.org/abs/1803.01422)
- Yu, Y. et al. (2019). DAG-GNN: DAG Structure Learning with Graph Neural Networks. *ICML*. [arxiv:1904.10098](https://arxiv.org/abs/1904.10098)
- Ng, I., Ghassami, A. & Zhang, K. (2020). On the Role of Sparsity and DAG Constraints for Learning Linear DAGs. *NeurIPS*. [GOLEM]
- Bello, K., Aragam, B. & Ravikumar, P. (2022). DAGMA: Learning DAGs via M-matrices and a Log-Determinant Acyclicity Characterization. *NeurIPS*. [arxiv:2209.08037](https://arxiv.org/abs/2209.08037)
- Kaiser, M. & Sipos, M. (2022). Unsuitability of NOTEARS for Causal Graph Discovery. [Critical analysis]

### Exact Methods

- Koivisto, M. & Sood, K. (2004). Exact Bayesian Structure Discovery in Bayesian Networks. *JMLR*, 5, 549-573.
- Silander, T. & Myllymaki, P. (2006). A Simple Approach for Finding the Globally Optimal Bayesian Network Structure. *UAI*.
- Yuan, C. & Malone, B. (2013). Learning Optimal Bayesian Networks: A Shortest Path Perspective. *JAIR*, 48, 23-65. [A* search]

### Scoring Functions

- Schwarz, G. (1978). Estimating the Dimension of a Model. *Annals of Statistics*, 6(2), 461-464. [BIC]
- Liu, Z. et al. (2012). Empirical Evaluation of Scoring Functions for Bayesian Network Model Selection. *BMC Bioinformatics*, 13(Suppl 15), S14.

### Surveys

- Scanagatta, M. et al. (2019). A Survey of Bayesian Network Structure Learning. *Artificial Intelligence Review*.
- Kitson, N.K. et al. (2023). A Survey of Bayesian Network Structure Learning. *Artificial Intelligence Review*, 56, 8721-8814.
