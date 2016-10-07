import {Edge, Graph, makeEdge} from './graph';

export function moralize<V>(graph: Graph<V, Edge<{}, V>>): Graph<V, Edge<{}, V>> {
  let newEdges: Edge<{}, V>[] = [];

  for (let vertex of graph.vertices.toArray()) {
    let parents = graph.getOrigins(vertex).toArray();
    // "Marry" parents in non-oriented way:
    for (let i = 0; i < parents.length; i++) {
      for (let j = i + 1; j < parents.length; j++) {
        let pi = parents[i];
        let pj = parents[j];
        if (!graph.hasEdge(pi, pj)) {
          newEdges.push(makeEdge(pi, pj));
          newEdges.push(makeEdge(pj, pi));
        }
      }
    }
    // Make sure graph isn't oriented:
    for (let parent of parents) {
      if (!graph.hasEdge(vertex, parent)) {
        newEdges.push(makeEdge(vertex, parent));
      }
    }  
  }
  return graph.add({edges: newEdges});
}
