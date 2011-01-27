package com.ochafik.math.graph;

import java.util.List;



public interface Path<N extends Comparable<N>> {
	public List<Integer> getNodeIndexList();
	public Graph<N> getGraph();
	public void prepend(int nodeIndex);
	public void append(int nodeIndex);
	public boolean isMinimal();
	
	//public NodeSet<N> toNodeSet();
}
