package com.ochafik.math.graph;

import com.ochafik.util.IntPairObjectMap.IntPairObjectOutput;

public interface ValuedEdgeSet<V> extends EdgeSet {
	public void export(IntPairObjectOutput<V> out);
	
	public V get(int x, int y);
	//public int getInteger(int x, int y);
	
	public void set(int x, int y, V value);
	//public void setInteger(int x, int y, int value);
	
}
