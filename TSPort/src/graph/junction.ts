import {DirectedGraph, UndirectedGraph, Edge, Clique, growCliques, moralize, triangulate} from '.';
// import {UndirectedGraph} from './undirected_graph';
// import {Edge} from './edge';
// import {Clique, growCliques} from './cliques';
// import {moralize} from './moralization';
import {MultiMap} from '../collections/multimap';
import * as Immutable from 'immutable';

type Separator<V> = Immutable.Set<V>;

export function buildJunctionGraph<V>(graph: DirectedGraph<V, {}>, isLessThan: <T>(a: T, b: T) => boolean): UndirectedGraph<Clique<V>, Separator<V>> {
  console.log(`GRAPH: ${graph}`);

  let moralized = moralize(graph, isLessThan);
  console.log(`MORAL GRAPH: ${moralized}`);

  let triangulated = triangulate(moralized);
  console.log(`TRIANGULAR GRAPH: ${triangulated}`);

  let cliques = growCliques<V, {}>(triangulated, isLessThan);
  console.log(`CLIQUES: ${cliques}`);

  let cliquesByVertex = new MultiMap<V, Clique<V>>();
  cliques.forEach((c: Clique<V>) =>
      c.vertices.forEach((v: V) =>
          cliquesByVertex = cliquesByVertex.add(v, c)));

  let edges: Edge<Separator<V>, Clique<V>>[] = [];
  let separators = Immutable.Set<Separator<V>>();
  cliques.forEach((clique: Clique<V>) => {
    let neighbourCliques: Immutable.Set<Clique<V>> =
        clique.neighbours.flatMap((n: V) => cliquesByVertex.get(n)).toSet();

    neighbourCliques.forEach((neighbourClique: Clique<V>) => {
      let separator = clique.vertices.intersect(neighbourClique.vertices);
      let newSeparators = separators.add(separator);
      if (newSeparators !== separators) {
        edges.push(new Edge({from: clique, to: neighbourClique, value: separator}));
      }
    });
  });
  return UndirectedGraph.empty<Clique<V>, Separator<V>>(isLessThan).add({
    vertices: cliques.toArray(),
    edges: edges
  });
}
