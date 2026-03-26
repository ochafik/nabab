import {DirectedGraph, Edge, buildJunctionGraph} from './graph';
import {Network} from './network';
import {Distribution, Variable, VariableLikelihood, Observations} from './variable';
import * as Immutable from 'immutable';
import {mapFromKeyValues} from './collections';

// Find examples:
// http://www.cs.huji.ac.il/~galel/Repository/

// const positionRegExp = /\s*position\s*=\s*\((\d+)\s*,\s*(\d+)\)\s*$/;


function getText(node: Element | null): string {
  return node == null ? '' : node.textContent || '';
}
function parseKeyValue(kv: string): [string, string] {
  return kv.split('=').map(s => s.trim()) as [string, string];
}
function single<T>(values: T[]): T {
  if (values.length != 1) throw new Error(`Expected length 1, got ${values.length}`);
  return values[0];
}
function quote(s: string): string {
  return `'${s}'`;
}

const positionPropertyRegExp = /\((\d+)\s*,\s*(\d+)\)/;
function parsePositionProperty(value?: string): ({x: number, y: number} | undefined) {
  if (value == null) return undefined;
  let [, x, y] = [...positionPropertyRegExp.exec(value)!] as any;
  return x != null && y != null ? {x: Number(x), y: Number(y)} : undefined;
}

function readDistributions(variable: Variable, given: ReadonlyArray<Variable>, values: number[]): Immutable.Map<Observations, Distribution> {
  let result = Immutable.Map<Observations, Distribution>();
  let i = 0;
  function recurse(obs: Observations, remainingVars: ReadonlyArray<Variable>) {
    if (remainingVars.length == 0) {
      let dist = Immutable.Map<string, number>();
      for (const outcome of variable.outcomes) {
        dist = dist.set(outcome, values[i++]);
      }
      result = result.set(obs, dist);
    } else {
      const [first, ...others] = remainingVars;
      for (const outcome of first.outcomes) {
        const subObs = obs.set(first, outcome);
        recurse(subObs, others);
      }
    }
  }
  recurse(Immutable.Map<Variable, string>(), given);
  return result;
}

export function parseXmlBif(content: string) {
  const doc = new DOMParser().parseFromString(content, "text/xml");

  // XMLBIF: http://www.cs.cmu.edu/~fgcozman/Research/InterchangeFormat/
  let graph = DirectedGraph.empty<string, {}>();

  let variables = Immutable.Map<string, Variable>();
  let likelihoods: VariableLikelihood[] = [];
  // let edges = [];

  function select(n: Element | Document, tagName: string): Element[] {
    return [...n.getElementsByTagName(tagName)];
  }

  for (let v of select(doc, 'VARIABLE')) {
    const name = getText(single(select(v, 'NAME')));
    const outcomes = select(v, 'OUTCOME').map(getText);
    const properties = mapFromKeyValues(select(v, 'PROPERTY').map(getText).map(parseKeyValue));
    variables = variables.set(name, new Variable({
      name: name,
      outcomes: outcomes,
      position: parsePositionProperty(properties.get('position')) 
    }));
  }
  function getVariable(name: string): Variable {
    const v = variables.get(name);
    if (v == null) throw new Error(`No variable named ${quote(name)} (known variables: ${variables.keySeq().map(quote).join(', ')})'` )
    return v;
  }
  for (let d of select(doc, 'DEFINITION')) {
    const variable = getVariable(getText(single(select(d, 'FOR'))));
    const dependencies = select(d, 'GIVEN').map(getText).map(getVariable);
    let distributions = readDistributions(variable, dependencies, getText(single(select(d, 'TABLE'))).trim().split(/\s+/).map(Number));
    likelihoods.push(new VariableLikelihood({variable, dependencies, distributions}));
  }

  return Network.of(likelihoods);  
}
