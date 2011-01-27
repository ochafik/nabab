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

import java.util.ArrayList;
import java.util.List;

import com.ochafik.math.graph.Graph;
import com.ochafik.math.graph.IntEdgeSet;
import com.ochafik.math.graph.NodeSet;
import com.ochafik.math.graph.Path;
import com.ochafik.math.graph.ValuedEdgeSet;

public class DefaultPath<N extends Comparable<N>> implements Path<N> {
	List<Integer> nodeIndexList;
	Graph<N> graph;

	public DefaultPath(List<Integer> nodeIndexList, Graph<N> graph) {
		this.nodeIndexList = nodeIndexList;
		this.graph = graph;
	}
	public DefaultPath(int[] nodeIndices, Graph<N> graph) {
		this.nodeIndexList = new ArrayList<Integer>(nodeIndices.length);
		this.graph = graph;
		
		for (int nodeIndex : nodeIndices) {
			nodeIndexList.add(nodeIndex);
		}
	}
	protected List<N> getNodeList() {
		List<N> nodeList = new ArrayList<N>();
		for (int nodeIndex : nodeIndexList) {
			nodeList.add(graph.getNodeList().get(nodeIndex));
		}
		return nodeList;
	}
	public List<Integer> getNodeIndexList() {
		return nodeIndexList;//Collections.unmodifiableList(nodeIndexList);
	}
	public void append(int nodeIndex) {
		nodeIndexList.add(nodeIndex);
	}
	public void prepend(int nodeIndex) {
		nodeIndexList.add(0, nodeIndex);
	}
	public Graph<N> getGraph() {
		return graph;
	}
	public String toString() {
		return getNodeList().toString();
	}
	
	public boolean isMinimal() {
		IntEdgeSet pathsLengths = graph.getPathsLengths();
		List<Integer> indices = getNodeIndexList();
		int nNodes = indices.size();
		
		boolean isCycle = indices.get(0).equals(indices.get(nNodes-1));
		
		for (int iNode = 0; iNode < nNodes; iNode++) {
			for (int iOtherNode = iNode+2; iOtherNode < nNodes; iOtherNode++) {
				int lenSubPathInPath = 1+iOtherNode - iNode;
				if (isCycle) {
					int complem = 1+ nNodes - lenSubPathInPath;
					if (complem < lenSubPathInPath) lenSubPathInPath = complem;
				}
				
				boolean testNew = pathsLengths.get(
						indices.get(iNode % nNodes), 
						indices.get(iOtherNode % nNodes)
					) + 1 < lenSubPathInPath;
				//boolean testOld = graph.computeShortestPathLength(indices.get(iNode % nNodes), indices.get(iOtherNode % nNodes), 2) < lenSubPathInPath;
				
				//if (testNew != testOld) {
					//throw new RuntimeException("Regression in DefaultPath.isMinimal()");
				//}
				//if (pathsLengths.get(indices.get(iNode % nNodes), indices.get(iOtherNode % nNodes)) + 1 < lenSubPathInPath) {
				if (testNew) { 
					return false;
				}
			}
		}
		return true;
	}
	/*
	public NodeSet<N> toNodeSet() {
		NodeSet<N> ret = new DefaultNodeSet<N>(graph);
		for (int node : getNodeIndexList()) {
			ret.addNode(node);
		}
		return ret;
	}*/
}
