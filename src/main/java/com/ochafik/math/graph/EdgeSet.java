package com.ochafik.math.graph;

import com.ochafik.util.SortedIntArray;
import com.ochafik.util.IntPairSet.IntPairOutput;

public interface EdgeSet {
	
	public boolean isOriented();
	public boolean isConnex();
	
	/**
	 * Number of edges in this set
	 * @return edge count
	 */
	public int size();
	public boolean contains(int start, int end);
	public void remove(int start, int end);
	
	public void export(IntPairOutput out);
	
	public SortedIntArray getEnds(int start);
	public SortedIntArray getStarts(int end);
	public SortedIntArray getNeighbours(int index);
	
	public EdgeSet clone();

}
