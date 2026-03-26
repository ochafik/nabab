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

package com.ochafik.math.functions;

import java.awt.geom.Point2D;
import java.beans.PropertyChangeListener;
import java.beans.PropertyChangeSupport;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;


public class DefaultVariable implements Variable {
	private final String name;
	private final List<Object> values;
	private Map<String, Object> attributes;
	private final int id;
	PropertyChangeSupport propertyChangeSupport;
	
	static Map<String, Integer> idsByName = new HashMap<String, Integer>();
	static int nextId;
	
	public static int getMaxId() {
		return nextId - 1;
	}
	
	public static DefaultVariable createVariable(String name, int valueCount) {
		Integer id = idsByName.get(name);
		if (id == null) {
			id = ++nextId;
			idsByName.put(name, id);
		}
		return new DefaultVariable(name, valueCount, id);
	}
	public static DefaultVariable createVariable(String name, List<Object> values) {
		Integer id = idsByName.get(name);
		if (id == null) {
			id = ++nextId;
			idsByName.put(name, id);
		}
		return new DefaultVariable(name, values, id);
	}
	
	protected DefaultVariable(String name, int valueCount, int id) {
		this.name = name;
		this.values = new ArrayList<Object>(valueCount);
		
		for (int i = 0; i < valueCount; i++) {
			values.add(i);
		}
		this.id = id;
	}
	protected DefaultVariable(String name, List<Object> values, int id) {
		this.name = name;
		this.values = values;
		this.id = id;
	}
	public Object getProperty(String key) {
		if (attributes == null) return null;
		return attributes.get(key);
	}
	public void setProperty(String key, Object value) {
		if (attributes == null) {
			attributes = new HashMap<String, Object>();
		}
		Object old = attributes.put(key, value);
		if (propertyChangeSupport != null) {
			propertyChangeSupport.firePropertyChange(key, old, value);
		}
	}
	
	List<Object> roValues;
	public List<Object> getValues() {
		if (roValues == null)
			roValues = Collections.unmodifiableList(values);
		
		return roValues;
	}
	public Object getValue(int iValue) {
		return values.get(iValue);
	}
	
	public int getId() {
		return id;
	}
	public int compareTo(Variable o) {
		int d = getId() - o.getId();
		return d < 0 ? -1 : d == 0 ? 0 : 1;
	}
	public int getValueCount() {
		return values.size();
	}
	public String getName() {
		return name;
	}
	public String toString() {
		return getName();// + "#" + getValueCount();//+"]";
	}
	@Override
	public int hashCode() {
		return getName().hashCode();
	}
	@Override
	public boolean equals(Object obj) {
		if (obj == null || !(obj instanceof Variable)) return false;
		return ((Variable)obj).getName().equals(getName());
	}
	@Override
	public void addAttributeChangeListener(String name, PropertyChangeListener listener) {
		if (propertyChangeSupport == null)
			propertyChangeSupport = new PropertyChangeSupport(this);
		
		propertyChangeSupport.addPropertyChangeListener(name, listener);
	}
	@Override
	public void removePropertyChangeListener(String name, PropertyChangeListener listener) {
		if (propertyChangeSupport == null)
			return;
		
		propertyChangeSupport.removePropertyChangeListener(listener);
	}

	@Override
	public Set<String> getPropertyNames() {
		return attributes.keySet();
	}

}
