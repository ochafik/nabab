import {DirectedGraph, UndirectedGraph, Edge, Clique, growCliques, minimumSpanningTree, moralize, triangulate} from '../graph';
import {JunctionTree, Separator} from '../graph/junction';

import {MultiMap} from '../collections';
import {Potential} from './potential';
import * as Immutable from 'immutable';

export function computePotentials<V, E>(graph: DirectedGraph<V, E>, junctionTree: JunctionTree<V>): [Immutable.Map<Clique<V>, Potential<V>>, Immutable.Map<Separator<V>, Potential<V>>] {
  // Initialize clique potentials.
  let cliquePotentials = Immutable.Map<Clique<V>, Potential<V>>().withMutations(m => {
    let unassignedVariables = graph.vertices;

    function assign(variable: V): boolean {
      const without = unassignedVariables.remove(variable);
      if (Immutable.is(unassignedVariables, without)) return false;
      unassignedVariables = without;
      return true;
    }
    const cliquePotentials = Immutable.Map<Clique<V>, Potential<V>>(
        junctionTree.vertices.map((clique: Clique<V>) => [
          clique,
          Potential.multiply<V>(clique.vertices
              .filter((variable: V) => clique.vertices.isSuperset(graph.getOrigins(variable)) && assign(variable))
              .map((variable: V) => Potential.of(variable))
              .toArray())
        ]));

    console.log(`cliquePotentials = ${cliquePotentials}`);

    // for (const clique of junctionTree.vertices.toArray()) {
    //   let potential = Potential.unit<V>(); 
    //   for (const variable of clique.vertices.toArray()) {
    //     if (unassignedVariables.contains(variable) && clique.vertices.isSuperset(graph.getOrigins(variable))) {
    //       potential = potential.multiplyWith(Potential.of(variable));
    //       unassignedVariables = unassignedVariables.remove(variable);
    //     }
    //   }
    //   m.set(clique, potential);
    // }
    if (!unassignedVariables.isEmpty) {
      throw new Error(`Found remaining unassignedVariables: ${unassignedVariables}`);
    }
  });
  let separatorPotentials = Immutable.Map<Separator<V>, Potential<V>>();

  
  // TODO: message passing

  return [cliquePotentials, separatorPotentials];
} 

function getNeighbourCliques<V>(junctionTree: JunctionTree<V>): MultiMap<Clique<V>, Clique<V>> {
    let cliquesByVertex = MultiMap.build<V, Clique<V>>(builder =>
        junctionTree.vertices.forEach((clique: Clique<V>) =>
            clique.vertices.forEach((v: V) => builder.add(v, clique))));
    
    return MultiMap.build<Clique<V>, Clique<V>>(builder =>
        junctionTree.vertices.forEach((clique: Clique<V>) =>
            clique.vertices.forEach((v: V) => 
                cliquesByVertex.get(v).forEach((c: Clique<V>) => builder.add(clique, c)))));
}

function globalPropagation<V>(source: Clique<V>, junctionTree: JunctionTree<V>, cliquePotentials: Immutable.Map<Clique<V>, Potential<V>>, separatorsPotentials: Map<Edge<Separator<V>, Clique<V>>, Potential<V>>): any {
  const cliquesNeighbours = getNeighbourCliques(junctionTree);
  let markedCliques = Immutable.Set<Clique<V>>();
  
  //printCliquePotentials("Initial clique potentials", nodeSetList, cliquePotentials);
  
  //System.out.println("Collecting evidence");
  
  collectEvidence(iSource, -1, markedCliques, nodeSetList, cliquesNeighbours, cliquePotentials, separatorsPotentials);
  //printCliquePotentials("Clique potentials after evidence collection", nodeSetList, cliquePotentials);
  
  Arrays.fill(markedCliques, false);
  
  //System.out.println("Distributing evidence");
  distributeEvidence(iSource, markedCliques, nodeSetList, cliquesNeighbours, cliquePotentials, separatorsPotentials);
  //printCliquePotentials("Clique potentials after evidence distribution", nodeSetList, cliquePotentials);
  
}

class Distribution<T> {

}