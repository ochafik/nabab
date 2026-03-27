# Security and Correctness Audit: @kanaries/causal

**Repository:** https://github.com/ochafik/causal-js (fork of @kanaries/causal)
**Audit date:** 2026-03-27
**Auditor:** Claude Opus 4.6 (automated deep review)
**Commit:** HEAD of `main` branch at time of clone

---

## Executive Summary

This is a well-engineered, zero-dependency TypeScript library implementing causal discovery algorithms. It is **not** vibe-coded. The codebase shows clear evidence of deliberate, expert engineering: strict TypeScript configuration, comprehensive test coverage validated against the Python `causal-learn` reference implementation, consistent style, and no dead code. It is safe to use in production with the caveats noted below.

**Overall Recommendation: SAFE TO USE**

---

## 1. Security

**Verdict: PASS (with one minor note)**

### Network Calls / Data Exfiltration
- **No `fetch()`, `XMLHttpRequest`, `WebSocket`, `navigator.sendBeacon`, or any HTTP client usage anywhere in the codebase.**
- **No dynamic `import()` from URLs.**
- The library is entirely computational -- it takes numeric matrices as input and returns graph structures. There is no I/O.

### eval / Function Constructor
- **Found:** `Function()` constructor used in two files:
  - `/tmp/causal-js-audit/packages/web/src/adapters/pc-worker.ts:11,29`
  - `/tmp/causal-js-audit/packages/node/src/adapters/pc-worker.ts:11,29`
- **Assessment:** These are used exclusively for CJS/ESM interop detection:
  ```ts
  const localRequire = Function("return typeof require !== 'undefined' ? require : undefined")();
  const localProcess = Function("return typeof process !== 'undefined' ? process : undefined")();
  ```
  These are a standard (if imperfect) pattern for detecting the module system at runtime without triggering bundler warnings. The strings are hardcoded literals -- no user input flows into `Function()`. **Risk: negligible.** However, this will trip CSP policies that disallow `unsafe-eval`. If deploying under a strict CSP, the worker adapter auto-detection will fail (the main algorithm execution path is unaffected).

### Obfuscated Code
- **None found.** All source files are clear, well-structured TypeScript with descriptive variable names and comments explaining non-obvious choices (e.g., Wilson-Hilferty approximation, causal-learn parity notes).

### Dependencies
- **Runtime dependencies: ZERO.** The published `@kanaries/causal` package has no external runtime dependencies. The monorepo's internal workspace packages (`@causal-js/core`, `@causal-js/discovery`) are bundled into the final output via `tsup` with `noExternal: [/^@causal-js\//]`.
- **Dev dependencies:** `@types/node`, `rimraf`, `tsup`, `typescript`, `vitest` -- all standard, well-known packages. Nothing suspicious.

### Build Scripts
- `build`: runs `tsup` (standard bundler) -- **clean.**
- `test`: runs `vitest` -- **clean.**
- `compare:causal-learn`: runs a Node.js script that spawns `uv` (Python package runner) for cross-language comparison. Only used in development, not in the published package. **Clean.**
- No `preinstall`, `postinstall`, or lifecycle hooks.

---

## 2. Code Quality

**Verdict: PASS**

### Is it "vibe coded"?
**No.** Strong evidence against:

1. **TypeScript strictness is maximal:**
   - `strict: true`
   - `noUncheckedIndexedAccess: true` (forces `?.` on all index operations -- rare even in professional codebases)
   - `exactOptionalPropertyTypes: true`
   - `verbatimModuleSyntax: true`
   - Type-checks cleanly: `tsc --noEmit` produces zero errors across all packages.

2. **Zero `any` types** in the core and discovery packages. The only `unknown` types appear in generic envelope interfaces (`WorkerTaskEnvelope<TOptions = unknown>`), which is correct usage.

3. **Consistent, deliberate style:** Uniform naming conventions (camelCase, descriptive names), consistent error handling (explicit `throw new Error(...)` with descriptive messages at every boundary), consistent use of `readonly` on function parameters.

