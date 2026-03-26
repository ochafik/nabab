/**
 * A discrete random variable with a finite set of outcomes.
 */
export interface Variable {
  readonly name: string;
  readonly outcomes: readonly string[];
  readonly position?: { readonly x: number; readonly y: number };
}

/**
 * A conditional probability table entry: P(variable | parents).
 * The `table` values are stored in row-major order where parents vary
 * outermost (first parent = outermost) and the variable varies innermost.
 */
export interface CPT {
  readonly variable: Variable;
  readonly parents: readonly Variable[];
  readonly table: Float64Array;
}

/**
 * Hard evidence: maps variable names to observed outcome strings.
 */
export type Evidence = Map<string, string>;

/**
 * Likelihood evidence: maps variable names to likelihood weights per outcome.
 * Values are non-negative weights (not necessarily normalized).
 * Example: { "rain": { "true": 0.8, "false": 0.2 } } means 80% sure it's raining.
 * Hard evidence is a special case where one outcome has weight 1 and others have 0.
 */
export type LikelihoodEvidence = Map<string, Map<string, number>>;

/**
 * A probability distribution over a variable's outcomes.
 */
export type Distribution = Map<string, number>;
