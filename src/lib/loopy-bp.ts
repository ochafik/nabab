/**
 * Loopy Belief Propagation (LBP) — approximate inference on factor graphs.
 *
 * Runs sum-product message passing directly on the factor graph without
 * building a junction tree.  On tree-structured networks the result is
 * exact; on loopy graphs it is an approximation that is often very close
 * and much faster than exact methods for high-treewidth networks.
 *
 * Key ideas:
 * - The factor graph has two kinds of nodes: variable nodes and factor nodes.
 * - Messages flow in both directions on every edge (factor <-> variable).
 * - Damping blends the new message with the old one to aid convergence.
 * - Convergence is checked by the max absolute change across all messages.
 */
import type { Variable, CPT, Evidence, LikelihoodEvidence, Distribution } from './types.js';
import {
  type Factor,
  cptToFactor,
  applyEvidence,
  applyLikelihood,
} from './factor.js';

// ─── Public options ──────────────────────────────────────────────────

export interface LBPOptions {
  /** Maximum number of message-passing iterations (default 100). */
  maxIterations?: number;
  /** Convergence threshold on max message change (default 1e-6). */
  tolerance?: number;
  /** Damping factor in [0, 1]: new = (1-damping)*computed + damping*old (default 0.5). */
  damping?: number;
}

export interface LBPResult {
  /** Posterior distributions for each variable. */
  posteriors: Map<Variable, Distribution>;
  /** Whether the algorithm converged before hitting maxIterations. */
  converged: boolean;
  /** Number of iterations actually performed. */
  iterations: number;
}

// ─── Internal helpers ────────────────────────────────────────────────

/**
 * Normalize an array in-place so its entries sum to 1.
 * Returns the sum before normalization.
 */
function normalizeInPlace(arr: Float64Array): number {
  let sum = 0;
  for (let i = 0; i < arr.length; i++) sum += arr[i];
  if (sum > 0 && sum !== 1) {
    const inv = 1 / sum;
    for (let i = 0; i < arr.length; i++) arr[i] *= inv;
  }
  return sum;
}

// ─── Main algorithm ──────────────────────────────────────────────────

/**
 * Run Loopy Belief Propagation on a Bayesian network.
 *
 * @param variables  All variables in the network.
 * @param cpts       Conditional probability tables.
 * @param evidence   Optional hard evidence (variable name -> outcome).
 * @param likelihoodEvidence  Optional soft evidence.
 * @param options    Algorithm tuning knobs.
 */