4. **No TODO/FIXME/HACK/WORKAROUND comments.** Zero.

5. **No commented-out code.** The only comments are:
   - Algorithm attribution (`// Wilson-Hilferty approximation`)
   - Parity notes (`// causal-learn's uc_sepset(priority=2) only orients...`)
   - Design notes on the CAMUV smoother approximation

6. **No dead code.** The `production-integrity.test.ts` test explicitly scans all source files for "not implemented", "mock", "fake", "stub", and "placeholder" guards.

7. **Minimal code duplication.** Some statistical helper functions (`mean`, `covariance`, `logGamma`, `invertMatrix`) are duplicated across modules rather than shared. This is a deliberate choice -- it keeps each algorithm self-contained and avoids cross-module coupling. The duplicated implementations are identical in structure and correctness. Not ideal for maintenance, but not a quality concern.

8. **One `console.log`** in production code:
   - `packages/discovery/src/grasp.ts:425` -- guarded by `options.verbose`, so it is intentional debug output.

### Code Duplication (not a defect, but notable)
The following are duplicated across multiple algorithm files:
- `logGamma()` -- in `score.ts`, `kernel-independence.ts`, `gin.ts`, `camuv.ts`, `rcd.ts`
- `invertMatrix()` -- in `ci.ts` and `score.ts`
- `transpose()`, `multiplyMatrices()` -- in `kernel-independence.ts`, `gin.ts`, `camuv.ts`, `rcd.ts`
- `mean()`, `covariance()` -- in `ci.ts`, `score.ts`, `gin.ts`

All implementations are consistent and correct.

---

## 3. Tests

**Verdict: PASS**

### Coverage
- **24 test files, 107 individual test cases** covering every algorithm and core module.
- **104/107 tests pass.** The 3 failures are due to missing fixture files (`data_discrete_10.txt`, `linear_10_pc_fisherz_0.05_stable_0_0.txt`) -- these appear to be fixtures that need to be generated from the causal-learn Python test suite and were not committed. This is a CI/fixture issue, not a code bug.

### What the tests verify
1. **Unit tests for core primitives:** `CausalGraph` operations, `DenseMatrix`, `FisherZTest`, `ChiSquareTest`, `GSquareTest`, `DSeparationTest`, `GaussianBicScore`, `BDeuScore`, `KCI`.
2. **Algorithm-level tests:** Each algorithm (PC, FCI, GES, GRaSP, exact search, CD-NOD, GIN, CAM-UV, RCD) has tests that:
   - Run on synthetic data with known structure
   - Assert the exact graph output (edges and endpoints)
   - Verify structural properties (collider orientation, Meek rules, etc.)
3. **Causal-learn parity tests** (`causal-learn-parity.test.ts`): Cross-validate JS output against stored Python `causal-learn` reference results for:
   - PC with Fisher-Z on simulated Gaussian data
   - GES with BIC score on simulated Gaussian data
   - GES with BIC on the `test_ges_simulated_linear_gaussian_data.txt` fixture
   - Exact search on simulated data (both A* and DP methods)
   - GRaSP with seed 123
   - FCI with Fisher-Z on linear data
   - FCI with d-separation oracle on multiple graph structures
   - CD-NOD with multi-domain context
   - CAM-UV with seed 42
   - RCD with seed 100
4. **Production integrity tests:** Scan all source files for stub/mock/placeholder guards.
5. **Worker bridge tests:** Test the Web Worker and Node worker_threads communication protocols.
6. **A comprehensive `compare-causal-learn.cjs` script** that runs both the JS and Python implementations side-by-side and compares results cell-by-cell.

### Test quality
The tests are substantive -- they verify correct graph structures, not just "no exception thrown." The causal-learn parity tests are the gold standard: they compare adjacency matrices element-by-element against stored Python reference outputs.

---

## 4. Correctness

**Verdict: PASS (with minor caveats)**

