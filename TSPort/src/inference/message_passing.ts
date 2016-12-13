import {DirectedGraph, UndirectedGraph, Edge, Clique, JunctionTree, Separator, growCliques, minimumSpanningTree, moralize, triangulate} from '../graph';
import {MultiMap} from '../collections/multimap';
import {Potential} from './potential';
import * as Immutable from 'immutable';

export function computePotentials<V, E>(graph: DirectedGraph<V, E>, junctionTree: JunctionTree<V>): [Immutable.Map<Clique<V>, Potential<V>>, Immutable.Map<Separator<V>, Potential<V>>] {
  let cliquePotentials = Immutable.Map<Clique<V>, Potential<V>>();
  let separatorPotentials = Immutable.Map<Separator<V>, Potential<V>>();

  // Initialize clique potentials.
  cliquePotentials = cliquePotentials.withMutations(m => {
    let unassignedVariables = graph.vertices;
    for (const clique of junctionTree.vertices.toArray()) {
      let potential = Potential.unit<V>(); 
      for (const variable of clique.vertices.toArray()) {
        if (unassignedVariables.contains(variable) && clique.vertices.isSuperset(graph.getOrigins(variable))) {
          potential = potential.multiplyWith(Potential.of(variable));
          unassignedVariables = unassignedVariables.remove(variable);
        }
      }
      m.set(clique, potential);
    }
    if (!unassignedVariables.isEmpty) {
      throw new Error(`Found remaining unassignedVariables: ${unassignedVariables}`);
    }
  });

  // TODO: message passing
  
  return [cliquePotentials, separatorPotentials];
} 

class Distribution<T> {

}