import {DirectedGraph, UndirectedGraph, Edge, Clique, growCliques, minimumSpanningTree, moralize, triangulate} from '.';
import {MultiMap} from '../collections/multimap';
import * as Immutable from 'immutable';

export type Separator<V> = Immutable.Set<V>;
export type JunctionTree<V> = UndirectedGraph<Clique<V>, Separator<V>>;

export function buildJunctionTree<V>(graph: DirectedGraph<V, {}>, isLessThan: <T>(a: T, b: T) => boolean): JunctionTree<V> {
  // console.log(`GRAPH: ${graph}`);

  let moralized = moralize(graph, isLessThan);
  // console.log(`MORAL GRAPH: ${moralized}`);

  let triangulated = triangulate(moralized);
  // console.log(`TRIANGULAR GRAPH: ${triangulated}`);

  let cliques = growCliques<V, {}>(triangulated, isLessThan);
  // console.log(`CLIQUES: ${cliques}`);

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

  let junctionGraph = UndirectedGraph.empty<Clique<V>, Separator<V>>(isLessThan).add({
    vertices: cliques.toArray(),
    edges: edges
  });
  // console.log(`JUNCTION GRAPH: ${junctionGraph}`);

  // let junctionTree = junctionGraph;
  let junctionTree = minimumSpanningTree<Clique<V>, Separator<V>>(junctionGraph, (a, b) => a.size > b.size);
  //console.log(`JUNCTION TREE: ${junctionTree}`);
  // console.log(`JUNCTION TREE: ${junctionTree.vertices.size}  `);

  return junctionTree;
}
