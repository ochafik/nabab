import * as Immutable from 'immutable';
import {DirectedGraph, UndirectedGraph, Edge} from '.';

function commonTriangulation<V>(vertices: Immutable.Set<V>, getNeighbours: (vertex: V) => Immutable.Set<V>, hasEdge: (a: V, b: V) => boolean): Edge<{}, V>[] {
  let newEdges: Edge<{}, V>[] = [];

  for (let vertex of vertices.toArray()) {
    let parents = getNeighbours(vertex).toArray();
    // "Marry" parents in non-oriented way:
    for (let i = 0; i < parents.length; i++) {
      for (let j = i + 1; j < parents.length; j++) {
        let pi = parents[i];
        let pj = parents[j];
        if (!hasEdge(pi, pj)) {
          newEdges.push(new Edge({from: pi, to: pj}));
        }
      }
    }
  }
  return newEdges;
}

export function moralize<V>(graph: DirectedGraph<V, {}>, isLessThan: IsLessThan<V>): UndirectedGraph<V, {}> {
  let newEdges = commonTriangulation<V>(graph.vertices, v => graph.getOrigins(v), (a, b) => graph.hasEdge(a, b));
  return graph.add({edges: newEdges}).toUndirected(isLessThan);
}

export function triangulate<V>(graph: UndirectedGraph<V, {}>): UndirectedGraph<V, {}> {
  let newEdges = commonTriangulation<V>(graph.vertices, v => graph.getNeighbours(v), (a, b) => graph.hasEdge(a, b));
  return graph.add({edges: newEdges});
}
