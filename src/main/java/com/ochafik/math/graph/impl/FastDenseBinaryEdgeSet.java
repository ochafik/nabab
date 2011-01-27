/*
 * Copyright (C) 2011 by Olivier Chafik (http://ochafik.com)
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

import java.util.BitSet;

import com.ochafik.math.graph.BinaryEdgeSet;
import com.ochafik.math.graph.EdgeSet;
import com.ochafik.util.IntArray;
import com.ochafik.util.SortedIntArray;
import com.ochafik.util.SortedIntList;
import com.ochafik.util.IntPairObjectMap.IntPairObjectOutput;
import com.ochafik.util.IntPairSet.IntPairOutput;

public class FastDenseBinaryEdgeSet implements BinaryEdgeSet {
	//protected final BitSet[] values;
	protected final boolean[][] values;
	protected final FastSparseBinaryEdgeSet edgeSetForNeighbours;
	protected final boolean oriented;
	
	public FastDenseBinaryEdgeSet(boolean oriented, int n) {
		//values = new BitSet[n];
		values = new boolean[n][];
		for (int i = n; i-- != 0;) {
			//values[i] = new BitSet(n);
			values[i] = new boolean[n];
		}
		edgeSetForNeighbours = new FastSparseBinaryEdgeSet(this.oriented = oriented);
	}
	
	public FastDenseBinaryEdgeSet(BinaryEdgeSet model, int nodeCount) {
		this(model.isOriented(), nodeCount);
		edgeSetForNeighbours.ensureCapacity(model.size());
		model.export(new IntPairOutput() {
			public void output(int x, int y) {
				set(x, y);
			}
		});
	}

	public EdgeSet clone() {
		return edgeSetForNeighbours.clone();
	}

	public void set(int x, int y) {
		//values[x].set(y);
		values[x][y] = true;
		if (!oriented)
			//values[y].set(x);
			values[y][x] = true;
		
		edgeSetForNeighbours.set(x, y);
	}

	public void remove(int x, int y) {
		//values[x].clear(y);
		values[x][y] = false;
		if (!oriented)
			//values[y].clear(x);
			values[y][x] = false;
		
		edgeSetForNeighbours.remove(x, y);
	}

	public boolean contains(int x, int y) {
		//return values[x].get(y);
		return values[x][y];
	}
	
	public void set(IntArray starts, IntArray ends) {
		for (int iStart = starts.size(); iStart-- != 0;) {
			int start = starts.get(iStart);
			//BitSet col = values[start];
			boolean[] col = values[start];
			for (int iEnd = ends.size(); iEnd-- != 0;) {
				int end = ends.get(iEnd);
				//col.set(end);
				col[end] = true;
			}
		}
		if (!oriented) {
			for (int iEnd = ends.size(); iEnd-- != 0;) {
				int end = ends.get(iEnd);
				//BitSet row = values[end];
				boolean[] row = values[end];
				for (int iStart = starts.size(); iStart-- != 0;) {
					int start = starts.get(iStart);
					//row.set(start);
					row[start] = true;
				}
			}
		}
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
