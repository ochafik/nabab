import * as Immutable from 'immutable';
import {MultiMap} from '../collections/multimap';
import {Edge, flipEdge} from './edge';
import {UndirectedGraph, normalizeUndirectedEdge} from './undirected_graph';

export class DirectedGraph<V, E> {
    protected constructor(
        public readonly vertices = Immutable.Set<V>(),
        private outgoingEdges = new MultiMap<V, Edge<E, V>>(),
        private destinations = new MultiMap<V, V>(),
        private incomingEdges = new MultiMap<V, Edge<E, V>>(),
        private origins = new MultiMap<V, V>()) {}

    static empty<V, E>(): DirectedGraph<V, E> {
        return new DirectedGraph<V, E>();
    }
    
    toUndirected(isLessThan: IsLessThan<V>): UndirectedGraph<V, E> {
        return new UndirectedGraph<V, E>(
            isLessThan,
            this.vertices,
            this.outgoingEdges.merge(this.incomingEdges).mapValues(e => normalizeUndirectedEdge(e, isLessThan)),
            this.destinations.merge(this.origins));

    }
    toString() {
        return "DIRECTED GRAPH:\n" + 
            this.vertices.map(v => `VERTEX: ${v!.toString()}`).join('\n') + '\n' +
            // this.destinations + '\n' +
            // this.origins + '\n' +
            this.outgoingEdges.map.valueSeq().flatMap(set => set!.map((e: Edge<E, V>) =>
                `EDGE: ${e!.from.toString()} -> ${e!.to.toString()} (${e!.value ? e!.value!.toString() : ''})`)).join('\n') + '\n';
    }

    hasEdge(from: V, to: V): boolean {
        return this.getDestinations(from).contains(to);
    }
    getOutgoingEdges(vertex: V): Immutable.Set<Edge<E, V>> {
        return this.outgoingEdges.get(vertex) || Immutable.Set<V>();
    }
    getIncomingEdges(vertex: V): Immutable.Set<Edge<E, V>> {
        return this.incomingEdges.get(vertex) || Immutable.Set<V>();
    }
  
    getOrigins(vertex: V): Immutable.Set<V> {
        return this.origins.get(vertex) || Immutable.Set<V>();
    }
    getDestinations(vertex: V): Immutable.Set<V> {
        return this.destinations.get(vertex) || Immutable.Set<V>();
    }
    add({vertices = [], edges = []}: {vertices?: V[], edges?: Edge<E, V>[]}): DirectedGraph<V, E> {
        // if (!edges.every(e => e instanceof Edge)) throw '';

        let newVertices = this.vertices.union(vertices);
        let newOutgoingEdges = this.outgoingEdges;
        let newIncomingEdges = this.incomingEdges;
        let newDestinations = this.destinations;
        let newOrigins = this.origins;

        for (const edge of edges) {
            newOutgoingEdges = newOutgoingEdges.add(edge.from, edge);
            newDestinations = newDestinations.add(edge.from, edge.to);
            newIncomingEdges = newIncomingEdges.add(edge.to, edge);
            newOrigins = newOrigins.add(edge.to, edge.from);
        }
        return new DirectedGraph<V, E>(newVertices, newOutgoingEdges, newDestinations, newIncomingEdges, newOrigins);
    }
    remove({vertices = [], edges = []}: {vertices?: V[], edges?: Edge<E, V>[]}): DirectedGraph<V, E> {
        // if (!edges.every(e => e instanceof Edge)) throw '';

        let newVertices = this.vertices.subtract(vertices);
        let newOutgoingEdges = this.outgoingEdges;
        let newIncomingEdges = this.incomingEdges;
        let newDestinations = this.destinations;
        let newOrigins = this.origins;

        for (const edge of edges) {
            newOutgoingEdges = newOutgoingEdges.remove(edge.from, edge);
            newDestinations = newDestinations.remove(edge.from, edge.to);
            newOrigins = newDestinations.remove(edge.to, edge.from);
            newIncomingEdges = newIncomingEdges.remove(edge.to, edge);
        }
        return new DirectedGraph<V, E>(newVertices, newOutgoingEdges, newDestinations, newIncomingEdges, newOrigins);
    }
}
