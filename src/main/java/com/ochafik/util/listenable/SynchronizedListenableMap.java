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

import java.util.Map;

class SynchronizedListenableMap<K,V> extends DefaultListenableMap<K,V> {
	Object mutex;
 	
	public SynchronizedListenableMap(Map<K, V> map) {
		super(map);
		mutex = this;
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
 	public boolean containsKey(Object key) {
 		synchronized (mutex) {
 			return super.containsKey(key);
 		}
 	}
 	@Override
 	public boolean containsValue(Object value) {
 		synchronized (mutex) {
 			return super.containsValue(value);
 		}
 	}
 	@Override
 	public ListenableSet<Entry<K, V>> entrySet() {
 		synchronized (mutex) {
 			return new SynchronizedListenableSet<Entry<K,V>>(super.entrySet(), mutex);
 		}
 	}
 	@Override
 	public boolean equals(Object obj) {
 		synchronized (mutex) {
 			return super.equals(obj);
 		}
 	}
 	@Override
 	public V get(Object key) {
 		synchronized (mutex) {
 			return super.get(key);
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
 	
 	@Override
 	public ListenableSet<K> keySet() {
 		synchronized (mutex) {
 			return new SynchronizedListenableSet<K>(super.keySet());
 		}
 	}
 	@Override
 	public V put(K key, V value) {
 		synchronized (mutex) {
 			return super.put(key, value);
 		}
 	}
 	@Override
 	public void putAll(Map<? extends K, ? extends V> t) {
 		synchronized (mutex) {
 			super.putAll(t);
 		}
 	}
 	@Override
 	public V remove(Object key) {
 		synchronized (mutex) {
 			return super.remove(key);
 		}
 	}
 	@Override
 	public int size() {
 		synchronized (mutex) {
 			return super.size();
 		}
 	}
 	@Override
 	public String toString() {
 		synchronized (mutex) {
 			return super.toString();
 		}
 	}
 	@Override
 	public ListenableCollection<V> values() {
 		synchronized (mutex) {
 			return new SynchronizedListenableCollection<V>(super.values());
 		}
 	}
 	
}
