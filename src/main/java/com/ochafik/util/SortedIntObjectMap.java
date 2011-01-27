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

package com.ochafik.util;

import java.util.ArrayList;

public class SortedIntObjectMap<V> {
	public interface IntObjectVisitor<V> {
		public boolean visit(int i, V v);
	}
	
	private static final class SortedIntVector extends IntVector implements SortedIntArray {
		public SortedIntVector(int c) {
			super(c);
		}
	};
	private final SortedIntVector keys;
	private final ArrayList<V> values;
	int lastKeyIndex = -1;
	
	public SortedIntObjectMap() {
		this(10);
	}
	public SortedIntObjectMap(int capacity) {
		keys = new SortedIntVector(capacity);
		values = new ArrayList<V>(capacity);
	}
	
	public SortedIntObjectMap<V> clone() {
		int size = size();
		SortedIntObjectMap<V> clone = new SortedIntObjectMap<V>(size);
		for (int i = 0; i < size; i++) {
			clone.keys.add(keys.get(i));
			clone.values.add(values.get(i));
		}
		return clone;
	}
	public SortedIntArray getKeys() {
		return keys;
	}
	
	public void put(int key, V value) {
		int i;
		if ((lastKeyIndex == -1) || (keys.get(i = lastKeyIndex) != key))
			i = BinarySearchUtils.binarySearch(keys.getBackingArray(), key, 0, size());
		
		if (i >= 0) {
			values.set(i,value);
		} else {
			keys.insert(i = ((-i) - 1), key);
			values.add(i, value);
		}
		lastKeyIndex = i;
	}
	
	public V get(int key) {
		int i;
		if ((lastKeyIndex == -1) || (keys.get(i = lastKeyIndex) != key))
			i = BinarySearchUtils.binarySearch(keys.getBackingArray(), key, 0, size());
		
		if (i >= 0) {
			assert keys.get(i) == key;
			lastKeyIndex = i;
			return values.get(i);
		}
		return null;
	}
	
	public boolean remove(int value) {
		int i;
		if ((lastKeyIndex == -1) || (keys.get(i = lastKeyIndex) != value))
			i = BinarySearchUtils.binarySearch(keys.getBackingArray(), value, 0, size());
		
		if (i >= 0) {
			lastKeyIndex = -1;
			keys.remove(i);
			values.remove(i);
			return true;
		} else {
			return false;
		}
	}
	
	public boolean containsKey(int value) {
		return BinarySearchUtils.binarySearch(keys.getBackingArray(), value, 0, size()) >= 0;
	}
	
	public int indexOf(int value) {
		return BinarySearchUtils.binarySearch(keys.getBackingArray(), value, 0, size());
	}
	
	public boolean isEmpty() {
		return keys.isEmpty();
	}
	
	public void clear() {
		keys.clear();
		values.clear();
	}
	
	public int size() {
		return keys.size();
	}
	
	
	public boolean visit(final IntObjectVisitor<V> visitor) {
		for (int i = 0, len = size(); i < len; i++) {
			if (!visitor.visit(keys.get(i), values.get(i))) {
				return false;
			}
		}
		return true;
	}
	public void ensureCapacity(int vertices) {
		keys.ensureCapacity(vertices);
		values.ensureCapacity(vertices);
	}

}
