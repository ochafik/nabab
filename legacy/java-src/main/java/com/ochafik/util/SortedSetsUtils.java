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

import gnu.trove.TIntArrayList;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.Comparator;
import java.util.Iterator;
import java.util.LinkedList;
import java.util.List;
import java.util.Set;
import java.util.SortedSet;
import java.util.TreeSet;

public class SortedSetsUtils<E> {
	
	public static class MergedSortedSetsIterator<T extends Comparable<T>> implements Iterator<T> {
		private final List<Iterator<T>> iterators;
		private final List<T> nextElements;
		T next;
		
		public MergedSortedSetsIterator(Collection<T>[] sets) {
			//this.sets = sets;
			this.iterators = new ArrayList<Iterator<T>>();
			this.nextElements = new ArrayList<T>();
			
			for (int i = sets.length; i-- != 0;) {
				Iterator<T> it = sets[i].iterator();
				if (it.hasNext()) {
					iterators.add(it);
					T e = it.next();
					if (next == null || e.compareTo(next) < 0) {
						next = e;
					}
					nextElements.add(e);
				}
			}
		}
		
		public boolean hasNext() {
			return next != null;//!iterators.isEmpty();
		}
		public T next() {
			T oldNext = next;
			
			next = null;
			for (int i = iterators.size(); i-- != 0;) {
				T nextElement = nextElements.get(i);
				Iterator<T> it = iterators.get(i);
				
				int c = nextElement.compareTo(oldNext);
				assert c >= 0;
				if (c == 0) {
					// Next was in this iterator. Consume it.
					if (it.hasNext()) {
						nextElement = it.next();
						nextElements.set(i, nextElement);
					} else {
						// exhausted this iterator
						nextElements.remove(i);
						iterators.remove(i);
						nextElement = null;
					}
				} 
				if (nextElement != null && (next == null || nextElement.compareTo(next) < 0)) {
					next = nextElement;
				}
			}
			return oldNext;
		}
		public void remove() {
			throw new UnsupportedOperationException();
		}
	}
	
	public static class MergedSortedIntSetsIterator {
		public static class IntIterator {
			private final IntArray array;
			private final int size;
			private int next;
			
			public IntIterator(IntArray array) {
				this.array = array;
				size = array.size();
			}
			public boolean hasNext() {
				return next < size;
			}
			public int next() {
				return array.get(next++);
			}
		}
		private final List<IntIterator> iterators;
		private final TIntArrayList nextElements;
		int next;
		boolean hasNext;
		
		public MergedSortedIntSetsIterator(SortedIntArray[] sets) {
			//this.sets = sets;
			this.iterators = new ArrayList<IntIterator>();
			this.nextElements = new TIntArrayList();
			
			for (int i = sets.length; i-- != 0;) {
				IntIterator it = new IntIterator(sets[i]);
				if (it.hasNext()) {
					iterators.add(it);
					int e = it.next();
					if (!hasNext || e < next) {
						next = e;
						hasNext = true;
					}
					nextElements.add(e);
				}
			}
		}
		
		public boolean hasNext() {
			return hasNext;//!iterators.isEmpty();
		}
		public int next() {
			int oldNext = next;
			
			hasNext = false;
			for (int i = iterators.size(); i-- != 0;) {
				boolean hasNextElement = true;
				int nextElement = nextElements.get(i);
				IntIterator it = iterators.get(i);
				
				
				if (nextElement == oldNext) {
					// Next was in this iterator. Consume it.
					if (it.hasNext()) {
						nextElement = it.next();
						nextElements.set(i, nextElement);
					} else {
						// exhausted this iterator
						nextElements.remove(i);
						iterators.remove(i);
						hasNextElement = false;
					}
				} 
				if (hasNextElement && (!hasNext || nextElement < next)) {
					next = nextElement;
					hasNext = true;
				}
			}
			return oldNext;
		}
		public void remove() {
			throw new UnsupportedOperationException();
		}
	}
	
	public static final <T extends Comparable<T>> Collection<T> iterableSortedUnion(Collection<T> set1, Collection<T> set2) {
		return iterableSortedUnion((Collection<T>[])new Collection[] {set1, set2});
	}
	public static final <T extends Comparable<T>> Collection<T> iterableSortedUnion(Collection<T>[] sets) {
		final MergedSortedSetsIterator<T> it = new MergedSortedSetsIterator<T>(sets);
		return new Collection<T>() {

			public boolean add(T arg0) {
				throw new UnsupportedOperationException();
			}

			public boolean addAll(Collection<? extends T> arg0) {
				throw new UnsupportedOperationException();
			}

			public void clear() {
				throw new UnsupportedOperationException();
			}

			public boolean contains(Object arg0) {
				throw new UnsupportedOperationException();
			}

			public boolean containsAll(Collection<?> arg0) {
				throw new UnsupportedOperationException();
			}

			public boolean isEmpty() {
				throw new UnsupportedOperationException();
			}

			public Iterator<T> iterator() {
				return it;
			}

			public boolean remove(Object arg0) {
				throw new UnsupportedOperationException();
			}

			public boolean removeAll(Collection<?> arg0) {
				throw new UnsupportedOperationException();
			}

			public boolean retainAll(Collection<?> arg0) {
				throw new UnsupportedOperationException();
			}

			public int size() {
				throw new UnsupportedOperationException();
			}

			public Object[] toArray() {
				throw new UnsupportedOperationException();
			}

			public <T> T[] toArray(T[] arg0) {
				throw new UnsupportedOperationException();
			}
			
		};
	}
	public static void main(String[] args) {
		MergedSortedSetsIterator<Integer> it = new MergedSortedSetsIterator<Integer>(new Collection[] {
			new TreeSet<Integer>(Arrays.asList(new Integer[] {1, 2, 3, 5, 9})),
			new TreeSet<Integer>(Arrays.asList(new Integer[] {1, 2, 4, 5, 7}))
		});
		
		while (it.hasNext()) {
			int i = it.next();
			System.out.println(i);
		}
	}
}