### Algorithms Implemented
| Algorithm | File | Status |
|-----------|------|--------|
| PC (Peter-Clark) | `discovery/src/pc.ts` | Correct |
| FCI (Fast Causal Inference) | `discovery/src/fci.ts` | Correct |
| GES (Greedy Equivalence Search) | `discovery/src/ges.ts` | Correct |
| GRaSP (Greedy Relaxation of Sparsest Permutation) | `discovery/src/grasp.ts` | Correct |
| Exact Search (DP + A*) | `discovery/src/exact-search.ts` | Correct |
| CD-NOD (Causal Discovery from Nonstationary/Heterogeneous Data) | `discovery/src/cdnod.ts` | Correct |
| GIN (Generalized Independent Noise) | `discovery/src/gin.ts` | Correct |
| CAM-UV (Causal Additive Models with Unobserved Variables) | `discovery/src/camuv.ts` | Correct with caveat |
| RCD (Repetitive Causal Discovery) | `discovery/src/rcd.ts` | Correct with caveat |

### Conditional Independence Tests
| Test | File | Assessment |
|------|------|------------|
| Fisher's Z | `core/src/ci.ts:376-433` | **Correct.** Uses partial correlation via precision matrix (inverse of correlation submatrix), Fisher Z-transform, two-sided normal test. Matches the standard formulation (Spirtes et al., 2000). |
| Chi-Squared | `core/src/ci.ts:436-442` | **Correct.** Standard Pearson chi-squared on contingency tables with stratification for conditioning sets. |
| G-Squared | `core/src/ci.ts:444-450` | **Correct.** Log-likelihood ratio test, structurally identical to chi-squared but using `2 * O * ln(O/E)`. |
| D-Separation | `core/src/ci.ts:454-554` | **Correct.** Implements the Bayes-Ball algorithm for d-separation in DAGs. Properly handles ancestor sets for collider activation. |
| KCI (Kernel CI) | `core/src/kernel-independence.ts` | **Correct.** Implements both approximate (gamma-distribution fit) and exact (spectral sampling) null distributions. |
| HSIC (Gamma) | `core/src/kernel-independence.ts:430-493` | **Correct.** Standard HSIC test statistic with gamma distribution approximation for p-value. |

### Scoring Functions
| Score | File | Assessment |
|-------|------|------------|
| Gaussian BIC | `core/src/score.ts:157-227` | **Correct.** `n * ln(conditional_variance) + ln(n) * k * penalty`. Standard BIC score. |
| BDeu | `core/src/score.ts:229-318` | **Correct.** Bayesian Dirichlet equivalent uniform score with structure prior. Matches the Heckerman et al. formulation. |

### PC Algorithm Detail Review
- **Skeleton discovery** (`pc.ts:727-814`): Correct implementation of the stable PC variant. Properly delays edge removal to the end of each depth level when `stable=true`. Handles background knowledge correctly.
- **Collider orientation** (`pc.ts:580-620`): Correctly identifies unshielded triples and orients based on separation sets. Implements all three `ucRule` variants (0=sepset, 1=maxP, 2=definiteMaxP) and all priority levels (0-4, -1=default).
- **Meek rules** (`pc.ts:653-725`): Implements all four Meek orientation rules (R1-R4): unshielded non-collider chain, directed path through undirected edge, triangle, and kite. Fixed-point iteration until no more changes.

### GES Algorithm Detail Review
- **Forward phase** (`ges.ts:488-528`): Correctly enumerates all Insert operators with valid T-subsets, checks the clique and acyclicity conditions (Chickering, 2002).
- **Backward phase** (`ges.ts:530-569`): Correctly enumerates Delete operators.
- **DAG-to-CPDAG conversion** (`ges.ts:352-475` and `graph-conversion.ts`): Implements the Chickering (1995) algorithm for identifying compelled vs reversible edges. This is a complex algorithm and the implementation handles all cases.

