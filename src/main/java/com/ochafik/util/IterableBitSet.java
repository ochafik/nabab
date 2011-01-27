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

import java.util.Arrays;
import java.util.Iterator;

/**
 * Dense-storage BitSet that supports constant-time iteration over its set bits.
 * All operations are in constant-time, except clear() (set(int, boolean), clear(int), size()).
 * @see IterableArray
 * @author Olivier Chafik
 * @param <T> type to be held in the array
 */
public final class IterableBitSet implements Iterable<Integer> {
	private final int[] previousIndices, nextIndices;
	private final boolean[] values;
	private int firstEntryIndex = -1;
	private int itemCount;
	
	public interface IntIterator {
		public boolean hasNext();
		public void remove();
		public int next();
		public int removeNext();
	}
	
	@SuppressWarnings("unchecked")
	public IterableBitSet(int size) {
		previousIndices = new int[size];
		nextIndices = new int[size];
		Arrays.fill(previousIndices, -1);
		Arrays.fill(nextIndices, -1);
		values = new boolean[size];
	}
	
	public void clear() {
		IntIterator it = intIterator();
		while (it.hasNext()) {
			it.next();
			it.remove();
		}
		//values.clear();
		firstEntryIndex = -1;
	}
	
	public int size() { return itemCount; }
//	public int size() { return previousIndices.length; }
//	public int getItemCount() { return itemCount; }
	
	public boolean get(int i) {
		return values[i];
	}

	public void set(int i) {
		if (!values[i]) {
			values[i] = true;
			itemCount++;
			
			assert firstEntryIndex >= -1;
			if (firstEntryIndex != -1) {
				assert previousIndices[firstEntryIndex] < 0;
				previousIndices[firstEntryIndex] = i;
				nextIndices[i] = firstEntryIndex;
			} else {
				previousIndices[i] = -1;
				nextIndices[i] = -1;
			}
			firstEntryIndex = i;
		}
	}
	public void clear(int i) {
		if (values[i]) {
			values[i] = false;
			
			// Remove the entry from the linked list
			int next = nextIndices[i], 
				previous = previousIndices[i];
			if (next >= 0)
				previousIndices[next] = previous;
			
			if (previous >= 0)
				nextIndices[previous] = next;
			
			if (i == firstEntryIndex)
				firstEntryIndex = next;
			
			itemCount--;
		}
	}
	public void set(int i, boolean value) {
		if (value)
			set(i);
		else
			clear(i);
	}
	public Iterator<Integer> iterator() {
		final IntIterator it = intIterator();
		return new Iterator<Integer>() {
			public boolean hasNext() {
				return it.hasNext();
			}
			public Integer next() {
				return it.next();
			}
			public void remove() {
				it.remove();
			}
		};
	}
	
	public final class MyIntIterator implements IntIterator {
		int lastIndex = -1;
		int nextIndex = firstEntryIndex;
		public boolean hasNext() {
			return nextIndex != -1;
		}
		public int next() {
			assert values[nextIndex];
			lastIndex = nextIndex;
			nextIndex = nextIndices[nextIndex];
			return lastIndex;
		}
		public int removeNext() {
			assert values[nextIndex];
			set(lastIndex = nextIndex, false);
			nextIndex = nextIndices[nextIndex];
			return lastIndex;
		}
		public void remove() {
			set(lastIndex, false);
		}
	};
	
	public MyIntIterator intIterator() {
		return new MyIntIterator();
	}
	public static void main(String[] args) {
		int len = 10;
		IterableBitSet a = new IterableBitSet(len);
		
		for (int i : new int[] { 1, 2, 4, 6})
			a.set(i, true);
		
		for (int i : new int[] { 1, 2, 4, 6})
			a.set(i, true);
		
		a.set(4, false);
		a.set(3, true);
		
		for (int i : a)
			System.out.println(i);
		
		System.out.println("--");
		
		for (int i : new int[] { 1, 2, 4, 6})
			a.set(i, false);
		
		for (int i : a)
			System.out.println(i);
		
		System.out.println("--");
		
		for (int i : new int[] { 2, 1, 2, 4, 6})
			a.set(i, true);
		
		for (int i : a)
			System.out.println(i);
	}

	public void setAll(IntArray a) {
		int[] ba = a.getBackingArray();
		if (ba != null) {
//			for (int ii = ba.length; ii-- != 0;) {
//				int i = ba[ii];
//			}
			for (int i : ba) {
				if (values[i])
					continue;
				
				values[i] = true;
				itemCount++;
				
				assert firstEntryIndex >= -1;
				if (firstEntryIndex != -1) {
					assert previousIndices[firstEntryIndex] < 0;
					previousIndices[firstEntryIndex] = i;
					nextIndices[i] = firstEntryIndex;
				} else {
					previousIndices[i] = -1;
					nextIndices[i] = -1;
				}
				firstEntryIndex = i;
			}
		} else {
			for (int i = a.size(); i-- != 0;)
				set(a.get(i));
		}
	}

}
