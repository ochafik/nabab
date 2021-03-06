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

package com.ochafik.util;

import java.util.Iterator;


public class SortedIntList implements SortedIntArray {
	public interface IntVisitor {
		public boolean visit(int i);
	}
	
	private final IntVector list;
	
	public SortedIntList() {
		list = new IntVector();
	}
	public SortedIntList(int capacity) {
		list = new IntVector(capacity);
	}
	
	public int[] getBackingArray() {
		return list.getBackingArray();
	}
	
	public SortedIntList clone() {
		int size = size();
		SortedIntList clone = new SortedIntList(size);
		for (int i = 0; i < size; i++) {
			clone.list.add(list.get(i));
		}
		return clone;
	}
	public void set(int pos, int value) {
		throw new UnsupportedOperationException();
	}
	public int add(int value) {
		int i = BinarySearchUtils.binarySearch(list.getBackingArray(), value, 0, size());
		if (i >= 0) {
			list.set(i,value);
		} else {
			list.insert(i = ((-i) - 1), value);
		}
		return i;
	}
	
	public int[] toArray() {
		return list.toArray();
	}
	public int get(int index) {
		return list.get(index);
	}
	
	public boolean removeValue(int value) {
		int i = BinarySearchUtils.binarySearch(list.getBackingArray(), value, 0, size());
		if (i >= 0) {
			list.remove(i);
			return true;
		} else {
			return false;
		}
	}
	
	public boolean contains(int value) {
		return BinarySearchUtils.binarySearch(list.getBackingArray(), value, 0, size()) >= 0;
	}
	
	public int indexOf(int value) {
		return BinarySearchUtils.binarySearch(list.getBackingArray(), value, 0, size());
	}
	
	public boolean isEmpty() {
		return list.isEmpty();
	}
	
	public void clear() {
		list.clear();
	}
	
	public int size() {
		return list.size();
	}
	
	public boolean visit(final IntVisitor visitor) {
		for (int i = 0, len = list.size(); i < len; i++) {
			if (!visitor.visit(list.get(i))) return false;
		}
		return true;
	}
	

	public String toString() {
		StringBuffer b = new StringBuffer("{");
		for (int i = 0, len = size(); i < len; i++) {
			if (i != 0) b.append(", ");
			b.append(get(i));
		}
		b.append("}");
		return b.toString();
	}
	public void ensureCapacity(int finalSize) {
		list.ensureCapacity(finalSize);
	}
	public void addAll(IntArray values) {
		for (int i = 0, len = values.size(); i < len; i++) add(values.get(i));
	}
	public void addAll(int[] values) {
		for (int i = 0, len = values.length; i < len; i++) add(values[i]);
	}
	public Iterator<Integer> iterator() {
		return IntArrayUtils.iterator(this);
	}
	
}
