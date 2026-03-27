/**
 * Variable Elimination (VE) inference algorithm.
 *
 * An alternative to the junction tree algorithm that is often faster
 * when querying a single variable's posterior, because it only computes
 * the marginal for the query variable rather than all variables.
 *
 * Algorithm:
 * 1. Convert CPTs to factors, apply evidence
 * 2. Determine elimination order (all variables except query and evidence)
 * 3. For each variable in the elimination order:
 *    a. Collect all factors mentioning that variable
 *    b. Multiply them together
 *    c. Marginalize out the variable
 *    d. Add the resulting factor back to the pool
 * 4. Multiply all remaining factors and normalize
 */
import type { Variable, CPT, Evidence, LikelihoodEvidence, Distribution } from './types.js';
import {
  type Factor,
  cptToFactor,
  multiplyFactors,
  marginalize,
  normalizeFactor,
  applyEvidence,
  applyLikelihood,
  extractDistribution,
} from './factor.js';

/**
 * Compute a min-fill elimination ordering for the given variables and CPTs.
 *
 * The min-fill heuristic picks the variable whose elimination adds the
 * fewest "fill" edges (connections between its neighbors that don't
 * already exist). This tends to keep intermediate factors small,
 * reducing computation.
 *
 * @param variables Variables to order (all will appear in the result)
 * @param cpts The CPTs defining the network structure
 * @returns An elimination ordering (array of variables)
 */
export function minFillOrder(variables: readonly Variable[], cpts: readonly CPT[]): Variable[] {
  // Build an interaction graph: two variables are neighbors if they
  // appear together in at least one factor (CPT).
  const neighbors = new Map<Variable, Set<Variable>>();
  for (const v of variables) {
    neighbors.set(v, new Set());
  }

  for (const cpt of cpts) {
    // Each CPT defines a factor over [parents..., variable]
    const scope = [...cpt.parents, cpt.variable];
    for (let i = 0; i < scope.length; i++) {
      for (let j = i + 1; j < scope.length; j++) {
        if (neighbors.has(scope[i]) && neighbors.has(scope[j])) {
          neighbors.get(scope[i])!.add(scope[j]);
          neighbors.get(scope[j])!.add(scope[i]);
        }
      }
    }
  }

  const remaining = new Set(variables);
  const order: Variable[] = [];

  while (remaining.size > 0) {
    let bestFill = Infinity;
    let bestDeg = Infinity;
    let bestV: Variable | null = null;

    for (const v of remaining) {
      // Collect remaining neighbors
      const ns: Variable[] = [];
      for (const n of neighbors.get(v)!) {
        if (remaining.has(n)) ns.push(n);
      }

      // Count fill edges that would be added
      let fill = 0;
      for (let i = 0; i < ns.length; i++) {
        const niAdj = neighbors.get(ns[i])!;
        for (let j = i + 1; j < ns.length; j++) {
          if (!niAdj.has(ns[j])) fill++;
        }
      }

      const deg = ns.length;
      if (fill < bestFill || (fill === bestFill && deg < bestDeg)) {
        bestFill = fill;
        bestDeg = deg;
        bestV = v;
      }
    }

    if (!bestV) break;

    // Add fill edges: connect all remaining neighbors of bestV
    const ns = [...neighbors.get(bestV)!].filter(n => remaining.has(n));
    for (let i = 0; i < ns.length; i++) {
      for (let j = i + 1; j < ns.length; j++) {
        if (!neighbors.get(ns[i])!.has(ns[j])) {
          neighbors.get(ns[i])!.add(ns[j]);
          neighbors.get(ns[j])!.add(ns[i]);
        }
      }
    }

    remaining.delete(bestV);
    order.push(bestV);
  }

  return order;
}

