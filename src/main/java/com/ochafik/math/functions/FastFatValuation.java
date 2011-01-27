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

import java.util.Collection;
import java.util.Iterator;
import java.util.NoSuchElementException;

import com.ochafik.util.listenable.Pair;

public class FastFatValuation<N extends Variable> implements Valuation<N> {
	int[] values;
	N[] variables;
	boolean[] presentValues;
	int size;

	@SuppressWarnings("unchecked")
	public FastFatValuation(int capa) {
		values = new int[capa];
		variables = (N[])new Variable[capa];
		presentValues = new boolean[capa];
	}

	public boolean containsAll(Collection<N> vv) {
		for (N v : vv)
			if (!hasVariable(v)) return false;
		return true;
	}

	public boolean get(N var, int[] valOut) {
		if (!hasVariable(var)) 
			return false;
		valOut[0] = values[var.getId()];
		return true;
	}

	public int get(N var) {
		if (!hasVariable(var)) 
			throw new NoSuchElementException("Variable not in valuation : " +var);
		return values[var.getId()];
	}

	public int getValueAt(int i) {
		return values[i];
	}

	public N getVariableAt(int i) {
		return variables[i];
	}

	public boolean hasVariable(N v) {
		int id = v.getId();
		return id < presentValues.length && presentValues[id];
	}

	public int indexOf(N v) {
		return v.getId();
	}

	int[] cachedIndexSet;
	public int[] getVariableIndices() {
		if (cachedIndexSet == null) {
			cachedIndexSet = new int[size];
			int ii = 0;
			for (int i = variables.length; i-- != 0;)
				if (variables[i] != null) cachedIndexSet[ii++] = i;
		}
		return cachedIndexSet;
	}
	
	@SuppressWarnings("unchecked")
	public void ensureCapacity(int c) {
		if (c < values.length) return;

		c = c < 6 ? c + 1 : (int)(c *1.6);
		int[] valuesN = new int[c];
		boolean[] presentValuesN = new boolean[c];
		N[] variablesN = (N[])new Variable[c];
		System.arraycopy(values, 0, valuesN, 0, values.length);
		System.arraycopy(variables, 0, variablesN, 0, variables.length);
		System.arraycopy(presentValues, 0, presentValuesN, 0, variables.length);
		
		values = valuesN;
		variables = variablesN;
		presentValues = presentValuesN;
	}
	public void put(N var, int val) {
		int id = var.getId();
		ensureCapacity(id + 1);
		variables[id] = var;
		values[id] = val;
		if (!presentValues[id]) {
			presentValues[id] = true;
			size++;
			cachedIndexSet = null;
		}
	}

	public boolean remove(N var) {
		int id = var.getId();
		boolean present = variables[id] != null;
		if (!present) return false;
		variables[id] = null;
		presentValues[id] = false;
		size--;
		cachedIndexSet = null;
		return true;
	}

	public void setValueAt(int i, int v) {
		values[i] = v;
		if (!presentValues[i]) {
			presentValues[i] = true;
			size++;
			cachedIndexSet = null;
		}
	}

	/*public int size() {
		return size;
	}*/

	public String toString() {
		StringBuffer b = new StringBuffer("Values {");
		boolean first = true;
		for (int i = 0, len = values.length; i < len; i++) {
			N v = getVariableAt(i);
			if (v == null)
				continue;
			if (!hasVariable(v)) 
				continue;
			if (first) 
				first = false;
			else 
				b.append(", ");
			b.append(v.getName() + " = " + get(v));
		}
		b.append("}");
		return b.toString();
	}
	
	@Override
	public Valuation<N> deriveNewValuation() {
		return new ChainedFastFatValuation<N>(this);
	}
}
