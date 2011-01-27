package com.ochafik.math.graph.impl;

import java.util.ArrayList;
import java.util.BitSet;
import java.util.Collection;
import java.util.Collections;
import java.util.List;

import com.ochafik.math.graph.ConnectivityUtils;
import com.ochafik.math.graph.EdgeSet;
import com.ochafik.math.graph.Graph;
import com.ochafik.math.graph.IntEdgeSet;


public abstract class AbstractGraph<N extends Comparable<N>> implements Graph<N> {
	private final List<N> nodeList;
	private final boolean oriented;
	
	//protected ValuedEdgeSet<Integer> pathsLengths;
	protected IntEdgeSet pathsLengths;
	
	public AbstractGraph(Collection<? extends N> nodes, boolean oriented) {
		nodeList = new ArrayList<N>(nodes);
		this.oriented = oriented;
	}
	
	public IntEdgeSet getPathsLengths() {
		if (pathsLengths == null) {
				System.err.println("\tComputing path length global connectivity");
				pathsLengths = ConnectivityUtils.computePathLengthGlobalConnectivity(getLocalConnectivity(), getNodeList().size());
		}
		return pathsLengths;
	}
	public EdgeSet getGlobalConnectivity() {
		return getPathsLengths();
	}
	
	protected void doAddEdge(int originIndex, int destinationIndex) {
		if (pathsLengths != null) {
			ConnectivityUtils.updatePathLengthGlobalConnectivityWithNewEdge(getPathsLengths(), originIndex, destinationIndex);
		}
	}
	
	protected void doRemoveEdge(int originIndex, int destinationIndex) {
		pathsLengths = null;
	}

	public List<N> getNodeList() {
		return Collections.unmodifiableList(nodeList);
	}
	
	public boolean isOriented() {
		return oriented;
	}

	public int getEdgeCount() {
		return getLocalConnectivity().size();
	}

	public boolean hasEdge(int originIndex, int destinationIndex) {
		return getLocalConnectivity().contains(originIndex, destinationIndex);
	}
	public boolean hasPath(int originIndex, int destinationIndex) {
		return getGlobalConnectivity().contains(originIndex, destinationIndex);
	}
	
	public int getVertexCount() {
		return nodeList.size();
	}
	
	public boolean isConnex() {
		return getLocalConnectivity().isConnex();
	}

	public boolean isAcyclic() {
		int nodeCount = getVertexCount();
		for (int node = nodeCount; node-- != 0;) {
			if (hasPath(node, node)) return false;
		}
		return true;
	}
	public boolean isTree() {
		if (!(isAcyclic() && isOriented())) return false;
		return isConnex();
	}
	
	/**
	 * Search in breadth first
	 * @param originIndex
	 * @param destinationIndex
	 * @return length of shorted path between originIndex and destinationIndex (where a->b->c has length 3)
	 */
	public int computeShortestPathLength(int originIndex, int destinationIndex, int minimumLength) {
		int nNodes = getVertexCount();
		BitSet 
		        isForbiddenNode = new BitSet(nNodes), 
		        isNextNode = new BitSet(nNodes),
		        isNextNode2 = new BitSet(nNodes);
		
		isNextNode.set(originIndex);
		
		int currentLength = 1;
		int nNextNodes;
		do {
			nNextNodes = 0;

			currentLength++;
			for (int node = nNodes; node-- != 0;) {
				if (isNextNode.get(node)) {
					isNextNode.clear(node);
					isForbiddenNode.set(node);
					for (int nextNode : getLocalConnectivity().getEnds(node).toArray()) {
						if (nextNode == destinationIndex && currentLength >= minimumLength) {
							return currentLength;
						} else if (!isForbiddenNode.get(nextNode)) {
							isNextNode2.set(nextNode);
							nNextNodes++;
						}
					}
				}
			}
			// permute isNextNode and isNextNode2
			BitSet t = isNextNode;
			isNextNode = isNextNode2;
			isNextNode2 = t;
		} while (nNextNodes > 0);
		
		return -1;
	}
}
