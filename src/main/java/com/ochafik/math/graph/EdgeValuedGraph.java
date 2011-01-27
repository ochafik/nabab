/*
 * Copyright (C) 2006-2011 by Olivier Chafik (http://ochafik.com)
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

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
