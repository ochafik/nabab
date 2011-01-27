package com.ochafik.math.graph;

import com.ochafik.util.IntArray;


public interface BinaryEdgeSet extends EdgeSet {
	public void set(int x, int y);
	
	/**
	 * Connects each x from xs to each y from ys
	 * @param xs
	 * @param ys
	 */
	public void set(IntArray xs, IntArray ys);

}
