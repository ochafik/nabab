import * as Immutable from 'immutable';
import {DirectedGraph, Edge} from './graph';
import {Variable, VariableLikelihood} from './variable';
import {mapFromKeyValues} from './collections';

export class Network extends Immutable.Record({likelihoods: undefined, graph: undefined}) {
  // new({likelihoods}: {likelihoods: Immutable.Map<Variable, VariableLikelihood>}): Network;
  likelihoods: Immutable.Map<Variable, VariableLikelihood>;
  graph: DirectedGraph<Variable, {}>;

  private constructor(
      likelihoods: Immutable.Map<Variable, VariableLikelihood>,
      graph: DirectedGraph<Variable, {}>) {
    super({likelihoods, graph});
  }

  toString() {
    return `Network {\n${this.likelihoods.valueSeq().map(v => v!.toString()).join('\n')}\n}`;
  }

  static of(likelihoods: VariableLikelihood[]): Network {
    return new Network(
        mapFromKeyValues(likelihoods.map(l => [l.variable, l] as [Variable, VariableLikelihood])),
        DirectedGraph.empty<Variable, {}>().add({
          vertices: likelihoods.map(l => l.variable),
          edges: Immutable.Seq.of(...likelihoods).flatMap(likelihood =>
              Immutable.Seq.of(...likelihood!.dependencies.map(dep =>
                  new Edge({from: dep, to: likelihood!.variable})))).toArray()
        }));
  }
}