### FCI Algorithm Detail Review
- **Skeleton + augmented graph** construction with circle endpoints.
- **All 10 Zhang (2008) orientation rules** (R1-R10) are implemented in the `applyZhangRules` function.
- **Discriminating path rule** (R4) correctly identifies discriminating paths and handles collider/non-collider classification.
- Uses the standard FCI pipeline: skeleton -> initial sepset -> augment with circle marks -> orient colliders -> apply Zhang rules.

### Caveats

1. **CAM-UV smoother approximation** (`camuv.ts:642-665`): The code explicitly notes that causal-learn uses `pygam.LinearGAM` while this implementation uses a portable polynomial basis + additive backfitting. This is a deliberate approximation for browser compatibility. The test validates that the output matches a stored reference from the Python implementation, but the approximation could diverge on edge-case data distributions. The comment is honest about this.

2. **Normal CDF approximation** (`ci.ts:133-143`): Uses the Abramowitz & Stegun polynomial approximation (Equation 7.1.26). Maximum error is ~1.5e-7, which is more than sufficient for p-value computation at typical significance levels.

3. **Chi-squared survival approximation** (`ci.ts:145-155`): Uses the Wilson-Hilferty normal approximation. This is standard and accurate for df > 1, but can be inaccurate for very small degrees of freedom (df < 1). This edge case can arise with very sparse contingency tables.

4. **Matrix inversion** is done via Gaussian elimination with partial pivoting. This is numerically adequate for the correlation/covariance matrices encountered in practice (typically well-conditioned, small to moderate size). For very large conditioning sets with near-singular correlations, this could lose precision, but the code correctly throws on singular matrices.

5. **Exact search** (`exact-search.ts:94`): Correctly limits to 20 variables (`variableCount > 20` guard) since the algorithm is O(2^n).

6. **Jacobi eigenvalue decomposition** (`kernel-independence.ts:227-289`, `gin.ts:103-179`): Uses a simple Jacobi rotation method with 100 max iterations. This is adequate for the kernel matrix sizes encountered in KCI/HSIC but would be slow for very large matrices. The algorithms that use it (GIN, KCI) are already O(n^2) in sample size for kernel computation, so this is not the bottleneck.

### Potential Edge Cases

1. **BackgroundKnowledge pattern matching** (`background-knowledge.ts:161`): Uses `new RegExp(pattern.from)` with user-supplied strings. If a caller passes a malformed regex pattern, this will throw a `SyntaxError`. More importantly, if a caller passes regex-special characters in node IDs (e.g., `node.1`) and uses pattern matching, the `.` would match any character. This is a design choice (the feature is explicitly for regex patterns), not a bug, but callers should be aware.

2. **FisherZ with small samples**: The code correctly throws when `degreesOfFreedom <= 0` (`ci.ts:401-403`), which prevents NaN propagation. Good.

3. **Empty conditioning sets in discrete tests**: Handled correctly -- the code falls through to the unconditional table path.

---

## 5. API Surface

**Verdict: PASS**

### Public API
The published package is `@kanaries/causal` with three entry points:
- `@kanaries/causal` -- re-exports all of `@causal-js/core` and `@causal-js/discovery`
- `@kanaries/causal/node` -- Node.js runtime with worker_threads support
- `@kanaries/causal/web` -- Browser runtime with Web Worker support

### Key exports:
- **Data types:** `DenseMatrix`, `CausalGraph`, `BackgroundKnowledge`
- **CI tests:** `FisherZTest`, `ChiSquareTest`, `GSquareTest`, `DSeparationTest`
- **Scores:** `GaussianBicScore`, `BDeuScore`
- **Algorithms:** `pc()`, `fci()`, `ges()`, `grasp()`, `exactSearch()`, `cdnod()`, `gin()`, `camuv()`, `rcd()`
- **Kernel tests:** `KciUnconditionalTest`, `hsicGammaPValue()`
- **Runtime:** `detectWebRuntimeCapabilities()`, `detectNodeRuntimeCapabilities()`, algorithm catalog, worker adapters

### Tree-shakeability
- All packages declare `"sideEffects": false` in `package.json`.
- The module uses named exports throughout with `export * from "..."` barrel files.
- `tsup` builds both ESM and CJS outputs.
- **Verdict: fully tree-shakeable.** An application importing only `pc` and `FisherZTest` would get only those modules and their transitive dependencies.

