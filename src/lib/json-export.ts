/**
 * JSON serialization / deserialization for BayesianNetwork.
 *
 * Provides a clean, portable JSON representation that is independent
 * of the XMLBIF format and easy to consume from other tools.
 */
import type { Variable, CPT } from './types.js';
import { BayesianNetwork } from './network.js';

/**
 * A clean JSON representation of a Bayesian network.
 */
export interface NetworkJSON {
  name: string;
  variables: Array<{
    name: string;
    outcomes: string[];
    position?: { x: number; y: number };
  }>;
  edges: Array<{ from: string; to: string }>;
  cpts: Array<{
    variable: string;
    parents: string[];
    table: number[];
  }>;
}

/**
 * Serialize a BayesianNetwork to a clean JSON object.
 */
export function toJSON(network: BayesianNetwork): NetworkJSON {
  const variables = network.variables.map(v => {
    const entry: NetworkJSON['variables'][number] = {
      name: v.name,
      outcomes: [...v.outcomes],
    };
    if (v.position) {
      entry.position = { x: v.position.x, y: v.position.y };
    }
    return entry;
  });

  // Collect edges from CPT parent relationships
  const edges: Array<{ from: string; to: string }> = [];
  for (const cpt of network.cpts) {
    for (const parent of cpt.parents) {
      edges.push({ from: parent.name, to: cpt.variable.name });
    }
  }

  const cpts = network.cpts.map(cpt => ({
    variable: cpt.variable.name,
    parents: cpt.parents.map(p => p.name),
    table: Array.from(cpt.table),
  }));

  return { name: network.name, variables, edges, cpts };
}

/**
 * Deserialize a NetworkJSON back into a BayesianNetwork.
 */
export function fromJSON(json: NetworkJSON): BayesianNetwork {
  // Build Variable objects indexed by name
  const variablesByName = new Map<string, Variable>();
  const variables: Variable[] = [];

  for (const v of json.variables) {
    const variable: Variable = {
      name: v.name,
      outcomes: v.outcomes,
      ...(v.position ? { position: { x: v.position.x, y: v.position.y } } : {}),
    };
    variablesByName.set(v.name, variable);
    variables.push(variable);
  }

  // Build CPT objects
  const cpts: CPT[] = json.cpts.map(c => {
    const variable = variablesByName.get(c.variable);
    if (!variable) throw new Error(`Unknown variable in CPT: ${c.variable}`);

    const parents = c.parents.map(name => {
      const v = variablesByName.get(name);
      if (!v) throw new Error(`Unknown parent variable: ${name}`);
      return v;
    });

    return {
      variable,
      parents,
      table: new Float64Array(c.table),
    };
  });

  return new BayesianNetwork({ name: json.name, variables, cpts });
}
