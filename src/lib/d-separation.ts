/**
 * D-separation testing for Bayesian networks using the Bayes Ball algorithm.
 *
 * D-separation is a graph-theoretic criterion for determining conditional
 * independence: if X and Y are d-separated given Z, then X ⊥ Y | Z in every
 * distribution faithful to the graph.
 *
 * Reference: Shachter, R.D. (1998). "Bayes-Ball: The Rational Pastime."
 */
import type { Variable } from './types.js';
import { BayesianNetwork } from './network.js';

/**
 * Resolve a variable reference (string or Variable) to a Variable object.
 */
function resolveVar(network: BayesianNetwork, v: Variable | string): Variable {
  if (typeof v === 'string') {
    const resolved = network.getVariable(v);
    if (!resolved) throw new Error(`Unknown variable: ${v}`);
    return resolved;
  }
  return v;
}

/**
 * Run the Bayes Ball algorithm from a starting variable, returning all
 * d-connected (reachable) variables.
 *
 * The algorithm maintains a work-list of (node, direction) pairs where
 * direction indicates whether the ball is arriving "from a child" or
 * "from a parent". The propagation rules are:
 *
 *   Arriving from a child (ball going "up"):
 *     - If the node is NOT in Z: pass to parents (up) and children (down)
 *     - If the node IS in Z: blocked
 *       (actually: pass to parents only — "explaining away" is handled by
 *        the "from parent at observed" rule below)
 *       Correction per Bayes Ball: if observed, do NOT pass anywhere when
 *       arriving from a child.
 *       Wait — let me re-derive carefully.
 *
 *   The Bayes Ball rules (Shachter 1998):
 *
 *   When a ball visits node j:
 *     Case 1: j is NOT observed (not in Z)
 *       - If ball came from a child  → send to all parents AND all children
 *       - If ball came from a parent → send to all children only
 *     Case 2: j IS observed (in Z)
 *       - If ball came from a child  → blocked (do nothing)
 *       - If ball came from a parent → send to all parents (explaining away)
 *
 *   A node Y is d-connected to X given Z if a ball starting from X
 *   can reach Y.
 */
function bayesBall(
  network: BayesianNetwork,
  start: Variable,
  observed: Set<Variable>,
): Set<Variable> {
  // Directions the ball can travel
  const FROM_CHILD = 0;
  const FROM_PARENT = 1;

  // Track visited (node, direction) pairs to avoid infinite loops
  const visited = new Set<string>();
  const key = (v: Variable, dir: number) => `${v.name}:${dir}`;

  // All reachable (d-connected) variables
  const reachable = new Set<Variable>();

  // Work-list: [variable, direction]
  const queue: Array<[Variable, number]> = [];

  // Start: schedule visits from both directions.
  // The starting node should be treated as if a ball is initiated there.
  // Per the algorithm, we schedule it as "arriving from a child" so that
  // if X is not observed, the ball propagates to parents and children.
  // We also schedule "arriving from a parent" to cover the downward case.
  queue.push([start, FROM_CHILD]);
  queue.push([start, FROM_PARENT]);

  while (queue.length > 0) {
    const [node, direction] = queue.pop()!;
    const k = key(node, direction);
    if (visited.has(k)) continue;
    visited.add(k);

    // Mark this node as reachable (d-connected)
    reachable.add(node);

    const isObserved = observed.has(node);
    const parents = network.getParents(node);
    const children = network.getChildren(node);

    if (direction === FROM_CHILD) {
      // Ball arrived from a child (travelling upward)
      if (!isObserved) {
        // Not observed: pass to parents (up) and children (down)
        for (const p of parents) {
          queue.push([p, FROM_CHILD]);
        }
        for (const c of children) {
          queue.push([c, FROM_PARENT]);
        }
      }
      // If observed: blocked — do nothing
    } else {
      // direction === FROM_PARENT
      // Ball arrived from a parent (travelling downward)
      if (!isObserved) {
        // Not observed: pass to children only (continue downward)
        for (const c of children) {
          queue.push([c, FROM_PARENT]);
        }
      } else {
        // Observed: "explaining away" — pass to parents (upward)
        for (const p of parents) {
          queue.push([p, FROM_CHILD]);
        }
      }
    }
  }

  return reachable;
}

/**
 * Test if X and Y are d-separated given Z in a Bayesian network.
 * Uses the Bayes Ball algorithm (Shachter 1998).
 *
 * X and Y are d-separated given Z if there is no active (d-connecting)
 * path between them. Equivalently, starting a "ball" at X, it cannot
 * reach Y when the nodes in Z are observed.
 */
export function isDSeparated(
  network: BayesianNetwork,
  x: Variable | string,
  y: Variable | string,
  given: Array<Variable | string>,
): boolean {
  const xVar = resolveVar(network, x);
  const yVar = resolveVar(network, y);
  const observed = new Set(given.map(g => resolveVar(network, g)));

  const reachable = bayesBall(network, xVar, observed);
  return !reachable.has(yVar);
}

/**
 * Find all variables that are d-connected to X given Z.
 * A variable V is d-connected to X given Z if there exists an active
 * (unblocked) path between X and V in the network.
 */
export function dConnectedVars(
  network: BayesianNetwork,
  x: Variable | string,
  given: Array<Variable | string>,
): Set<Variable> {
  const xVar = resolveVar(network, x);
  const observed = new Set(given.map(g => resolveVar(network, g)));

  const reachable = bayesBall(network, xVar, observed);
  // Remove X itself from the result
  reachable.delete(xVar);
  return reachable;
}

/**
 * Compute the Markov blanket of a variable.
 *
 * The Markov blanket of a node X consists of:
 *   - X's parents
 *   - X's children
 *   - The other parents of X's children (co-parents)
 *
 * Given the Markov blanket, X is conditionally independent of all
 * other variables in the network.
 */
export function markovBlanket(
  network: BayesianNetwork,
  variable: Variable | string,
): Set<Variable> {
  const v = resolveVar(network, variable);
  const blanket = new Set<Variable>();

  // Parents
  for (const p of network.getParents(v)) {
    blanket.add(p);
  }

  // Children
  const children = network.getChildren(v);
  for (const c of children) {
    blanket.add(c);
  }

  // Co-parents (other parents of my children)
  for (const c of children) {
    for (const p of network.getParents(c)) {
      if (p !== v) {
        blanket.add(p);
      }
    }
  }

  return blanket;
}
