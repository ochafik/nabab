import * as Immutable from 'immutable';
import {MultiMap} from './multimap';
import {Edge, flipEdge} from './edge';;

export type IsLessThan<T> = (a: T, b: T) => boolean; 

export class UndirectedGraph<V, E> {
    constructor(
        private isLessThan: IsLessThan<V>,
        public readonly vertices = Immutable.Set<V>(),
        private edges = new MultiMap<V, Edge<E, V>>(),
        private neighbours = new MultiMap<V, V>()) {}

    static empty<V, E>(isLessThan: IsLessThan<V>): UndirectedGraph<V, E> {
        return new UndirectedGraph<V, E>(isLessThan);
    }

    toString() {
        return "UNDIRECTED GRAPH:\n" + 
            this.vertices.map(v => `VERTEX: ${v!.toString()}`).join('\n') + '\n' +
            this.edges.map.valueSeq().flatMap(set => set).toSet().map((e: Edge<E, V>) =>
                `EDGE: ${e.from.toString()} <-> ${e.to.toString()} (${e.value ? e.value.toString() : ''})`).join('\n') + '\n';
    }
    normalizeEdge(e: Edge<E, V>): Edge<E, V> {
        return normalizeUndirectedEdge(e, this.isLessThan);
    }
    hasEdge(from: V, to: V): boolean {
        return this.getNeighbours(from).contains(to);
    }
    getEdges(vertex: V): Immutable.Set<Edge<E, V>> {
        return this.edges.get(vertex) || Immutable.Set<V>();
    }
    getNeighbours(vertex: V): Immutable.Set<V> {
        return this.neighbours.get(vertex) || Immutable.Set<V>();
    }
    add({vertices = [], edges = []}: {vertices?: V[], edges?: Edge<E, V>[]}): UndirectedGraph<V, E> {
        let newVertices = this.vertices.union(vertices);
        let newEdges = this.edges;
        let newNeighbours = this.neighbours;

        for (let edge of edges) {
            edge = this.normalizeEdge(edge);
            newNeighbours = newNeighbours.add(edge.from, edge.to);
            newEdges = newEdges.add(edge.to, edge).add(edge.from, flipEdge(edge));
        }
        return new UndirectedGraph<V, E>(this.isLessThan, newVertices, newEdges, newNeighbours);
    }
    remove({vertices = [], edges = []}: {vertices?: V[], edges?: Edge<E, V>[]}): UndirectedGraph<V, E> {
        let newVertices = this.vertices.union(vertices);
        let newEdges = this.edges;
        let newNeighbours = this.neighbours;

        for (let edge of edges) {
            edge = this.normalizeEdge(edge);
            newNeighbours = newNeighbours.remove(edge.from, edge.to);
            newEdges = newEdges.remove(edge.to, edge).remove(edge.from, flipEdge(edge));
        }
        return new UndirectedGraph<V, E>(this.isLessThan, newVertices, newEdges, newNeighbours);
    }
}

function normalizeUndirectedEdge<E, V>(e: Edge<E, V>, isLessThan: IsLessThan<V>) {
    return isLessThan(e.from, e.to) ? e : flipEdge(e)
}

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
            newOrigins = newDestinations.add(edge.to, edge.from);
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
