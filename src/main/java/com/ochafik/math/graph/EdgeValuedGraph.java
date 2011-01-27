package com.ochafik.math.graph;

import java.util.Set;


public interface EdgeValuedGraph<N extends Comparable<N>, E> extends Graph<N> {

	public boolean addEdge(int originIndex, int destinationIndex, E edgeValue);
	public E getEdge(int source, int destination);
	public Set<Edge<E>> getEdges(Set<Edge<E>> out);
	
	public ValuedEdgeSet<E> getLocalConnectivity();
		
	public static class Edge<E> implements Comparable<Edge<E>> {
		int originIndex, destinationIndex;
		E edgeValue;
		public Edge(int originIndex, int destinationIndex, E edgeValue) {
			this.originIndex = originIndex;
			this.destinationIndex = destinationIndex;
			this.edgeValue = edgeValue;
		}

		public E getEdgeValue() {
			return edgeValue;
		}		
		public int getDestinationIndex() {
			return destinationIndex;
		}

		public int getOriginIndex() {
			return originIndex;
		}
		
		public int compareTo(Edge<E> o) {
			int d = getOriginIndex() - o.getOriginIndex();
			if (d == 0) {
				d = getDestinationIndex() - o.getDestinationIndex();
			}
			return d < 0 ? -1 : d > 0 ? 1 : 0;
		}
		public String toString() {
			return originIndex+" -> "+destinationIndex+" ("+edgeValue+")";
		}
	}
}
