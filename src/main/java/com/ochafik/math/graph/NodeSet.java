package com.ochafik.math.graph;

import java.util.Collection;

import com.ochafik.util.IntArray;

public interface NodeSet<N extends Comparable<N>> extends Comparable<NodeSet<N>> {
	public Graph<N> getGraph();
	public Collection<N> getNodes();
	//public int[] getNodeIndices();
	public IntArray getNodeIndices();
	
	public boolean containsNode(int iNode);
	public boolean containsNodes(NodeSet<N> list);

	public boolean addNodes(NodeSet<N> nodeList);
	public boolean addNode(N node);
	public boolean addNode(int i);
}
