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

package com.ochafik.util.listenable;

import java.util.Collection;
import java.util.List;
import java.util.ListIterator;

class SynchronizedListenableList<T> extends SynchronizedListenableCollection<T> implements ListenableList<T> {
	List<T> list;
	
	public SynchronizedListenableList(List<T> list) {
		super(list);
		this.list = list;
	}
	
	public void add(int index, T element) {
		synchronized (mutex) {
			list.add(index, element);
		}
	}

	public boolean addAll(int index, Collection<? extends T> c) {
		synchronized (mutex) {
			return list.addAll(index, c);
		}
	}

	public T get(int index) {
		synchronized (mutex) {
			return list.get(index);
		}
	}

	public int indexOf(Object o) {
		synchronized (mutex) {
			return list.indexOf(o);
		}
	}

	public int lastIndexOf(Object o) {
		synchronized (mutex) {
			return list.lastIndexOf(o);
		}
	}

	public ListIterator<T> listIterator() {
		if (true)
			throw new UnsupportedOperationException();
		
		synchronized (mutex) {
			return list.listIterator();
		}
	}

	public ListIterator<T> listIterator(int index) {
		if (true)
			throw new UnsupportedOperationException();
		
		synchronized (mutex) {
			return list.listIterator(index);
		}
	}

	public T remove(int index) {
		synchronized (mutex) {
			return list.remove(index);
		}
	}

	public T set(int index, T element) {
		synchronized (mutex) {
			return list.set(index, element);
		}
	}

	public List<T> subList(int fromIndex, int toIndex) {
		if (true)
			throw new UnsupportedOperationException();
		
		synchronized (mutex) {
			return list.subList(fromIndex, toIndex);
		}
	}

}
