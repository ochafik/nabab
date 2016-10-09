import {DirectedGraph, UndirectedGraph} from './graph';
import {Edge} from './edge';
import Immutable = require('immutable');

export function moralize<V>(graph: DirectedGraph<V, {}>): UndirectedGraph<V, {}> {
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
    // Make sure graph isn't oriented:
    for (let parent of parents) {
      if (!graph.hasEdge(vertex, parent)) {
        newEdges.push(new Edge({from: vertex, to: parent}));
      }
    }  
  }
  return graph.add({edges: newEdges}).toUndirected();
}
