/**
 * BayesianNetwork: combines structure with inference.
 */
import type { Variable, CPT, Evidence, LikelihoodEvidence, Distribution } from './types.js';
import { infer, type InferenceResult } from './inference.js';
import { parseXmlBif, type ParsedNetwork } from './xmlbif-parser.js';

export class BayesianNetwork {
  readonly name: string;
  readonly variables: readonly Variable[];
  readonly cpts: readonly CPT[];
  private _variablesByName: Map<string, Variable>;

  constructor(parsed: ParsedNetwork) {
    this.name = parsed.name;
    this.variables = parsed.variables;
    this.cpts = parsed.cpts;
    this._variablesByName = new Map(parsed.variables.map(v => [v.name, v]));
  }

  /** Parse a network from XMLBIF content. */
  static fromXmlBif(content: string, domParser?: { parseFromString(s: string, t: string): Document }): BayesianNetwork {
    return new BayesianNetwork(parseXmlBif(content, domParser));
  }

  /** Get a variable by name. */
  getVariable(name: string): Variable | undefined {
    return this._variablesByName.get(name);
  }

  /** Get the parents of a variable. */
  getParents(variable: Variable): readonly Variable[] {
    const cpt = this.cpts.find(c => c.variable === variable);
    return cpt?.parents ?? [];
  }

  /** Get the children of a variable. */
  getChildren(variable: Variable): Variable[] {
    return this.cpts
      .filter(c => c.parents.includes(variable))
      .map(c => c.variable);
  }

  /**
   * Run exact inference with optional evidence.
   * Supports both hard evidence (variable=outcome) and soft/likelihood
   * evidence (variable -> outcome weights).
   */
  infer(evidence?: Evidence, likelihoodEvidence?: LikelihoodEvidence): InferenceResult {
    return infer(this.variables, this.cpts, evidence, likelihoodEvidence);
  }

  /** Get the prior distributions (no evidence). */
  priors(): Map<Variable, Distribution> {
    return this.infer().posteriors;
  }

  /**
   * Query a single variable given evidence.
   */
  query(variableName: string, evidence?: Evidence): Distribution {
    const v = this._variablesByName.get(variableName);
    if (!v) throw new Error(`Unknown variable: ${variableName}`);
    const result = this.infer(evidence);
    return result.posteriors.get(v) ?? new Map();
  }

  toString(): string {
    const lines = [`BayesianNetwork "${this.name}" {`];
    for (const cpt of this.cpts) {
      const parents = cpt.parents.map(p => p.name).join(', ');
      lines.push(`  P(${cpt.variable.name}${parents ? ' | ' + parents : ''})`);
    }
    lines.push('}');
    return lines.join('\n');
  }
}
