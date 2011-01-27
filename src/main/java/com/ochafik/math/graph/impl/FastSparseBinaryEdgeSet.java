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

import java.io.PrintWriter;
import java.io.StringWriter;

import com.ochafik.math.graph.BinaryEdgeSet;
import com.ochafik.math.graph.ValuedEdgeSet;
import com.ochafik.util.DynamicArray;
import com.ochafik.util.IntArray;
import com.ochafik.util.IntArrayUtils;
import com.ochafik.util.IntPairSet;
import com.ochafik.util.SortedIntArray;
import com.ochafik.util.SortedIntArraysMerger;
import com.ochafik.util.SortedIntList;
import com.ochafik.util.SortedIntObjectMap;
import com.ochafik.util.IntPairSet.IntPairOutput;


public class FastSparseBinaryEdgeSet implements BinaryEdgeSet {
	//private final SortedIntObjectMap<SortedIntList> rows, columns;
	private final DynamicArray<SortedIntList> rows, columns;
	private final boolean oriented;
	int size;
	
	public FastSparseBinaryEdgeSet(boolean oriented) {
		this.oriented = oriented;
		columns = new DynamicArray<SortedIntList>(0);
		rows = new DynamicArray<SortedIntList>(0);
	}
	
	public void ensureCapacity(int nVertices) {
		columns.enlarge(nVertices);
		rows.enlarge(nVertices);
	}
	
	public ValuedEdgeSet clone() {
		return null;
	}
		/*
	@Override
	public ValuedEdgeSet clone() {
		FastBinaryEdgeSet clone = new FastBinaryEdgeSet(oriented);
		clone.columns.ensureCapacity(columns.size());
		clone.rows.ensureCapacity(rows.size());
		clone.size = size;
		for (int iRow = 0, nRows = rows.size(); iRow < nRows; iRow++) {
			clone.rows.put(iRow, rows.get(iRow).clone());
		}
		for (int iCol = 0, nCol = columns.size(); iCol < nCol; iCol++) {
			clone.columns.put(iCol, columns.get(iCol).clone());
		}
		return null;
	}*/
	public boolean contains(int start, int end) {
		SortedIntList map = getList(rows, start, false);
		return map != null && map.contains(end);
	}
	
	private final SortedIntList getList(final DynamicArray<SortedIntList> container, final int i, final boolean create) {
		if (i >= container.getSize()) {
			if (create) container.setSize(i + 1);
			else return null;
		}
		SortedIntList element = container.get(i);
		if (element == null && create) {
			element = new SortedIntList(1);
			container.set(i, element);
		}
		return element;
	}
	
	public boolean isConnex() {
		int nVertices = rows.getSize(), nEdges = size();
		return nVertices == 1 || nEdges == (nVertices * nVertices);
	}
	
	public SortedIntArray getEnds(int start) {
		SortedIntList list;
		if (start >= rows.getSize() || (list = rows.get(start)) == null) {
			return IntArrayUtils.EMPTY_ARRAY;
		}
		return list;
	}

	public SortedIntArray getStarts(int end) {
		SortedIntList list;
		if (end >= columns.getSize() || (list = columns.get(end)) == null) {
			return IntArrayUtils.EMPTY_ARRAY;
		}
		return list;
	}
	
	public SortedIntArray getNeighbours(int index) {
		if (oriented) {
			return SortedIntArraysMerger.merge(new SortedIntArray[] {getEnds(index), getStarts(index)});
		} else {
			return getEnds(index);
		}
	}
	
	public boolean isOriented() {
		return oriented;
	}

	public int size() {
		return size;
	}
	public void remove(int start, int end) {
		SortedIntList list = getList(rows, start, false);
		if (list != null) {
			if (list.removeValue(end)) {
				getList(columns, end, true).removeValue(start);
				size--;
			} else {
				return;
			}
		}
		if (!oriented) {
			list = getList(rows, end, false);
			if (list != null) {
				if (list.removeValue(start)) {
					getList(columns, start, true).removeValue(end);
				}
			}
			
		}
	}
	
	public void set(int start, int end) {
		boolean newAssoc = doSet(start, end, true);
		if (newAssoc) {
			size++;
		}
		if (!oriented) {
			doSet(end, start, newAssoc);
		}
	}
	/**
	 * @return true if there is a new element was added
	 */
	public boolean doSet(int start, int end, boolean addToColumns) {
		SortedIntList row = getList(rows, start, true);
		int size = row.size();
		row.add(end);
		if (addToColumns && row.size() != size) {
			SortedIntList column = getList(columns, end, true);
			column.add(start);
			return true;
		}
		return false;
	}
	
	public void export(final IntPairOutput out) {
		if (oriented) {
			for (int i = rows.getSize(); i-- != 0;) {
				SortedIntList row = rows.get(i);
				final int iRow = i;
				if (row == null) continue;
				row.visit(new SortedIntList.IntVisitor() {
					public boolean visit(int iCol) {
						out.output(iRow, iCol);
						return true;
					}
				});
			}
		} else {
			for (int i = rows.getSize(); i-- != 0;) {
				SortedIntList row = rows.get(i);
				final int iRow = i;
				if (row == null) continue;
				row.visit(new SortedIntList.IntVisitor() {
					public boolean visit(int iCol) {
						if (iRow <= iCol)
							out.output(iRow, iCol);
						return true;
					}
				});
			}
		}
	}
	public void set(IntArray xs, IntArray ys) {
		doSet(xs, ys);
		if (!oriented) {
			doSet(ys, xs);
		}
	}
	protected void doSet(IntArray starts, IntArray ends) {
		for (int iStart = starts.size(); iStart-- != 0;) {
			int start = starts.get(iStart);
			SortedIntList list = getList(rows, start, true);
			for (int iEnd = ends.size(); iEnd-- != 0;) {
				int end = ends.get(iEnd);
				list.add(end);
			}
		}
		for (int iEnd = ends.size(); iEnd-- != 0;) {
			int end = ends.get(iEnd);
			SortedIntList list = getList(columns, end, true);
			for (int iStart = starts.size(); iStart-- != 0;) {
				int start = starts.get(iStart);
				list.add(start);
			}
		}
	}
	
	public String toString() {
		StringWriter sout = new StringWriter();
		final PrintWriter pout = new PrintWriter(sout);
		
		final String link = isOriented() ? " -> " : " <-> ";
		pout.println("FastBinaryEdgeSet(" + size() + " edges) {");
		export(new IntPairSet.IntPairOutput() {
			public void output(int x, int y) {
				
				pout.println("\t" + x + link + y);
			}
		});
		pout.println("}");
		return sout.toString();
	}
}
