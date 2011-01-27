/*
 * Copyright (C) 2011 by Olivier Chafik (http://ochafik.com)
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

package com.ochafik.math.graph.impl;

import java.io.PrintWriter;
import java.io.StringWriter;
import java.util.Collection;
import java.util.Set;
import java.util.TreeSet;

import com.ochafik.math.graph.EdgeValuedGraph;
import com.ochafik.math.graph.ValuedEdgeSet;
import com.ochafik.math.graph.Graph.OptimizationPreference;
import com.ochafik.util.DefaultIntPairObjectMap;


public class DefaultEdgeValuedGraph <N extends Comparable<N>, E> extends AbstractGraph<N> implements EdgeValuedGraph<N, E> {
	//private final DefaultValuedEdgeSet<E> localConnectivity;
	private ValuedEdgeSet<E> localConnectivity;
	private boolean frozen;
	
	public ValuedEdgeSet<E> getLocalConnectivity() {
		return localConnectivity;
	}
	public void freeze(OptimizationPreference optimizationPreference) {
		if (optimizationPreference ==  OptimizationPreference.SPEED) {
			localConnectivity = new FastDenseValuedEdgeSet<E>(localConnectivity, getNodeList().size());
		}
		frozen = true;
	}
	public DefaultEdgeValuedGraph(Collection<? extends N> nodes, boolean oriented) {
		super(nodes, oriented);
		
		//localConnectivity = new DefaultValuedEdgeSet<E>(oriented);
		FastSparseValuedEdgeSet ves = new FastSparseValuedEdgeSet<E>(oriented);
		ves.ensureNodeCapacity(nodes.size());
		localConnectivity = ves;
	}
	public DefaultEdgeValuedGraph(EdgeValuedGraph<? extends N, E> graph, boolean oriented) {
		this(graph.getNodeList(), oriented);
		
		graph.getLocalConnectivity().export(new DefaultIntPairObjectMap.IntPairObjectOutput<E>() {
			public void output(int x, int y, E value) {
				addEdge(x, y, value);
			}
		});
	}
	
	public boolean addEdge(int originIndex, int destinationIndex, E edgeValue) {
		if (frozen)
			throw new UnsupportedOperationException("Graph was frozen ! It is now immutable...");
		
		localConnectivity.set(originIndex, destinationIndex, edgeValue);
		doAddEdge(originIndex, destinationIndex);
		return true;
	}
	public boolean removeEdge(int originIndex, int destinationIndex) {
		if (frozen)
			throw new UnsupportedOperationException("Graph was frozen ! It is now immutable...");
		
		localConnectivity.remove(originIndex, destinationIndex);
		doRemoveEdge(originIndex, destinationIndex);
		return true;
	}
	public E getEdge(int sourceIndex, int destinationIndex) {
		return localConnectivity.get(destinationIndex,sourceIndex);
	}
	public Set<Edge<E>> getEdges(Set<Edge<E>> out) {
		if (out == null) out = new TreeSet<Edge<E>>();
		final Set<Edge<E>> ret = out;
		localConnectivity.export(new DefaultIntPairObjectMap.IntPairObjectOutput<E>() {
			public void output(int x, int y, E value) {
				ret.add(new Edge<E>(x, y, value));
			}
		});
		return ret;
	}
	
	public String toString() {
		StringWriter sout = new StringWriter();
		final PrintWriter pout = new PrintWriter(sout);
		
		final String link = isOriented() ? " -> " : " <-> ";
		pout.println("DefaultValuedEdgeGraph(" + localConnectivity.size() + " edges) {");
		localConnectivity.export(new DefaultIntPairObjectMap.IntPairObjectOutput<E>() {
			public void output(int x, int y, E value) {
				
				pout.println("\t" + getNodeList().get(x) + link + getNodeList().get(y) + " : " + value);
			}
		});
		pout.println("}");
		return sout.toString();
	}
}
