import * as Immutable from 'immutable';
import {MultiMap} from '../collections/multimap';
import {Edge, flipEdge} from './edge';;

export type IsLessThan<T> = (a: T, b: T) => boolean; 

export class UndirectedGraph<V, E> {
    constructor(
        private isLessThan: IsLessThan<V>,
        public readonly vertices = Immutable.Set<V>(),
        private edgesByVertex = new MultiMap<V, Edge<E, V>>(),
        private neighbours = new MultiMap<V, V>()) {}

    static empty<V, E>(isLessThan: IsLessThan<V>): UndirectedGraph<V, E> {
        return new UndirectedGraph<V, E>(isLessThan);
    }

    getAllEdges(): Edge<E, V>[] {
        return [...this.edgesByVertex.getAllValues()];
    }

    toString() {
        return "UNDIRECTED GRAPH:\n" + 
            this.vertices.map(v => `VERTEX: ${v!.toString()}`).join('\n') + '\n' +
            this.edgesByVertex.map.valueSeq().flatMap(set => set).toSet().map((e: Edge<E, V>) =>
                `EDGE: ${e.from.toString()} <-> ${e.to.toString()} (${e.value ? e.value.toString() : ''})`).join('\n') + '\n';
    }
    normalizeEdge(e: Edge<E, V>): Edge<E, V> {
        return normalizeUndirectedEdge(e, this.isLessThan);
    }
    hasEdge(from: V, to: V): boolean {
        return this.getNeighbours(from).contains(to);
    }
    getEdges(vertex: V): Immutable.Set<Edge<E, V>> {
        return this.edgesByVertex.get(vertex) || Immutable.Set<V>();
    }
    getNeighbours(vertex: V): Immutable.Set<V> {
        return this.neighbours.get(vertex) || Immutable.Set<V>();
    }
    empty(): UndirectedGraph<V, E> {
        return UndirectedGraph.empty<V, E>(this.isLessThan);
    }
    add({vertices = [], edges = []}: {vertices?: V[], edges?: Edge<E, V>[]}): UndirectedGraph<V, E> {
        let newVertices = this.vertices.union(vertices);
        let newEdges = this.edgesByVertex;
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
        let newEdges = this.edgesByVertex;
        let newNeighbours = this.neighbours;

        for (let edge of edges) {
            edge = this.normalizeEdge(edge);
            newNeighbours = newNeighbours.remove(edge.from, edge.to);
            newEdges = newEdges.remove(edge.to, edge).remove(edge.from, flipEdge(edge));
        }
        return new UndirectedGraph<V, E>(this.isLessThan, newVertices, newEdges, newNeighbours);
    }
}

export function normalizeUndirectedEdge<E, V>(e: Edge<E, V>, isLessThan: IsLessThan<V>) {
    return isLessThan(e.from, e.to) ? e : flipEdge(e)
}
