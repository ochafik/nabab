/**
 * Query-relevant pruning.
 *
 * To answer P(Q | e) only the "requisite" part of the network is needed:
 * unobserved descendants-only nodes (barren nodes) and everything that is
 * d-separated from Q by the evidence contribute a factor that cancels out.
 * Dropping them before building the junction tree can shrink the cliques a lot.
 *
 * The requisite set is found with the Bayes-ball algorithm (Shachter, 1998),
 * which visits nodes by passing a "ball" along active trails. A node's CPT is
 * needed exactly when the ball reaches it from a child, or when it is observed
 * and the ball reaches it from a parent.
 */
import type { Variable, CPT } from './types.js';

export interface RelevantNetwork {
  /** CPTs of the requisite nodes. */
  readonly cpts: CPT[];
  /** Variables of the pruned network (CPT owners, their parents, and the query variables), in the original order. */
  readonly variables: Variable[];
}

/**
 * Select the part of a network needed to compute the posteriors of `query`
 * given evidence.
 *
 * `observed` holds the variables with hard evidence, which block trails.
 * `soft` holds variables that only carry likelihood evidence. Those are
 * unobserved, but behave as if they had an observed child, so a ball reaching
 * them from either side continues to their parents and children.
 *
 * Query variables are treated as unobserved by the ball even if they carry
 * evidence: their posterior is P(q | other evidence) times their own
 * likelihood, and the likelihood is applied by the caller.
 */
export function relevantNetwork(
  variables: readonly Variable[],
  cpts: readonly CPT[],
  query: ReadonlySet<Variable>,
  observed: ReadonlySet<Variable>,
  soft: ReadonlySet<Variable> = new Set(),
): RelevantNetwork {
  const cptByVar = new Map<Variable, CPT>();
  const children = new Map<Variable, Variable[]>();
  for (const cpt of cpts) {
    cptByVar.set(cpt.variable, cpt);
    for (const p of cpt.parents) {
      let list = children.get(p);
      if (!list) children.set(p, (list = []));
      list.push(cpt.variable);
    }
  }

  const markedTop = new Set<Variable>(); // CPT needed; ball sent on to parents
  const markedBottom = new Set<Variable>(); // ball sent on to children
  const isObserved = (v: Variable) => observed.has(v) && !query.has(v);

  // Iterative to survive deep networks. Each entry is a node reached from a
  // child (fromChild) or from a parent.
  const stack: Array<[Variable, boolean]> = [];
  for (const q of query) stack.push([q, true]);
  while (stack.length > 0) {
    const [v, fromChild] = stack.pop()!;
    if (isObserved(v)) {
      // Blocks balls from children; reflects balls from parents back to the parents.
      if (!fromChild && !markedTop.has(v)) {
        markedTop.add(v);
        for (const p of cptByVar.get(v)?.parents ?? []) stack.push([p, true]);
      }
      continue;
    }
    if ((fromChild || soft.has(v)) && !markedTop.has(v)) {
      markedTop.add(v);
      for (const p of cptByVar.get(v)?.parents ?? []) stack.push([p, true]);
    }
    if (!markedBottom.has(v)) {
      markedBottom.add(v);
      for (const c of children.get(v) ?? []) stack.push([c, false]);
    }
  }

  const keptCpts = cpts.filter(c => markedTop.has(c.variable));
  const keep = new Set<Variable>(query);
  for (const c of keptCpts) {
    keep.add(c.variable);
    for (const p of c.parents) keep.add(p);
  }
  return { cpts: keptCpts, variables: variables.filter(v => keep.has(v)) };
}

/**
 * Resolve a `queryVariables` option to a set of variables, or undefined when
 * the query is not restricted (option absent). Throws on unknown names.
 */
export function resolveQueryVariables(
  variables: readonly Variable[],
  query?: readonly (Variable | string)[],
): Set<Variable> | undefined {
  if (!query) return undefined;
  const byName = new Map(variables.map(v => [v.name, v]));
  const result = new Set<Variable>();
  for (const q of query) {
    const v = typeof q === 'string' ? byName.get(q) : variables.includes(q) ? q : undefined;
    if (!v) {
      const name = typeof q === 'string' ? q : q.name;
      throw new Error(`nabab: unknown query variable "${name}". Known variables: ${[...byName.keys()].join(', ')}`);
    }
    result.add(v);
  }
  return result;
}
