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

import com.ochafik.math.graph.ValuedEdgeSet;
import com.ochafik.util.DynamicArray;
import com.ochafik.util.IntArray;
import com.ochafik.util.IntArrayUtils;
import com.ochafik.util.SortedIntArray;
import com.ochafik.util.SortedIntArraysMerger;
import com.ochafik.util.SortedIntList;
import com.ochafik.util.SortedIntObjectMap;
import com.ochafik.util.IntPairObjectMap.IntPairObjectOutput;
import com.ochafik.util.IntPairSet.IntPairOutput;

public class FastSparseValuedEdgeSet<V> implements ValuedEdgeSet<V> {
	private final DynamicArray<SortedIntObjectMap<V>> rows;
	private final DynamicArray<SortedIntList> columns;
	private final boolean oriented;
	int size;
	
	public FastSparseValuedEdgeSet(boolean oriented) {
		this.oriented = oriented;
		columns = new DynamicArray<SortedIntList>(0);
		rows = new DynamicArray<SortedIntObjectMap<V>>(0);
	}
	
	public void ensureNodeCapacity(int nVertices) {
		columns.enlarge(nVertices);
		rows.enlarge(nVertices);
	}
	
	@Override
	public ValuedEdgeSet clone() {
		FastSparseValuedEdgeSet<V> clone = new FastSparseValuedEdgeSet<V>(oriented);
		clone.columns.setSize(columns.getSize());
		clone.rows.setSize(rows.getSize());
		clone.size = size;
		for (int iRow = 0, nRows = rows.getSize(); iRow < nRows; iRow++) {
			clone.rows.set(iRow, rows.get(iRow).clone());
		}
		for (int iCol = 0, nCol = columns.getSize(); iCol < nCol; iCol++) {
			clone.columns.set(iCol, columns.get(iCol).clone());
		}
		return null;
	}
	public boolean contains(int start, int end) {
		SortedIntObjectMap<V> map = getList(rows, start, false);
		return map != null && map.containsKey(end);
	}
	public void export(final IntPairObjectOutput<V> out) {
		if (oriented) {
			for (int iRow = rows.getSize(); iRow-- != 0;) {
				final int fiRow = iRow;
				SortedIntObjectMap<V> row = rows.get(iRow);
				if (row == null) continue;
				row.visit(new SortedIntObjectMap.IntObjectVisitor<V>() {
					public boolean visit(int iCol, V value) {
						out.output(fiRow, iCol, value);
						return true;
					}
				});
			}
		} else {
			for (int iRow = rows.getSize(); iRow-- != 0;) {
				final int fiRow = iRow;
				SortedIntObjectMap<V> row = rows.get(iRow);
				if (row == null) continue;
				row.visit(new SortedIntObjectMap.IntObjectVisitor<V>() {
					public boolean visit(int iCol, V value) {
						if (fiRow <= iCol)
							out.output(fiRow, iCol, value);
						return true;
					}
				});
			}
		}
	}
	public void export(final IntPairOutput out) {
		for (int iRow = rows.getSize(); iRow-- != 0;) {
			final int fiRow = iRow;
			SortedIntObjectMap<V> row = rows.get(iRow);
			if (row == null) continue;
			row.visit(new SortedIntObjectMap.IntObjectVisitor<V>() {
				public boolean visit(int iCol, V value) {
					out.output(fiRow, iCol);
					return true;
				}
			});
		}
	}
	public V get(int start, int end) {
		SortedIntObjectMap<V> map = getList(rows, start, false);
		return map == null ? null : map.get(end);
	}
	
	private final SortedIntObjectMap<V> getList(final DynamicArray<SortedIntObjectMap<V>> container, final int i, final boolean create) {
		if (i >= container.getSize()) {
			if (create) container.setSize(i + 1);
			else return null;
		}
		SortedIntObjectMap<V> element = container.get(i);
		if (element == null && create) {
			element = new SortedIntObjectMap<V>(1);
			container.set(i, element);
		}
		return element;
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
		SortedIntObjectMap<V> list = getList(rows, start, false);
		if (list == null) return IntArrayUtils.EMPTY_ARRAY;
		else return list.getKeys(); //IntArrayUtils.readOnlyWrap(list.getKeys());
	}

	public SortedIntArray getStarts(int end) {
		SortedIntList list = getList(columns, end, false);
		if (list == null) return IntArrayUtils.EMPTY_ARRAY;
		else return list; //IntArrayUtils.readOnlyWrap(list);
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
		SortedIntObjectMap<V> list = getList(rows, start, false);
		if (list != null) {
			if (list.remove(end)) {
				getList(columns, end, true).removeValue(start);
				size--;
			} else {
				return;
			}
		}
		if (!oriented) {
			list = getList(rows, end, false);
			if (list != null) {
				if (list.remove(start)) {
					getList(columns, start, true).removeValue(end);
				}
			}
			
		}
	}
	
	public void set(int start, int end, V value) {
		boolean newAssoc = doSet(start, end, value, true);
		if (newAssoc) {
			size++;
		}
		if (!oriented) {
			doSet(end, start, value, newAssoc);
		}
	}
	/**
	 * @return true if there is a new element was added
	 */
	public boolean doSet(int start, int end, V value, boolean addToColumns) {
		SortedIntObjectMap<V> row = getList(rows, start, true);
		int size = row.size();
		row.put(end, value);
		if (addToColumns && row.size() != size) {
			SortedIntList column = getList(columns, end, true);
			column.add(start);
			return true;
		}
		return false;
	}

	public void ensureEdgeCapacity(int size2) {
		
	}

}
