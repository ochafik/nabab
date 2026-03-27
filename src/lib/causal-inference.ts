/**
 * Causal inference via graph surgery (Pearl's do-calculus).
 *
 * Interventional queries P(Y | do(X=x)) differ from observational queries
 * P(Y | X=x): an intervention forces X to x by cutting X from its causes,
 * whereas observation updates beliefs about X's causes.
 *
 * The implementation uses the "manipulation theorem" (truncated factorization):
 * 1. Mutilate the network: remove all incoming edges to intervened variables.
 * 2. Replace the CPT of each intervened variable with a degenerate distribution
 *    that assigns probability 1 to the intervened value.
 * 3. Run standard inference on the mutilated network.
 */
import type { Variable, CPT, Evidence, Distribution } from './types.js';
import { BayesianNetwork } from './network.js';

/**
 * A single do() intervention: force `variable` to take `value`.
 */
export interface Intervention {
  variable: string;
  value: string;
}

/**
 * Create a mutilated network (graph surgery).
 *
 * For each intervention do(X=x):
 * - Remove all incoming edges to X (set parents to []).
 * - Replace X's CPT with a degenerate distribution: P(X=x) = 1, P(X≠x) = 0.
 *
 * The returned network is a new BayesianNetwork that can be used for
 * standard inference. Non-intervened variables keep their original CPTs.
 */
export function mutilateNetwork(
  network: BayesianNetwork,
  interventions: Intervention[],
): BayesianNetwork {
  const interventionMap = new Map<string, string>();
  for (const iv of interventions) {
    interventionMap.set(iv.variable, iv.value);
  }

  // Validate all intervention targets exist
  for (const [varName, value] of interventionMap) {
    const v = network.getVariable(varName);
    if (!v) {
      throw new Error(`Unknown intervention variable: ${varName}`);
    }
    if (!v.outcomes.includes(value)) {
      throw new Error(
        `Invalid intervention value "${value}" for variable "${varName}". ` +
        `Valid outcomes: ${v.outcomes.join(', ')}`,
      );
    }
  }

  const newCpts: CPT[] = network.cpts.map(cpt => {
    const interventionValue = interventionMap.get(cpt.variable.name);
    if (interventionValue === undefined) {
      // Non-intervened variable: keep the original CPT intact
      return cpt;
    }

    // Intervened variable: remove parents, create degenerate CPT
    const variable = cpt.variable;
    const table = new Float64Array(variable.outcomes.length);
    const outcomeIdx = variable.outcomes.indexOf(interventionValue);
    table[outcomeIdx] = 1.0;

    return {
      variable,
      parents: [] as Variable[],
      table,
    };
  });

  return new BayesianNetwork({
    name: network.name,
    variables: network.variables,
    cpts: newCpts,
  });
}

/**
 * Compute P(Y | do(X=x)) — the causal effect of intervening on X.
 *
 * Uses graph surgery: removes incoming edges to each intervened variable,
 * sets the intervened variable to the specified value, and runs standard
 * inference on the mutilated graph.
 *
 * @param network       The original Bayesian network.
 * @param query         Name of the variable to query.
 * @param interventions The do() operations to apply.
 * @param observations  Optional additional observational evidence.
 * @returns A probability distribution over the query variable's outcomes.
 */
export function interventionalQuery(
  network: BayesianNetwork,
  query: string,
  interventions: Intervention[],
  observations?: Evidence,
): Distribution {
  const mutilated = mutilateNetwork(network, interventions);

  // Build evidence combining interventions (hard evidence on forced values)
  // with any additional observations.
  const evidence: Evidence = new Map(observations ?? []);
  for (const iv of interventions) {
    evidence.set(iv.variable, iv.value);
  }

  return mutilated.query(query, evidence);
}

/**
 * Compute the Average Causal Effect (ACE) of `cause` on `effect`.
 *
 * ACE = P(effect=y₁ | do(cause=x₁)) - P(effect=y₁ | do(cause=x₀))
 *
 * where x₀ and x₁ are the first two outcomes of the cause variable,
 * and y₁ is the first outcome of the effect variable.
 *
 * For binary variables (e.g., outcomes ["true", "false"]), this gives:
 * ACE = P(effect=true | do(cause=true)) - P(effect=true | do(cause=false))
 *
 * @param network The Bayesian network.
 * @param cause   Name of the cause variable.
 * @param effect  Name of the effect variable.
 * @returns The average causal effect (a number between -1 and 1).
 */
export function averageCausalEffect(
  network: BayesianNetwork,
  cause: string,
  effect: string,
): number {
  const causeVar = network.getVariable(cause);
  if (!causeVar) throw new Error(`Unknown cause variable: ${cause}`);
  if (causeVar.outcomes.length < 2) {
    throw new Error(`Cause variable "${cause}" must have at least 2 outcomes`);
  }

  const effectVar = network.getVariable(effect);
  if (!effectVar) throw new Error(`Unknown effect variable: ${effect}`);

  const x1 = causeVar.outcomes[0]; // "treatment" value
  const x0 = causeVar.outcomes[1]; // "control" value
  const y1 = effectVar.outcomes[0]; // outcome of interest

  const distTreatment = interventionalQuery(
    network,
    effect,
    [{ variable: cause, value: x1 }],
  );
  const distControl = interventionalQuery(
    network,
    effect,
    [{ variable: cause, value: x0 }],
  );

  return (distTreatment.get(y1) ?? 0) - (distControl.get(y1) ?? 0);
}
