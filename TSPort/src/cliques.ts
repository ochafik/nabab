import {Edge, Graph} from './graph';

type Clique<V> = Immutable.Set<V>;

export function growCliques<V, E extends Edge<any, V>>(graph: Graph<V, E>): Immutable.Set<Clique<V>> {
  let growableCliques: Immutable.Set<Clique<V>> = graph.vertices.map((v: V) => Immutable.Set.of<V>(v)).toSet();
  let maximalCliques = Immutable.Set<Clique<V>>();

  while (!growableCliques.isEmpty()) {
    let clique = growableCliques.first();
    growableCliques = growableCliques.remove(clique);
    if (growableCliques.isEmpty()) {
      maximalCliques = maximalCliques.add(clique);
    } else {
      let vertices = clique.toArray();
      let merged = false;
      for (const otherClique of growableCliques.toArray()) {
        if (vertices.every((v1: V) => otherClique.every((v2: V) => graph.hasEdge(v1, v2)))) {
          // All pairs of vertices accross the two cliques are connected: merge them.
          growableCliques = growableCliques.remove(otherClique).add(clique.union(otherClique));
          merged = true;
          break;
        }
      }
      if (!merged) {
        maximalCliques = maximalCliques.add(clique);
      }
    }
  }

  return maximalCliques;
}