/**
 * Query a single variable's posterior using Variable Elimination.
 * Faster than junction tree when you only need one variable's marginal.
 *
 * @param variables All variables in the network
 * @param cpts Conditional probability tables
 * @param queryVariable The variable whose posterior distribution is desired
 * @param evidence Optional hard evidence (variable name -> outcome string)
 * @param likelihoodEvidence Optional soft evidence (variable name -> outcome -> weight)
 * @param eliminationOrder Optional custom elimination order; if not provided,
 *        min-fill heuristic is used (excluding query and evidence variables)
 * @returns The posterior distribution of the query variable
 */
export function variableElimination(
  variables: readonly Variable[],
  cpts: readonly CPT[],
  queryVariable: Variable,
  evidence?: Evidence,
  likelihoodEvidence?: LikelihoodEvidence,
  eliminationOrder?: Variable[],
): Distribution {
  // Step 1: Convert CPTs to factors, applying evidence
  const factors: Factor[] = [];

  for (const cpt of cpts) {
    let factor = cptToFactor(cpt.variable, cpt.parents, cpt.table);

    // Apply hard evidence
    if (evidence) {
      for (const v of factor.variables) {
        if (evidence.has(v.name)) {
          const observedOutcome = evidence.get(v.name)!;
          const outcomeIdx = v.outcomes.indexOf(observedOutcome);
          if (outcomeIdx >= 0) {
            factor = applyEvidence(factor, v, outcomeIdx);
          }
        }
      }
    }

    // Apply soft/likelihood evidence
    if (likelihoodEvidence) {
      for (const v of factor.variables) {
        if (likelihoodEvidence.has(v.name)) {
          const weights = likelihoodEvidence.get(v.name)!;
          const weightArray = new Float64Array(v.outcomes.length);
          for (let i = 0; i < v.outcomes.length; i++) {
            weightArray[i] = weights.get(v.outcomes[i]) ?? 1;
          }
          factor = applyLikelihood(factor, v, weightArray);
        }
      }
    }

    factors.push(factor);
  }

  // Step 2: Determine variables to eliminate
  const evidenceVarNames = new Set<string>();
  if (evidence) {
    for (const name of evidence.keys()) {
      evidenceVarNames.add(name);
    }
  }

  let order: Variable[];
  if (eliminationOrder) {
    // Filter out the query variable and evidence variables from the provided order
    order = eliminationOrder.filter(
      v => v !== queryVariable && !evidenceVarNames.has(v.name),
    );
  } else {
    // Compute min-fill order for variables to eliminate
    const varsToEliminate = variables.filter(
      v => v !== queryVariable && !evidenceVarNames.has(v.name),
    );
    order = minFillOrder(varsToEliminate, cpts);
  }

  // Step 3: Eliminate variables one by one
  const factorPool = [...factors];

  for (const elimVar of order) {
    // Collect all factors that mention this variable
    const relevant: Factor[] = [];
    const remaining: Factor[] = [];

    for (const f of factorPool) {
      if (f.variables.includes(elimVar)) {
        relevant.push(f);
      } else {
        remaining.push(f);
      }
    }

    if (relevant.length === 0) continue;

    // Multiply all relevant factors together
    let product = relevant[0];
    for (let i = 1; i < relevant.length; i++) {
      product = multiplyFactors(product, relevant[i]);
    }

    // Marginalize out the eliminated variable
    const marginalized = marginalize(product, [elimVar]);

    // Replace the factor pool
    factorPool.length = 0;
    factorPool.push(...remaining);
    factorPool.push(marginalized);
  }

  // Step 4: Multiply all remaining factors and normalize
  if (factorPool.length === 0) {
    // Degenerate case: return uniform distribution
    const dist = new Map<string, number>();
    const p = 1 / queryVariable.outcomes.length;
    for (const outcome of queryVariable.outcomes) {
      dist.set(outcome, p);
    }
    return dist;
  }

  let result = factorPool[0];
  for (let i = 1; i < factorPool.length; i++) {
    result = multiplyFactors(result, factorPool[i]);
  }

  // Extract the distribution for the query variable
  return extractDistribution(result, queryVariable);
}
