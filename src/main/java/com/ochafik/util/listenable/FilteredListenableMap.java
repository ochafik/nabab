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


class FilteredListenableMap<K, V> implements ListenableMap<K, V> {
	ListenableMap<K, V> listenableMap;


	public FilteredListenableMap(ListenableMap<K, V> listenableMap) {
		this.listenableMap = listenableMap;
	}

	public void clear() {
		listenableMap.clear();
	}

	public boolean containsKey(Object key) {

		return listenableMap.containsKey(key);
	}

	public boolean containsValue(Object value) {

		return listenableMap.containsValue(value);
	}

	public ListenableSet<Entry<K, V>> entrySet() {

		return listenableMap.entrySet();
	}


	public V get(Object key) {

		return listenableMap.get(key);
	}

	public boolean isEmpty() {

		return listenableMap.isEmpty();
	}

	public ListenableSet<K> keySet() {

		return listenableMap.keySet();
	}

	public V put(K key, V value) {

		return listenableMap.put(key, value);
	}

	public void putAll(Map<? extends K, ? extends V> t) {
		listenableMap.putAll(t);

	}

	public V remove(Object key) {

		return listenableMap.remove(key);
	}

	public int size() {

		return listenableMap.size();
	}

	public ListenableCollection<V> values() {

		return listenableMap.values();
	}

	public ListenableSet<K> listenableKeySet() {

		return listenableMap.keySet();
	}


}
