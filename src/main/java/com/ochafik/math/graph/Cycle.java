package com.ochafik.math.graph;

import com.ochafik.util.listenable.Pair;

public interface Cycle<N extends Comparable<N>> extends Path<N>, Comparable<Cycle<N>> {
	public Pair<Cycle<N>, Cycle<N>> splitByEdge(int edgeSource, int edgeDestination);
	public int getCompareInt();
}
