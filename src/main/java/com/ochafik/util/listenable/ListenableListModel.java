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

import javax.swing.AbstractListModel;

/**
 * Swing list model (for use by JList) that dynamically reflects the contents of a listenable list.<br/>
 * This model safely propagates events from the listenable list to any registered ListDataListener within the event dispatch thread, even if the events were received from an other thread.
 * @see javax.swing.event.ListDataListener
 * @see javax.swing.JList
 * @see com.ochafik.util.listenable.SwingCollectionListener 
 * @author Olivier Chafik
 * @param <T> Type of the elements of the list
 */
public class ListenableListModel<T> extends AbstractListModel {
	private static final long serialVersionUID = 1794077239948305400L;
	
	private ListenableList<T> list;
	
	public ListenableListModel(ListenableList<T> list) {
		setList(list);
	}
	public ListenableListModel() {}
	
	CollectionListener<T> listener = new SwingCollectionListener<T>(new CollectionListener<T>() {
		public void collectionChanged(CollectionEvent<T> e) {
			switch (e.getType()) {
			case ADDED:
				fireIntervalAdded(this, e.getFirstIndex(), e.getLastIndex());
				break;
			case REMOVED:
				fireIntervalRemoved(this, e.getFirstIndex(), e.getLastIndex());
				break;
			case UPDATED:
				fireContentsChanged(this, e.getFirstIndex(), e.getLastIndex());
				break;
			}
		}
	});
	
	/**
	 * Set or change the listenable list which content is reflected by this list model.<br/>
	 * May trigger DELETED events (if there was already a non-empty underlying list) and ADDED events (if the list being set is not empty).
	 * @param list
	 */
	public void setList(ListenableList<T> list) {
		ListenableList<T> oldList = this.list;
		if (oldList != null) {
			this.list = null;
			oldList.removeCollectionListener(listener);
			if (!oldList.isEmpty()) {
				fireIntervalRemoved(this, 0, oldList.size() - 1);
			}
		}
		this.list = list;
		if (list == null)
			return;
		
		list.addCollectionListener(listener);
		if (!list.isEmpty()) {
			fireIntervalAdded(this, 0, list.size() - 1);
		}
		
	}
	
	public Object getElementAt(int index) {
		return list.get(index);
	}

	public int getSize() {
		return list == null ? 0 : list.size();
	}
	public ListenableList<T> getList() {
		return list;
	}

}
