/*
 * Copyright (C) 2006-2011 by Olivier Chafik (http://ochafik.com)
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

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
