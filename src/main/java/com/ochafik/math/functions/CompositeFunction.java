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

import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;


abstract class CompositeFunction<N extends Variable> implements Function<N> {
	List<Function<N>> functionList;
	List<N> argumentNames;
	
	public CompositeFunction() {
		this(10);
	}
	public CompositeFunction(int initialCapacity) {
		 functionList = new ArrayList<Function<N>>(initialCapacity);
	}
	public abstract void append(double constant);
	protected abstract String getSeparatorString();
	
	public void append(Function<N> f) throws FunctionException {
		if (f instanceof ConstantFunction) {//.getArgumentNames().isEmpty()) {
			append(f.eval(null));
		} else {
			functionList.add(f);
			argumentNames = null;
		}
	}
	public List<Function<N>> getFunctionList() {
		return functionList;
	}
	public List<N> getArgumentNames() {
		if (argumentNames == null) {
			Set<N> names = new TreeSet<N>();
			for (Function<N> f : functionList) {
				names.addAll(f.getArgumentNames());
			}
			argumentNames = new ArrayList<N>(names);
		}
		return argumentNames;
	}
	public String toString() {
		StringBuffer b = new StringBuffer();
		String sep = getSeparatorString();
		
		boolean first = true;
		for (Function<N> f : functionList) {
			if (first) {
				first = false;
			} else {
				b.append(" ");
				b.append(sep);
				b.append(" ");
			}
			if (f instanceof CompositeFunction) {
				b.append("(");
				b.append(f);
				b.append(")");
			} else {
				b.append(f);
			}
		}
		return b.toString();
		
	}
	public void flushCachedData() {
		for (Function<N> f : functionList) 
			f.flushCachedData();
	}
	public Collection<Function<N>> getChildren() {
		return functionList;
	}
}