export function loopyBeliefPropagation(
  variables: readonly Variable[],
  cpts: readonly CPT[],
  evidence?: Evidence,
  likelihoodEvidence?: LikelihoodEvidence,
  options?: LBPOptions,
): LBPResult {
  const maxIterations = options?.maxIterations ?? 100;
  const tolerance = options?.tolerance ?? 1e-6;
  const damping = options?.damping ?? 0.5;

  // ── Step 1: build factors (apply evidence) ─────────────────────────
  //
  // Evidence is applied to the variable's own CPT factor only (not to
  // every factor that mentions the variable).  Hard evidence is
  // idempotent so applying it everywhere would be harmless, but
  // likelihood evidence is multiplicative, so applying it to more than
  // one factor would double-count.

  const factors: Factor[] = [];
  for (const cpt of cpts) {
    let factor = cptToFactor(cpt.variable, cpt.parents, cpt.table);
    const v = cpt.variable;

    // Hard evidence on this variable's own CPT
    if (evidence?.has(v.name)) {
      const outcomeIdx = v.outcomes.indexOf(evidence.get(v.name)!);
      if (outcomeIdx >= 0) {
        factor = applyEvidence(factor, v, outcomeIdx);
      }
    }

    // Hard evidence on parents (zero out inconsistent rows)
    if (evidence) {
      for (const p of cpt.parents) {
        if (evidence.has(p.name)) {
          const outcomeIdx = p.outcomes.indexOf(evidence.get(p.name)!);
          if (outcomeIdx >= 0) {
            factor = applyEvidence(factor, p, outcomeIdx);
          }
        }
      }
    }

    // Soft / likelihood evidence — only on this variable's own CPT
    if (likelihoodEvidence?.has(v.name)) {
      const weights = likelihoodEvidence.get(v.name)!;
      const wa = new Float64Array(v.outcomes.length);
      for (let i = 0; i < v.outcomes.length; i++) {
        wa[i] = weights.get(v.outcomes[i]) ?? 1;
      }
      factor = applyLikelihood(factor, v, wa);
    }

    factors.push(factor);
  }

  // ── Step 2: build adjacency ────────────────────────────────────────
  //
  // For each factor f and each variable v in f's scope we have an edge.
  // We index variables by their position in the `variables` array and
  // factors by their position in `factors`.

  const varIndex = new Map<Variable, number>();
  for (let i = 0; i < variables.length; i++) varIndex.set(variables[i], i);

  const nVars = variables.length;
  const nFactors = factors.length;

  // adjVar[vi] = list of { factorIndex, localPos } adjacent to variable vi
  const adjVar: Array<Array<{ fi: number; localPos: number }>> = Array.from(
    { length: nVars }, () => [],
  );
  // factorVarIndices[fi] = variable indices for each factor in scope order
  const factorVarIndices: number[][] = Array.from({ length: nFactors }, () => []);
  // varToLocalPos[fi] = Map<vi, localPos> for fast lookup
  const varToLocalPos: Map<number, number>[] = Array.from(
    { length: nFactors }, () => new Map(),
  );

  for (let fi = 0; fi < nFactors; fi++) {
    const f = factors[fi];
    for (let pos = 0; pos < f.variables.length; pos++) {
      const vi = varIndex.get(f.variables[pos]);
      if (vi === undefined) continue; // should not happen
      factorVarIndices[fi].push(vi);
      varToLocalPos[fi].set(vi, pos);
      adjVar[vi].push({ fi, localPos: pos });
    }
  }

  // ── Step 3: allocate messages ──────────────────────────────────────
  //
  // msg_f2v[fi][localPos]  = Float64Array of length |var.outcomes|
  //   Message from factor fi to its localPos-th variable.
  // msg_v2f[fi][localPos]  = Float64Array of length |var.outcomes|
  //   Message from variable (factor fi's localPos-th var) to factor fi.

  const msg_f2v: Float64Array[][] = [];
  const msg_v2f: Float64Array[][] = [];

  for (let fi = 0; fi < nFactors; fi++) {
    const f = factors[fi];
    const f2v: Float64Array[] = [];
    const v2f: Float64Array[] = [];
    for (let pos = 0; pos < f.variables.length; pos++) {
      const len = f.variables[pos].outcomes.length;
      // Initialise to uniform
      const uf = new Float64Array(len);
      const uv = new Float64Array(len);
      uf.fill(1 / len);
      uv.fill(1 / len);
      f2v.push(uf);
      v2f.push(uv);
    }
    msg_f2v.push(f2v);
    msg_v2f.push(v2f);
  }

  // ── Step 4: iterative message passing ──────────────────────────────

  let converged = false;
  let iter = 0;

  for (iter = 0; iter < maxIterations; iter++) {
    let maxDelta = 0;

    // ─ 4a: Update variable-to-factor messages ────────────────────────
    //
    // For variable v sending to factor f:
    //   msg_v2f(v -> f) = product of all msg_f2v(g -> v) for g != f
    // then normalise.

    for (let vi = 0; vi < nVars; vi++) {
      const adj = adjVar[vi]; // { fi, localPos } entries adjacent to variable
      if (adj.length === 0) continue;

      const len = variables[vi].outcomes.length;

      // Compute the product of ALL incoming factor-to-variable messages
      // for this variable. Then for each adjacent factor, divide out
      // that factor's message to get the message to that factor.
      // This is the "product / message" trick (O(degree) instead of
      // O(degree^2)).

      const allProduct = new Float64Array(len);
      allProduct.fill(1);
      for (const { fi, localPos } of adj) {
        const incoming = msg_f2v[fi][localPos];
        for (let k = 0; k < len; k++) allProduct[k] *= incoming[k];
      }

      for (const { fi, localPos } of adj) {
        const incoming = msg_f2v[fi][localPos];
        const dest = msg_v2f[fi][localPos];

        for (let k = 0; k < len; k++) {
          // Divide out this factor's incoming message.
          // Guard against zero (use 0 if the product is 0).
          if (incoming[k] !== 0) {
            dest[k] = allProduct[k] / incoming[k];
          } else {
            // Recompute without this factor (rare path)
            let prod = 1;
            for (const edge2 of adj) {
              if (edge2.fi === fi) continue;
              prod *= msg_f2v[edge2.fi][edge2.localPos][k];
            }
            dest[k] = prod;
          }
        }

        normalizeInPlace(dest);
      }
    }

    // ─ 4b: Update factor-to-variable messages ────────────────────────
    //
    // For factor f sending to variable v (at local position p):
    //   msg_f2v(f -> v)[xv] = sum over all other vars in f of
    //       f(x) * product_{u in scope(f), u != v} msg_v2f(u -> f)[xu]
    // then normalise + damp.

    for (let fi = 0; fi < nFactors; fi++) {
      const f = factors[fi];
      const nScope = f.variables.length;
      const fVals = f.values;
      const fSize = fVals.length;

      // For each target variable in this factor's scope
      for (let targetPos = 0; targetPos < nScope; targetPos++) {
        const targetVar = f.variables[targetPos];
        const targetLen = targetVar.outcomes.length;
        const newMsg = new Float64Array(targetLen);

        // Enumerate all assignments to the factor's variables.
        // We use a simple odometer over the scope dimensions.
        const indices = new Int32Array(nScope);
        const strides = f.strides;

        for (let flatIdx = 0; flatIdx < fSize; flatIdx++) {
          // value of factor at this assignment
          let val = fVals[flatIdx];

          // multiply by all incoming variable-to-factor messages EXCEPT from target
          for (let pos = 0; pos < nScope; pos++) {
            if (pos === targetPos) continue;
            val *= msg_v2f[fi][pos][indices[pos]];
          }

          // accumulate into the target variable's outcome slot
          newMsg[indices[targetPos]] += val;

          // increment odometer (last variable fastest, matching row-major layout)
          for (let j = nScope - 1; j >= 0; j--) {
            indices[j]++;
            if (indices[j] < f.variables[j].outcomes.length) break;
            indices[j] = 0;
          }
        }

        // Normalise
        normalizeInPlace(newMsg);

        // Damp and compute delta
        const oldMsg = msg_f2v[fi][targetPos];
        for (let k = 0; k < targetLen; k++) {
          const blended = (1 - damping) * newMsg[k] + damping * oldMsg[k];
          const d = Math.abs(blended - oldMsg[k]);
          if (d > maxDelta) maxDelta = d;
          oldMsg[k] = blended;
        }
      }
    }

    // ─ 4c: Check convergence ─────────────────────────────────────────
    if (maxDelta < tolerance) {
      converged = true;
      iter++; // count this completed iteration
      break;
    }
  }

  // ── Step 5: compute beliefs ────────────────────────────────────────
  //
  // belief(v) = product of all incoming factor-to-variable messages.

  const posteriors = new Map<Variable, Distribution>();

  for (let vi = 0; vi < nVars; vi++) {
    const v = variables[vi];
    const len = v.outcomes.length;
    const belief = new Float64Array(len);
    belief.fill(1);

    for (const { fi, localPos } of adjVar[vi]) {
      const incoming = msg_f2v[fi][localPos];
      for (let k = 0; k < len; k++) belief[k] *= incoming[k];
    }

    normalizeInPlace(belief);

    const dist: Distribution = new Map();
    for (let k = 0; k < len; k++) {
      dist.set(v.outcomes[k], belief[k]);
    }
    posteriors.set(v, dist);
  }

  return { posteriors, converged, iterations: iter };
}
