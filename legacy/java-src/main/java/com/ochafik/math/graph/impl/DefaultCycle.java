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

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedList;
import java.util.List;
import java.util.Map;

import com.ochafik.math.graph.Cycle;
import com.ochafik.math.graph.Graph;
import com.ochafik.math.graph.Path;
import com.ochafik.util.listenable.Pair;


public class DefaultCycle<N extends Comparable<N>> extends DefaultPath<N> implements Cycle<N> {
	public DefaultCycle(Path<N> path) {
		this(path.getNodeIndexList(),path.getGraph());
	}
	public DefaultCycle(List<Integer> nodeIndexList, Graph<N> graph) {
		super(nodeIndexList, graph);
		
		int smallest = 0, iSmallest = -1;
		int size = nodeIndexList.size();
		
		if (!nodeIndexList.get(0).equals(nodeIndexList.get(size-1))) {
			throw new IllegalArgumentException("This path is not a cycle !");
		}
		
		for (int index = size; index-- != 0;) {
			int node = nodeIndexList.get(index);
			if (iSmallest < 0 || node < smallest) {
				smallest = node;
				iSmallest = index;
			}
		}
		if (iSmallest > 0) {
			List<Integer> newNodeIndexList = new ArrayList<Integer>(size);
			int sizeMinusOne = size - 1; // because of looping (last = first), we skip the last
			
			if (graph.isOriented()) {
				for (int i = iSmallest; i < sizeMinusOne; i++) {
					newNodeIndexList.add(nodeIndexList.get(i));
				}
				for (int i = 0; i<= iSmallest; i++) {
					newNodeIndexList.add(nodeIndexList.get(i));
				}
			} else {
				// provide unique ordering to unoriented cycles
				int after = nodeIndexList.get((iSmallest+1)%sizeMinusOne), before = nodeIndexList.get((iSmallest-1+sizeMinusOne)%sizeMinusOne);
				if (before < after) {
					for (int i = iSmallest; i >= 0; i--) {
						newNodeIndexList.add(nodeIndexList.get(i));
					}
					for (int i = sizeMinusOne - 1; i >= iSmallest; i--) {
						newNodeIndexList.add(nodeIndexList.get(i));
					}
				} else {
					for (int i = iSmallest; i < sizeMinusOne; i++) {
						newNodeIndexList.add(nodeIndexList.get(i));
					}
					for (int i = 0; i<= iSmallest; i++) {
						newNodeIndexList.add(nodeIndexList.get(i));
					}
				}
			}
			this.nodeIndexList = newNodeIndexList;
		}
		if (!this.nodeIndexList.get(0).equals(this.nodeIndexList.get(this.nodeIndexList.size() - 1))) {
			throw new RuntimeException("Bad constructor for DefaultCycle !");
		}
	}
	
	static Map<String, Integer> cachedCompareInts = new HashMap<String, Integer>();
	public static int getCachedCompareInt(String compareString) {
		Integer i = cachedCompareInts.get(compareString);
		if (i == null) {
			i = cachedCompareInts.size() + 1;
			cachedCompareInts.put(compareString, i);
		}
		return i;
	}
	
	int compareInt;
	public int getCompareInt() {
		if (compareInt == 0) {
			compareInt = getCachedCompareInt(computeCompareString());
		}
		return compareInt;
	}
	
	@Override
	public int hashCode() {
		return getCompareInt();
	}
	
	@Override
	public boolean equals(Object o) {
		return o != null && (o instanceof Cycle) && ((Cycle)o).getCompareInt() == getCompareInt();
	}
	
	public String computeCompareString() {
		List<Integer> list = getNodeIndexList();
		int n = list.size();
		char[] ch = new char[2 * n];
		for (int i = 0; i < n; i++) {
			int c = list.get(i) + 1;
			ch[i * 2] = (char)(c & 0xff);
			ch[i * 2 + 1] = (char)((c >>> 16) + 1);
		}
		return new String(ch);
	}
	public int compareTo(Cycle<N> o) {
		int d = getCompareInt() - o.getCompareInt();
		return d == 0 ? 0 : d < 0 ? -1 : 1;
		/*List<Integer> list = getNodeIndexList(), otherList = o.getNodeIndexList();
		int d = list.size() - otherList.size();
		if (d == 0) {
			for (int i = list.size(); i-- != 0;) {
				d = list.get(i) - otherList.get(i);
				if (d != 0) return d < 0 ? -1 : 1;
			}
			return 0;
		}
		return d < 0 ? -1 : 1;*/
	}
	public Pair<Cycle<N>, Cycle<N>> splitByEdge(int edgeSource, int edgeDestination) {
		List<Integer> indexList = getNodeIndexList();
		int size = indexList.size();
		if (!indexList.get(0).equals(indexList.get(size-1))) {
			throw new IllegalArgumentException("This path is not a cycle !");
		}
		
		if (graph.isOriented()) throw new IllegalArgumentException("This graph is oriented !");
		
		int i1 = indexList.indexOf(edgeSource);
		if (i1 < 0) return null;
		
		int i2 = indexList.indexOf(edgeDestination);
		if (i2 < 0) return null;
		
		if (i2 < i1) {
			int t = i1;
			i1 = i2;
			i2 = t;
		}
		int diff = i2 - i1, otherDiff = size - 1 - diff;
		if (otherDiff < diff) diff = otherDiff;
		if (diff < 2) return null;
		
		List<Integer> first = new LinkedList<Integer>();
		for (int i = 0; i <= i1; i++) {
			first.add(indexList.get(i));
		}
		for (int i = i2; i < size; i++) {
			first.add(indexList.get(i));
		}
		
		List<Integer> second = new LinkedList<Integer>();
		for (int i = i1; i <= i2; i++) {
			second.add(indexList.get(i));
		}
		second.add(indexList.get(i1));
		
		DefaultCycle<N> firstCycle = new DefaultCycle<N>(first, graph), secondCycle = new DefaultCycle<N>(second, graph); 
		return new Pair<Cycle<N>, Cycle<N>>(firstCycle, secondCycle);
	}
} 
