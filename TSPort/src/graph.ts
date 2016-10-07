///<reference path='../node_modules/immutable/dist/immutable.d.ts'/>

import {MultiMap} from './multimap';

export interface Graph<V, E extends Edge<any, V>> {
  readonly vertices: Immutable.Set<V>;
  getOutgoingEdges(vertex: V): Immutable.Set<E>;
  getIncomingEdges(vertex: V): Immutable.Set<E>;
  
  getOrigins(vertex: V): Immutable.Set<V>;
  getDestinations(vertex: V): Immutable.Set<V>;

  hasEdge(from: V, to: V): boolean;
  add({vertices, edges}: {vertices?: V[], edges?: E[]}): Graph<V, E>;
  remove({vertices, edges}: {vertices?: V[], edges?: E[]}): Graph<V, E>;
}
export interface Edge<E, V> {
    readonly value: E;
    readonly origin: V;
    readonly destination: V;
}
export class DefaultEdge<E, V> implements Edge<E, V> {
    constructor(
        readonly value: E,
        readonly origin: V,
        readonly destination: V) {}
}
export function makeEdge<E, V>(origin: V, destination: V, value?: E): DefaultEdge<E, V> {
    return new DefaultEdge<E, V>(value as E, origin, destination);
}

export class DefaultGraph<V, E extends Edge<any, V>> implements Graph<V, E> {
    constructor(
        public readonly vertices = Immutable.Set<V>(),
        private outgoingEdges = new MultiMap<V, E>(),
        private destinations = new MultiMap<V, V>(),
        private incomingEdges = new MultiMap<V, E>(),
        private origins = new MultiMap<V, V>()) {}

    hasEdge(from: V, to: V): boolean {
        let destinations = this.destinations.get(from);
        return destinations && destinations.contains(to);
    }
    getOutgoingEdges(vertex: V): Immutable.Set<E> {
        return this.outgoingEdges.get(vertex);
    }
    getIncomingEdges(vertex: V): Immutable.Set<E> {
        return this.incomingEdges.get(vertex);
    }
  
    getOrigins(vertex: V): Immutable.Set<V> {
        return this.origins.get(vertex);
    }
    getDestinations(vertex: V): Immutable.Set<V> {
        return this.destinations.get(vertex);
    }
    add({vertices = [], edges = []}: {vertices?: V[], edges?: E[]}): DefaultGraph<V, E> {
        let newVertices = this.vertices.union(vertices);
        let newOutgoingEdges = this.outgoingEdges;
        let newIncomingEdges = this.incomingEdges;
        let newDestinations = this.destinations;
        let newOrigins = this.origins;

        for (const edge of edges) {
            newOutgoingEdges = newOutgoingEdges.add(edge.origin, edge);
            newIncomingEdges = newIncomingEdges.add(edge.destination, edge);
            newDestinations = newDestinations.add(edge.origin, edge.destination);
            newOrigins = newDestinations.add(edge.destination, edge.origin);
        }
        return new DefaultGraph<V, E>(newVertices, newOutgoingEdges, newDestinations, newIncomingEdges, newOrigins);
    }
    remove({vertices = [], edges = []}: {vertices?: V[], edges?: E[]}): DefaultGraph<V, E> {
        let newVertices = this.vertices.subtract(vertices);
        let newOutgoingEdges = this.outgoingEdges;
        let newIncomingEdges = this.incomingEdges;
        let newDestinations = this.destinations;
        let newOrigins = this.origins;

        for (const edge of edges) {
            newOutgoingEdges = newOutgoingEdges.remove(edge.origin, edge);
            newIncomingEdges = newIncomingEdges.remove(edge.destination, edge);
            newDestinations = newDestinations.remove(edge.origin, edge.destination);
            newOrigins = newDestinations.remove(edge.destination, edge.origin);
        }
        return new DefaultGraph<V, E>(newVertices, newOutgoingEdges, newDestinations, newIncomingEdges, newOrigins);
    }
}
