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

/*
   Copyright 2008 Olivier Chafik

   Licensed under the Apache License, Version 2.0 (the License);
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an AS IS BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.

   This file comes from the Jalico project (Java Listenable Collections)

       http://jalico.googlecode.com/.
*/
package com.ochafik.util.listenable;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Iterator;

class FilteredListenableCollection<T> implements ListenableCollection<T> {
	protected final ListenableCollection<T> listenableCollection;
	protected Collection<CollectionListener<T>> listeners;

	public FilteredListenableCollection(ListenableCollection<T> listenableCollection) {
		this.listenableCollection = listenableCollection;
		
	}

	public void addCollectionListener(CollectionListener<T> l) {
		if (listeners == null) {
			listeners = new ArrayList<CollectionListener<T>>();
			listenableCollection.addCollectionListener(new CollectionListener<T>() {
				public void collectionChanged(CollectionEvent<T> e) {
					if (listeners != null && !listeners.isEmpty()) {
						Collection<T> filteredElements = e.getElements();
						CollectionEvent<T> filteredEvent = new CollectionEvent<T>(FilteredListenableCollection.this, filteredElements, e.getType(), e.getFirstIndex(), e.getLastIndex());
						for (CollectionListener<T> listener : listeners) {
							listener.collectionChanged(filteredEvent);
						}
					}
				}
			});
		}
		
		listeners.add(l);
	}

	public void removeCollectionListener(CollectionListener<T> l) {
		if (listeners == null)
			return;
		
		listeners.remove(l);
	}

	public boolean add(T o) {
		return listenableCollection.add(o);
	}

	public boolean addAll(Collection<? extends T> c) {
		return listenableCollection.addAll(c);
	}
	
	public void clear() {
		listenableCollection.clear();		
	}

	public boolean contains(Object o) {
		return listenableCollection.contains(o);
	}

	public boolean containsAll(Collection<?> c) {
		return listenableCollection.containsAll(c);
	}

	public boolean isEmpty() {
		return listenableCollection.isEmpty();
	}
	static class FilteredIterator<T> implements Iterator<T> {
		Iterator<T> iterator;
		
		public FilteredIterator(Iterator<T> iterator) {
			this.iterator = iterator;
		}
		public boolean hasNext() {
			return iterator.hasNext();
		}
		public T next() {
			return iterator.next();
		}
		public void remove() {
			iterator.remove();
		}
	}
	public Iterator<T> iterator() {
		return new FilteredIterator<T>(listenableCollection.iterator());
	}

	public boolean remove(Object o) {
		return listenableCollection.remove(o);
	}

	public boolean removeAll(Collection<?> c) {
		return listenableCollection.removeAll(c);
	}

	public boolean retainAll(Collection<?> c) {
		return listenableCollection.retainAll(c);
	}

	public int size() {
		return listenableCollection.size();
	}

	public Object[] toArray() {
		return listenableCollection.toArray();
	}

	@SuppressWarnings("hiding")
	public <T> T[] toArray(T[] a) {
		return listenableCollection.toArray(a);
	}
		
}
