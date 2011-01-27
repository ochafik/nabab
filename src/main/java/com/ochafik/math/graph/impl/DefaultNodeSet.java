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

import gnu.trove.TIntArrayList;

import java.util.ArrayList;
import java.util.BitSet;
import java.util.Collection;
import java.util.List;

import com.ochafik.math.graph.Graph;
import com.ochafik.math.graph.NodeSet;
import com.ochafik.util.IntArray;
import com.ochafik.util.IntArrayUtils;
import com.ochafik.util.SortedIntArray;
import com.ochafik.util.SortedIntList;

public class DefaultNodeSet<N extends Comparable<N>> implements NodeSet<N> {
	final Graph<N> graph;
	final SortedIntList nodeIndices; // fast iteration
	final BitSet nodeSet; // fast contains
	
	public DefaultNodeSet(Graph<N> graph) {
		this.graph = graph;
		nodeIndices = new SortedIntList();
		nodeSet = new BitSet();
	}
	public DefaultNodeSet(BitSet content, Graph<N> graph) {
		this.graph = graph;
		int nNodes = graph.getVertexCount(), setSize = 0;
		for (int node = nNodes; node-- != 0;) {
			if (content.get(node)) setSize++;
		}
		nodeIndices = new SortedIntList(setSize);
		nodeSet = new BitSet();
		
		int node = -1;
		while ((node = content.nextSetBit(node + 1)) != -1) {
			nodeIndices.add(node);
			nodeSet.set(node);
		}
	}
	public DefaultNodeSet(boolean[] content, Graph<N> graph) {
		this.graph = graph;
		int nNodes = graph.getVertexCount(), setSize = 0;
		for (int node = nNodes; node-- != 0;) {
			if (content[node]) setSize++;
		}
		nodeIndices = new SortedIntList(setSize);
		nodeSet = new BitSet();
		
		for (int node = 0; node < nNodes; node++) {
			if (content[node]) {
				nodeIndices.add(node);
				nodeSet.set(node);
			}
		}
	}
	
	public DefaultNodeSet(Graph<N> graph, Collection<N> nodes) {
		this.graph = graph;
		nodeIndices = new SortedIntList(nodes.size());
		this.nodeSet = new BitSet();
		
		List<N> nodeList = graph.getNodeList();
		for (N node : nodes) {
			int iNode = nodeList.indexOf(node);
			nodeIndices.add(iNode);
			this.nodeSet.set(iNode);
		}
		//nodeIndices.sort();
	}
	public boolean containsNodes(NodeSet<N> list) {
		if (list instanceof DefaultNodeSet) {
			DefaultNodeSet<N> ns = (DefaultNodeSet<N>)list;
			
			SortedIntList candidates = ns.nodeIndices;
			for (int iCandidate = candidates.size(); iCandidate-- != 0;) {
				if (!nodeSet.get(candidates.get(iCandidate))) {
					return false;
				}
			}
		} else {
			IntArray ids = list.getNodeIndices();
			for (int iIds = ids.size(); iIds-- != 0;) {
				if (!containsNode(ids.get(iIds))) return false;
			}
		}
		return true;
	}
	public boolean addNode(N node) {
		return addNode(graph.getNodeList().indexOf(node));
	}
	public boolean addNode(int i) {
		if (nodeSet.get(i)) return false;
		nodeIndices.add(i);
		nodeSet.set(i);
		return true;
	}
	public Graph<N> getGraph() {
		return graph;
	}
	public SortedIntArray getNodeIndices() {
		return nodeIndices;
	}
	public Collection<N> getNodes() {
		IntArray nodeIndices = getNodeIndices();
		Collection<N> nodes = new ArrayList<N>(nodeIndices.size());
		List<N> nodeList = getGraph().getNodeList();
		for (int i = nodeIndices.size(); i-- != 0;) {
			int nodeIndex = nodeIndices.get(i);
			nodes.add(nodeList.get(nodeIndex));
		}
		return nodes;
	}
	public String toString() {
		return getNodes().toString();
	}
	public boolean containsNode(int iNode) {
		return nodeSet.get(iNode);
	}
	@SuppressWarnings("unchecked")
	public boolean equals(Object o) {
		if (o == null || !(o instanceof NodeSet)) return false;
		return compareTo((NodeSet<N>)o) == 0;
	}
	
	int hashCode = -1;
	@Override
	public int hashCode() {
		if (hashCode == -1) {
			int hashCode = 0;
			for (int i = nodeIndices.size(); i-- != 0;) {
				hashCode = (hashCode << 5) ^ nodeIndices.get(i);
			}
			this.hashCode = hashCode == -1 ? -2 : hashCode;
		}
		return hashCode;
	}
	public int compareTo(NodeSet<N> o) {
		if (this == o) 
			return 0;
		
  		int d = hashCode() - o.hashCode();
		if (d != 0) 
			return d < 0 ? -1 : 1;

		return IntArrayUtils.compare(getNodeIndices(), o.getNodeIndices());
	}
	public boolean addNodes(NodeSet<N> nodeList) {
		boolean modified = false;
		IntArray nodeIndices = nodeList.getNodeIndices();
		for (int i = nodeIndices.size(); i-- != 0;) {
			int nodeIndex = nodeIndices.get(i);
			modified = addNode(nodeIndex) || modified;
		}
		return modified;
	}
}
