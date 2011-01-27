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

package com.ochafik.math.graph.impl;

import java.io.PrintWriter;
import java.io.StringWriter;
import java.util.Collection;
import java.util.List;

import com.ochafik.math.graph.BinaryEdgeSet;
import com.ochafik.math.graph.EdgeSet;
import com.ochafik.math.graph.Graph;
import com.ochafik.util.IntPairSet;


public class DefaultGraph<N extends Comparable<N>> extends AbstractGraph<N> {
	protected BinaryEdgeSet localConnectivity;
	protected boolean frozen;
	
	public BinaryEdgeSet getLocalConnectivity() {
		return localConnectivity;
	}
	
	public DefaultGraph(Graph<N> graph) {
		this(graph, graph.isOriented());
	}
	
	public DefaultGraph(Graph<N> graph, boolean oriented) {
		this(graph.getNodeList(), oriented);
		
		graph.getLocalConnectivity().export(new IntPairSet.IntPairOutput() {
			public void output(int x, int y) {
				addEdge(x, y);
			}
		});
	}
	/**
	 * Create a subgraph of a model graph with the nodes specified.
	 * @param graph model of which a subgraph will be copied
	 * @param nodeList list of nodes of the new graph
	 * @param oriented
	 */
	public DefaultGraph(Graph<N> graph, List<N> nodeList, boolean oriented) {
		this(nodeList, oriented);
		List<N> modelNodeList = graph.getNodeList();
		EdgeSet localCon = graph.getLocalConnectivity();
		for (int originIndexInNew = nodeList.size(); originIndexInNew-- != 0;) {
			int originIndexInModel = modelNodeList.indexOf(nodeList.get(originIndexInNew));
			if (originIndexInModel < 0)
				continue; // new node
			for (int destinationIndexInModel : localCon.getEnds(originIndexInModel).toArray()) {
				int destinationIndexInNew = nodeList.indexOf(modelNodeList.get(destinationIndexInModel));
				if (destinationIndexInNew >= 0) {
					// if this node is still present in the new graph, add an edge to it
					addEdge(originIndexInNew,destinationIndexInNew);
				}
			}
		}
	}
	public DefaultGraph(Collection<? extends N> nodes, boolean oriented) {
		super(nodes, oriented);
		//this.localConnectivity = new DefaultBinaryEdgeSet(oriented);
		FastSparseBinaryEdgeSet bes = new FastSparseBinaryEdgeSet(oriented);
		bes.ensureCapacity(nodes.size());
		this.localConnectivity = bes;
	}
	public boolean addEdge(int originIndex, int destinationIndex) {
		if (frozen)
			throw new UnsupportedOperationException("Graph was frozen ! It is now immutable...");
		
		localConnectivity.set(originIndex, destinationIndex);
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
	public void freeze(OptimizationPreference optimizationPreference) {
		if (frozen)
			return;
		
		switch (optimizationPreference) {
		case SPACE:
			// do nothing : already optimized for space
			break;
		case SPEED:
			localConnectivity = new FastDenseBinaryEdgeSet(localConnectivity, getNodeList().size());
			break;
		}
		frozen = true;
	}
	public String toString() {
		StringWriter sout = new StringWriter();
		final PrintWriter pout = new PrintWriter(sout);
		
		final String link = isOriented() ? " -> " : " <-> ";
		pout.println("DefaultGraph(" + localConnectivity.size() + " edges) {");
		localConnectivity.export(new IntPairSet.IntPairOutput() {
			public void output(int x, int y) {
				
				pout.println("\t" + getNodeList().get(x) + link + getNodeList().get(y));
			}
		});
		pout.println("}");
		return sout.toString();
	}
	
}
