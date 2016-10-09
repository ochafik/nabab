import {MultiMap} from './multimap';
import {Edge, flipEdge} from './edge';
import Immutable = require('immutable');

export class UndirectedGraph<V, E> {
    constructor(
        public readonly vertices = Immutable.Set<V>(),
        private edges = new MultiMap<V, Edge<E, V>>(),
        private neighbours = new MultiMap<V, V>()) {}

    toString() {
        return "UNDIRECTED GRAPH:\n" + 
            this.vertices.map(v => `VERTEX: ${v!.toString()}`).join('\n') + '\n' +
            // this.destinations + '\n' +
            // this.origins + '\n' +
            this.edges.map.valueSeq().flatMap(set => set).toSeq().map((e: Edge<E, V>) =>
                `EDGE: ${e!.value} = ${e!.from.toString()} -> ${e!.to.toString()}`).join('\n') + '\n';
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

        for (const edge of edges) {
            newNeighbours = newNeighbours.add(edge.from, edge.to);
            newEdges = newEdges.add(edge.to, edge).add(edge.from, flipEdge(edge));
        }
        return new UndirectedGraph<V, E>(newVertices, newEdges, newNeighbours);
    }
    remove({vertices = [], edges = []}: {vertices?: V[], edges?: Edge<E, V>[]}): UndirectedGraph<V, E> {
        let newVertices = this.vertices.union(vertices);
        let newEdges = this.edges;
        let newNeighbours = this.neighbours;

        for (const edge of edges) {
            newNeighbours = newNeighbours.remove(edge.from, edge.to);
            newEdges = newEdges.remove(edge.to, edge).remove(edge.from, flipEdge(edge));
        }
        return new UndirectedGraph<V, E>(newVertices, newEdges, newNeighbours);
    }
}

export class DirectedGraph<V, E> {
    constructor(
        public readonly vertices = Immutable.Set<V>(),
        private outgoingEdges = new MultiMap<V, Edge<E, V>>(),
        private destinations = new MultiMap<V, V>(),
        private incomingEdges = new MultiMap<V, Edge<E, V>>(),
        private origins = new MultiMap<V, V>()) {}

    toUndirected(): UndirectedGraph<V, E> {
        return new UndirectedGraph<V, E>(
            this.vertices,
            this.outgoingEdges.merge(this.incomingEdges),
            this.destinations.merge(this.origins));

    }
    toString() {
        return "DIRECTED GRAPH:\n" + 
            this.vertices.map(v => `VERTEX: ${v!.toString()}`).join('\n') + '\n' +
            // this.destinations + '\n' +
            // this.origins + '\n' +
            this.edges.map(e => `EDGE: ${e!.value} = ${e!.from.toString()} -> ${e!.to.toString()}`).join('\n') + '\n';
    }
    get edges(): Immutable.Set<Edge<E, V>> {
        return this.outgoingEdges.merge(this.incomingEdges).map.valueSeq().flatMap((s: Immutable.Set<Edge<E, V>>) => s).toSet();
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
