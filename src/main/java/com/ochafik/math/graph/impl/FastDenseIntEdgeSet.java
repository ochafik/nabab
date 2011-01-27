package com.ochafik.math.graph.impl;

import java.util.NoSuchElementException;

import com.ochafik.math.graph.EdgeSet;
import com.ochafik.math.graph.IntEdgeSet;
import com.ochafik.math.graph.ValuedEdgeSet;
import com.ochafik.util.SortedIntArray;
import com.ochafik.util.IntPairObjectMap.IntPairObjectOutput;
import com.ochafik.util.IntPairSet.IntPairOutput;

public class FastDenseIntEdgeSet implements IntEdgeSet {
	protected final int[][] values;
	protected final FastDenseBinaryEdgeSet denseBinarySet;
	protected final boolean oriented;
	
	public FastDenseIntEdgeSet(boolean oriented, int n) {
		values = new int[n][n];
		denseBinarySet = new FastDenseBinaryEdgeSet(this.oriented = oriented, n);
	}
	public FastDenseIntEdgeSet(IntEdgeSet model, int nodeCount) {
		this(model.isOriented(), nodeCount);
		//denseBinarySet.ensureEdgeCapacity(model.size());
		model.export(new IntEdgeSet.IntPairIntOutput() {
			public void output(int x, int y, int value) {
				set(x, y, value);
			}
		});
	}

	public EdgeSet clone() {
		throw new UnsupportedOperationException();
	}

	public int get(int x, int y) {
		if (!denseBinarySet.contains(x, y)) 
			throw new NoSuchElementException("No edge between "+x + " and "+y);
		
		return values[x][y];
	}

	public boolean get(int x, int y, int[] out) {
		if (!denseBinarySet.contains(x, y))
			return false;
		
		out[0] = values[x][y];
		return true;
	}

	public void set(int x, int y, int value) {
		values[x][y] = value;
		if (!oriented)
			values[y][x] = value;
		denseBinarySet.set(x, y);
	}

	public void remove(int x, int y) {
		values[x][y] = 0;
		if (!oriented)
			values[y][x] = 0;
		denseBinarySet.remove(x, y);
	}

	public boolean contains(int x, int y) {
		return denseBinarySet.contains(x, y);
	}

	public void export(IntPairOutput out) {
		denseBinarySet.export(out);
	}

	public SortedIntArray getEnds(int start) {
		return denseBinarySet.getEnds(start);
	}

	public SortedIntArray getNeighbours(int index) {
		return denseBinarySet.getNeighbours(index);
	}

	public SortedIntArray getStarts(int end) {
		return denseBinarySet.getStarts(end);
	}

	public boolean isConnex() {
		return denseBinarySet.isConnex();
	}

	public boolean isOriented() {
		return denseBinarySet.isOriented();
	}

	public int size() {
		return denseBinarySet.size();
	}
	public void export(final IntPairIntOutput out) {
		denseBinarySet.export(new IntPairOutput() {
			public void output(int x, int y) {
				out.output(x, y, values[x][y]);
			}
		});
	}
	
}
