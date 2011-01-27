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

import java.util.Collection;
import java.util.Iterator;

class SynchronizedListenableCollection<T> extends DefaultListenableCollection<T> {
	protected Object mutex;
	
	
	public SynchronizedListenableCollection(Collection<T> collection, ListenableSupport<T> collectionSupport) {
		super(collection, collectionSupport);
		this.mutex = this;
	}
	public SynchronizedListenableCollection(Collection<T> collection) {
		super(collection);
		this.mutex = this;
	}
	public SynchronizedListenableCollection(Collection<T> collection, ListenableSupport<T> collectionSupport, Object mutex) {
		super(collection, collectionSupport);
		this.mutex = mutex;
	}
	public SynchronizedListenableCollection(Collection<T> collection, Object mutex) {
		super(collection);
		this.mutex = mutex;
	}
	
	@Override
	public boolean add(T o) {
		synchronized (mutex) {
			return super.add(o);
		}
	}
	@Override
	public boolean addAll(Collection<? extends T> c) {
		synchronized (mutex) {
			return super.addAll(c);
		}
	}
	@Override
	public void addCollectionListener(CollectionListener<T> l) {
		synchronized (mutex) {
			super.addCollectionListener(l);
		}
	}
	@Override
	public void clear() {
		synchronized (mutex) {
			super.clear();
		}
	}
	@Override
	protected Object clone() throws CloneNotSupportedException {
		synchronized (mutex) {
			return super.clone();
		}
	}
	@Override
	public boolean contains(Object o) {
		synchronized (mutex) {
			return super.contains(o);
		}
	}
	@Override
	public boolean containsAll(Collection<?> c) {
		synchronized (mutex) {
			return super.containsAll(c);
		}
	}
	@Override
	public boolean equals(Object obj) {
		synchronized (mutex) {
			return super.equals(obj);
		}
	}
	@Override
	public int hashCode() {
		synchronized (mutex) {
			return super.hashCode();
		}
	}
	@Override
	public boolean isEmpty() {
		synchronized (mutex) {
			return super.isEmpty();
		}
	}
	
	protected class SynchronizedListenableIterator implements Iterator<T> {
		final Iterator<T> it;
		public SynchronizedListenableIterator() {
			this.it = SynchronizedListenableCollection.super.iterator();
		}
		public boolean hasNext() {
			synchronized (mutex) {
				return it.hasNext();
			}
		}
		public T next() {
			synchronized (mutex) {
				return it.next();
			}
		}
		public void remove() {
			synchronized (mutex) {
				it.remove();
			}
		}
	};
	
	@Override
	public Iterator<T> iterator() {
		synchronized (mutex) {
			return new SynchronizedListenableIterator();//super.iterator());
		}
	}
	@Override
	public boolean remove(Object o) {
		synchronized (mutex) {
			return super.remove(o);
		}
	}
	@Override
	public boolean removeAll(Collection<?> c) {
		synchronized (mutex) {
			return super.removeAll(c);
		}
	}
	@Override
	public void removeCollectionListener(CollectionListener<T> l) {
		synchronized (mutex) {
			super.removeCollectionListener(l);
		}
	}
	@Override
	public boolean retainAll(Collection<?> c) {
		synchronized (mutex) {
			return super.retainAll(c);
		}
	}
	@Override
	public int size() {
		synchronized (mutex) {
			return super.size();
		}
	}
	@Override
	public Object[] toArray() {
		synchronized (mutex) {
			return super.toArray();
		}
	}
	@Override
	public <V> V[] toArray(V[] a) {
		synchronized (mutex) {
			return super.toArray(a);
		}
	}
	@Override
	public String toString() {
		synchronized (mutex) {
			return super.toString();
		}
	}
	
}
