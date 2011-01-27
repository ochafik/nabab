package com.ochafik.math.graph;

public interface IntEdgeSet extends EdgeSet {
	public interface IntPairIntOutput {
		public void output(int x, int y, int value);
	}
	
	public void export(IntPairIntOutput out);
	
	public int get(int x, int y);
	
	/**
	 * @param out non-null array of size 1
	 * @return whether a value was present for edge (x, y) or not. If false, out was not modified.
	 */
	public boolean get(int x, int y, int[] out);
	public void set(int x, int y, int value);

}
