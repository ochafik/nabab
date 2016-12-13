import * as Immutable from 'immutable';
import {DirectedGraph, UndirectedGraph, Edge} from '.';
import {Heap, IsLessThan} from '../collections/heap';
import {Forest, Tree} from './forest';

// Crude Kruskal algorithm implementation (https://en.wikipedia.org/wiki/Kruskal%27s_algorithm).
export function minimumSpanningTree<V, E>(graph: UndirectedGraph<V, E>, isLessThan: IsLessThan<E>): UndirectedGraph<V, E> {
  const allEdges = graph.getAllEdges();
  let heap = Heap.fromArray<Edge<E, V>>(allEdges, (a, b) => isLessThan(a.value!, b.value!));
  let forest = Forest.plant(graph.vertices);

  let edges: Edge<E, V>[] = [];
  while (forest.size > 1 && heap) {
    const [edge, heapRest] = heap.remove();
    heap = heapRest;
    
    const from = forest.getTree(edge.from);
    const to = forest.getTree(edge.to);
    if (from == to) {
      continue;
    }
    edges.push(edge);
    forest = forest.merge(from, to);
  }

  if (forest.size != 1) throw new Error(`Graph was not properly connected (remaining forest of size ${forest.size} and heap of size ${heap ? heap.size : 0}: ${forest})`);

  console.log(`SPANNING TREE: edge count went from ${allEdges.length} to ${edges.length}`);
  const tree = forest.trees.first(); 
  return graph.empty().add({vertices: graph.vertices.toArray(), edges: edges});
}
