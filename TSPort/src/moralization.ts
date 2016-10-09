import {DirectedGraph, UndirectedGraph, IsLessThan} from './graph';
import {Edge} from './edge';
import * as Immutable from 'immutable';

export function moralize<V>(graph: DirectedGraph<V, {}>, isLessThan: IsLessThan<V>): UndirectedGraph<V, {}> {
  let newEdges: Edge<{}, V>[] = [];

  for (let vertex of graph.vertices.toArray()) {
    let parents = graph.getOrigins(vertex).toArray();
    // "Marry" parents in non-oriented way:
    for (let i = 0; i < parents.length; i++) {
      for (let j = i + 1; j < parents.length; j++) {
        let pi = parents[i];
        let pj = parents[j];
        if (!graph.hasEdge(pi, pj)) {
          newEdges.push(new Edge({from: pi, to: pj}));
        }
      }
    }
  }
  return graph.add({edges: newEdges}).toUndirected(isLessThan);
}