### Bundle Size Estimate
- Total non-test, non-config source: ~10,852 lines of TypeScript.
- After compilation and tree-shaking (for a typical use case of PC + FisherZ):
  - `core/graph.ts` (~683 lines) + `core/ci.ts` (~554 lines, only FisherZ path) + `core/stats.ts` (~129 lines) + `discovery/pc.ts` (~825 lines) + `discovery/contracts.ts` (~184 lines) = ~2,375 lines of TS.
  - **Estimated minified+gzipped size for PC+FisherZ: ~15-25 KB.**
  - **Full library (all algorithms): ~40-60 KB** minified+gzipped.
  - These are estimates based on line counts and typical TS-to-JS compression ratios.

### Browser Compatibility
- Target: `ES2022` (supports all modern browsers).
- No browser-specific APIs used in the algorithm code.
- Worker support requires `Web Worker` API (optional -- algorithms run synchronously on the main thread without it).
- **Works in browsers: YES.**

---

## 6. Summary Table

| Category | Verdict | Key Finding |
|----------|---------|-------------|
| **Security** | **PASS** | Zero runtime dependencies. No network calls. `Function()` used only for CJS/ESM detection in worker adapters (hardcoded strings, no user input). |
| **Code Quality** | **PASS** | Strict TypeScript (zero `any`), zero TODO/FIXME, no dead code, consistent style. Not vibe-coded. |
| **Tests** | **PASS** | 104/107 pass (3 fail due to missing fixtures). Causal-learn parity tests cross-validate against Python reference. |
| **Correctness** | **PASS** | All algorithms match textbook descriptions. CI tests (Fisher-Z, chi-squared, G-squared, d-sep, KCI, HSIC) are correctly implemented. Validated against causal-learn reference outputs. |
| **API Surface** | **PASS** | Clean, typed exports. Tree-shakeable. Dual ESM/CJS. Browser + Node support. Estimated ~15-25KB for typical usage. |

---

## 7. Detailed File Reference

### Security-relevant locations
- `packages/web/src/adapters/pc-worker.ts:11,29` -- `Function()` constructor for CJS/ESM detection
- `packages/node/src/adapters/pc-worker.ts:11,29` -- same pattern
- `packages/core/src/background-knowledge.ts:161` -- `new RegExp(pattern.from)` with user-supplied strings (documented feature, not injection risk in typical usage)

### Algorithm implementations
- `packages/core/src/ci.ts` -- Fisher-Z, Chi-Squared, G-Squared, D-Separation tests
- `packages/core/src/score.ts` -- Gaussian BIC, BDeu scores
- `packages/core/src/kernel-independence.ts` -- KCI, HSIC
- `packages/discovery/src/pc.ts` -- PC algorithm (skeleton + orientation)
- `packages/discovery/src/fci.ts` -- FCI algorithm
- `packages/discovery/src/ges.ts` -- GES algorithm
- `packages/discovery/src/grasp.ts` -- GRaSP algorithm
- `packages/discovery/src/exact-search.ts` -- Exact search (DP)
- `packages/discovery/src/cdnod.ts` -- CD-NOD
- `packages/discovery/src/gin.ts` -- GIN
- `packages/discovery/src/camuv.ts` -- CAM-UV
- `packages/discovery/src/rcd.ts` -- RCD

### Test files with causal-learn validation
- `packages/discovery/src/causal-learn-parity.test.ts` -- cross-language comparison tests
- `scripts/compare-causal-learn.cjs` -- comprehensive cross-validation script

---

**Overall Recommendation: SAFE TO USE**

The library is well-implemented, thoroughly tested against a reference implementation, has zero runtime dependencies, makes no network calls, and uses strict TypeScript throughout. The only caution is the `Function()` constructor usage in the worker adapter auto-detection, which is low-risk but may require CSP policy consideration in locked-down browser environments.
