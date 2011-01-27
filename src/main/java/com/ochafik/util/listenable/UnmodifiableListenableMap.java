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


class UnmodifiableListenableMap<K, V> extends FilteredListenableMap<K, V>{

	
	public UnmodifiableListenableMap(ListenableMap<K, V> listenableMap) {
		super(listenableMap);
	}
	@Override
	public void clear() {
		throw new UnsupportedOperationException("Unmodifiable map !");
	}
	@Override
	public ListenableSet<Entry<K, V>> entrySet() {
		return ListenableCollections.unmodifiableSet(listenableMap.entrySet());
	}
	@Override
	public ListenableCollection<V> values() {
		return ListenableCollections.unmodifiableCollection(listenableMap.values());
	}
	@Override
	public ListenableSet<K> keySet() {
		return new UnmodifiableListenableSet<K>(listenableMap.keySet());
		//return Collections.unmodifiableSet(listenableMap.keySet());
	}
	@Override
	public ListenableSet<K> listenableKeySet() {
		return new UnmodifiableListenableSet<K>(listenableMap.keySet());
	}
	@Override
	public V put(K key, V value) {
		throw new UnsupportedOperationException("Unmodifiable map !");
	}
	@Override
	public void putAll(Map<? extends K, ? extends V> t) {
		throw new UnsupportedOperationException("Unmodifiable map !");
	}
	@Override
	public V remove(Object key) {
		throw new UnsupportedOperationException("Unmodifiable map !");
	}
}
