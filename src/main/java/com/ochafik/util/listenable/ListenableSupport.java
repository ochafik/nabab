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

/**
 * Helper class that keeps track of registered CollectionListener instances and eases up the firing of CollectionEvent.
 * @author Olivier Chafik
 * @param <T> type of the collections
 */
public class ListenableSupport<T> {
	protected Collection<CollectionListener<T>> listeners;
	
	public void addCollectionListener(CollectionListener<T> l) {
		if (listeners == null)
			listeners = new ArrayList<CollectionListener<T>>(1);
		
		listeners.add(l);
	}
	
	public void removeCollectionListener(CollectionListener<T> l) {
		if (listeners == null)
			return;
		
		listeners.remove(l);
	}

	public boolean hasListeners() {
		return listeners != null && !listeners.isEmpty();
	}
	
	public void fireEvent(ListenableCollection<T> source, Collection<T> elements, CollectionEvent.EventType type, int firstIndex, int lastIndex) {
		if (listeners == null || listeners.isEmpty() || elements.isEmpty()) 
			return;
		
		CollectionEvent<T> event = new CollectionEvent<T>(source,elements,type, firstIndex, lastIndex);
		for (CollectionListener<T> listener : listeners) {
			listener.collectionChanged(event);
		}
	}
	
	public void fireAdded(ListenableCollection<T> source, Collection<T> elements) {
		fireEvent(source, elements, CollectionEvent.EventType.ADDED, -1, -1);
	}
	public void fireAdded(ListenableCollection<T> source, Collection<T> elements, int firstIndex, int lastIndex) {
		fireEvent(source, elements, CollectionEvent.EventType.ADDED, firstIndex, lastIndex);
	}
	
	public void fireRemoved(ListenableCollection<T> source, Collection<T> elements) {
		fireEvent(source, elements, CollectionEvent.EventType.REMOVED, -1, -1);
	}
	public void fireRemoved(ListenableCollection<T> source, Collection<T> elements, int firstIndex, int lastIndex) {
		fireEvent(source, elements, CollectionEvent.EventType.REMOVED, firstIndex, lastIndex);
	}
	
	public void fireUpdated(ListenableCollection<T> source, Collection<T> elements) {
		fireEvent(source, elements, CollectionEvent.EventType.UPDATED, -1, -1);
	}
	public void fireUpdated(ListenableCollection<T> source, Collection<T> elements, int firstIndex, int lastIndex) {
		fireEvent(source, elements, CollectionEvent.EventType.UPDATED, firstIndex, lastIndex);
	}
}
