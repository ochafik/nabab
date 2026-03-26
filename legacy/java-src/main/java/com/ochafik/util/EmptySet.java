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

import java.util.Collection;
import java.util.Comparator;
import java.util.Iterator;
import java.util.NoSuchElementException;
import java.util.Set;
import java.util.SortedSet;

public class EmptySet<T> implements SortedSet<T> {
	public boolean add(T o) {
		throw new UnsupportedOperationException();
	}
	public boolean addAll(Collection<? extends T> c) {
		if (c.size() == 0) return false;
		throw new UnsupportedOperationException();
	}
	public void clear() {}
	public boolean contains(Object o) {
		return false;
	}
	public boolean containsAll(Collection<?> c) {
		return false;
	}
	
	public Comparator<? super T> comparator() {
		// TODO Auto-generated method stub
		return null;
	}
	public T first() {
		// TODO Auto-generated method stub
		return null;
	}
	public SortedSet<T> headSet(T arg0) {
		// TODO Auto-generated method stub
		return null;
	}
	public T last() {
		// TODO Auto-generated method stub
		return null;
	}
	public SortedSet<T> subSet(T arg0, T arg1) {
		// TODO Auto-generated method stub
		return null;
	}
	public SortedSet<T> tailSet(T arg0) {
		// TODO Auto-generated method stub
		return null;
	}
	
	@Override
	public boolean equals(Object obj) {
		if (obj == null || !(obj instanceof Set)) return false;
		return ((Set)obj).isEmpty();
	}
	@Override
	public int hashCode() {
		return 0;
	}
	public boolean isEmpty() {
		return true;
	}
	public Iterator<T> iterator() {
		return new Iterator<T>() {
			public boolean hasNext() {
				return false;
			}
			public T next() {
				throw new NoSuchElementException("empty set has no next element");
			}
			public void remove() {
				throw new NoSuchElementException("empty set has no element");
			}
		};
	}
	public boolean remove(Object o) {
		return false;
	}
	public boolean removeAll(Collection<?> c) {
		return false;
	}
	public boolean retainAll(Collection<?> c) {
		return false;
	}
	public int size() {
		return 0;
	}
	public Object[] toArray() {
		return new Object[0];
	}
	public <T> T[] toArray(T[] a) {
		throw new UnsupportedOperationException();
	}
	
}