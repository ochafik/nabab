package com.ochafik.math.graph.impl;

import com.ochafik.math.graph.EdgeSet;
import com.ochafik.math.graph.ValuedEdgeSet;
import com.ochafik.util.SortedIntArray;
import com.ochafik.util.IntPairObjectMap.IntPairObjectOutput;
import com.ochafik.util.IntPairSet.IntPairOutput;

public class FastDenseValuedEdgeSet<T> implements ValuedEdgeSet<T> {
	protected final Object[][] values;
	protected final FastSparseValuedEdgeSet<T> edgeSetForNeighbours;
	protected final boolean oriented;
	
	public FastDenseValuedEdgeSet(boolean oriented, int n) {
		values = new Object[n][n];
		edgeSetForNeighbours = new FastSparseValuedEdgeSet<T>(this.oriented = oriented);
	}
	public FastDenseValuedEdgeSet(ValuedEdgeSet<T> model, int nodeCount) {
		this(model.isOriented(), nodeCount);
		edgeSetForNeighbours.ensureEdgeCapacity(model.size());
		model.export(new IntPairObjectOutput<T>() {
			public void output(int x, int y, T value) {
				set(x, y, value);
			}
		});
	}

	@SuppressWarnings("unchecked")
	public void export(IntPairObjectOutput<T> out) {
		edgeSetForNeighbours.export(out);
	}
	
	public EdgeSet clone() {
		return edgeSetForNeighbours.clone();
	}

	@SuppressWarnings("unchecked")
	public T get(int x, int y) {
		return (T)values[x][y];
	}

	public void set(int x, int y, T value) {
		values[x][y] = value;
		if (!oriented)
			values[y][x] = value;
		edgeSetForNeighbours.set(x, y, value);
	}

	public void remove(int x, int y) {
		values[x][y] = null;
		if (!oriented)
			values[y][x] = null;
		edgeSetForNeighbours.remove(x, y);
	}

	public boolean contains(int x, int y) {
		return values[x][y] != null;
	}

	public void export(IntPairOutput out) {
		edgeSetForNeighbours.export(out);
	}

	public SortedIntArray getEnds(int start) {
		return edgeSetForNeighbours.getEnds(start);
	}

	public SortedIntArray getNeighbours(int index) {
		return edgeSetForNeighbours.getNeighbours(index);
	}

	public SortedIntArray getStarts(int end) {
		return edgeSetForNeighbours.getStarts(end);
	}

	public boolean isConnex() {
		return edgeSetForNeighbours.isConnex();
	}

	public boolean isOriented() {
		return edgeSetForNeighbours.isOriented();
	}

	public int size() {
		return edgeSetForNeighbours.size();
	}
	
}
