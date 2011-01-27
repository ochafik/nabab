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
