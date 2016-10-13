import {UndirectedGraph, Edge} from '.';
import {MultiMap} from '../collections/multimap';
import * as Immutable from 'immutable';

export class Clique<V> {
  private constructor(
    public readonly graph: UndirectedGraph<V, any>,
    public readonly vertices: Immutable.Set<V>,
    public readonly neighbours: Immutable.Set<V>
  ) {}

  static of<V>(graph: UndirectedGraph<V, any>, vertices: Immutable.Set<V>): Clique<V> {
    return new Clique<V>(graph, vertices, vertices.flatMap((v: V) => graph.getNeighbours(v)).toSet());
  }

  toString() {
      return this.vertices.toString();
  }

  add(vertex: V): Clique<V> {
    return this.addAll(Immutable.Set.of(vertex));
  }
  addAll(vertices: Immutable.Set<V>): Clique<V> {
    return new Clique<V>(
      this.graph,
      this.vertices.union(vertices),
      this.neighbours
          .subtract(vertices)
          .union(vertices.flatMap((v: V) =>
            this.graph.getNeighbours(v).filterNot((n: V) => this.vertices.contains(n)))))
  }
  hashCode(): number {
    return this.vertices.hashCode();
  }
  equals(o: any): boolean {
    return o instanceof Clique && o.vertices.equals(this.vertices);
  }
}

export function* growClique<V, E extends Edge<any, V>>(clique: Clique<V>, isLessThan: (a: V, b: V) => boolean): Iterable<Clique<V>> {
  let isMaximal = true;
  const vertices = clique.vertices;
  const graph = clique.graph;
  for (let n of clique.neighbours.toArray()) {
    if (vertices.every((v: V) => graph.hasEdge(v, n))) {
      isMaximal = false;
      if (vertices.every((v: V) => isLessThan(v, n))) {
        yield *growClique(clique.add(n), isLessThan);
      }
    }
  }
  if (isMaximal) {
    yield clique;
  }
}

export function growCliques<V, E>(graph: UndirectedGraph<V, E>, isLessThan: (a: V, b: V) => boolean): Immutable.Set<Clique<V>> {
  let result = Immutable.Set<Clique<V>>();
  graph.vertices.forEach((v: V) =>
      result = result.union([...growClique(Clique.of(graph, Immutable.Set.of(v)), isLessThan)]));
  return result;
}
