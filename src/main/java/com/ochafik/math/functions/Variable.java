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
import java.util.List;
import java.util.Set;

/**
 * Discreete variable with a finite amount of states.
 * @author ochafik
 */
public interface Variable extends Comparable<Variable> {
	//List<Value> getValues();
	public String getName();
	
	public Object getProperty(String key);
	public Set<String> getPropertyNames();
	//public Map<String, Object> getProperties
	public void setProperty(String key, Object value);
	public void addAttributeChangeListener(String name, PropertyChangeListener listener);
	public void removePropertyChangeListener(String name, PropertyChangeListener listener);
	
	//public int getValueCount();
	public List<Object> getValues();
	//public Object getValue(int iValue);
	public int getId();
}
