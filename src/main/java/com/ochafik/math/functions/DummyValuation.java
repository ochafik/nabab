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

package com.ochafik.math.functions;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Iterator;
import java.util.List;
import java.util.NoSuchElementException;

import com.ochafik.util.BinarySearchUtils;
import com.ochafik.util.IntArray;
import com.ochafik.util.IntArrayUtils;
import com.ochafik.util.listenable.Pair;

public class DummyValuation<N extends Variable> implements Valuation<N> {
	N[] variables;
	int[] values;
	int size;
	IntArray variableIds = new IntArray() {
		public Iterator iterator() {
			return new IntIterator(this);
		}
		public int size() { 
			return size; 
		}
		public int get(int index) {
			return variables[index].getId(); 
		}
		public int[] getBackingArray() { 
			return null; 
		}
		public int[] toArray() { 
			return IntArrayUtils.toArray(this); 
		}
		public String toString() { 
			return IntArrayUtils.toString(this); 
		}
	};

	@SuppressWarnings("unchecked")
	public DummyValuation(int initCapa) {
		variables = (N[])new Variable[initCapa];
		values = new int[initCapa];
	}
	public boolean get(N var, int[] valOut) {
		int i = BinarySearchUtils.binarySearch(variableIds, var.getId(), 0, size);
		if (i < 0)
			return false;
		valOut[0] = values[i];
		return true;
	}
	public int get(N var) {
		int i = BinarySearchUtils.binarySearch(variableIds, var.getId(), 0, size);
		if (i < 0) 
			throw new NoSuchElementException(var.getName());
		return values[i];
	}
	/*public int getCharacteristicIndex() {
		int n = variables.length;
		int lastDelta = 1;
		int offset = 0;
		for (int i = n; i-- != 0;) {
			N variable = variables[i];
			int iVal = values[i];
			int nVals = variable.getValueCount();
			
			//if (iVal == null) throw new MissingArgumentsException("Missing value for argument "+argument);
			if (iVal >= nVals) throw new IllegalArgumentException("Bad value for argument "+variable);
			offset += iVal * lastDelta;
			lastDelta *= nVals;
		}
		return offset;
	}*/
	int[] cachedIndexSet;
	public int[] getVariableIndices() {
		if (cachedIndexSet == null) {
			cachedIndexSet = new int[size];
			for (int i = variables.length; i-- != 0;)
				cachedIndexSet[i] = i;
		}
		return cachedIndexSet;
	}
	public boolean remove(N var) {
		int i = BinarySearchUtils.binarySearch(variableIds, var.getId(), 0, size);
		if (i < 0) 
			return false;

		size--;
		cachedIndexSet = null;
		if (i != size) {
			System.arraycopy(variables, i + 1, variables, i, size - i);
			System.arraycopy(values, i + 1, values, i, size - i);
		}
		return true;
	}

	public boolean hasVariable(N v) {
		return BinarySearchUtils.binarySearch(variableIds, v.getId(), 0, size) >= 0;
	}
	public boolean containsAll(Collection<N> vv) {
		IntArray variableIds = this.variableIds;
		for (N v : vv)
			if (BinarySearchUtils.binarySearch(variableIds, v.getId(), 0, size) < 0) return false;
		return true;
	}
	@SuppressWarnings("unchecked")
	public void put(N var, int val) {
		int i = BinarySearchUtils.binarySearch(variableIds, var.getId(), 0, size);
		if (i < 0) {
			i = - 1 - i;   
			N[] varDest;
			int[] valDest;
			if (variables.length == size) {
				int newLen = size < 6 ? size + 1 : (int)(size * 1.6);
				varDest = (N[])new Variable[newLen];
				valDest = new int[newLen];
			} else {
				varDest = variables;
				valDest = values;
			}
			if (i != 0) {
				System.arraycopy(variables, 0, varDest, 0, i);
				System.arraycopy(values, 0, valDest, 0, i);
			}
			if (i < size) {
				System.arraycopy(variables, i, varDest, i + 1, size - i);
				System.arraycopy(values, i, valDest, i + 1, size - i);
			}
			variables = varDest;
			values = valDest;
			size++;
			cachedIndexSet = null;
		}
		variables[i] = var;
		values[i] = val;
	}
	public N getVariableAt(int i) { 
		if (i >= size) throw new ArrayIndexOutOfBoundsException(i);
		return variables[i]; 
	}
	public int getValueAt(int i) { 
		if (i >= size) throw new ArrayIndexOutOfBoundsException(i);
		return values[i]; 
	}
	public void setValueAt(int i, int v) { 
		if (i >= size) throw new ArrayIndexOutOfBoundsException(i);
		values[i] = v; 
	}
	public int indexOf(N v) {
		return BinarySearchUtils.binarySearch(variableIds, v.getId());
	}
	public int size() { return size; }
	public String toString() {
		StringBuffer b = new StringBuffer("Values {");
		for (int i = 0, len = size; i < len; i++) {
			if (i != 0) b.append(", ");
			b.append(variables[i].getName() + " = "+values[i]);
		}
		b.append("}");
		return b.toString();
	}

	public static void main(String[] args) {
        List<Variable> variables = new ArrayList<Variable>();
        variables.add(DefaultVariable.createVariable("x", 4));
        variables.add(DefaultVariable.createVariable("y", 4));
        
        Valuation<Variable> valuation = new DummyValuation<Variable>(10);
        int i = 1;
        for (Variable v : variables) {
            valuation.put(v, i++);
        }
        System.out.println(valuation);
        for (Variable v : variables) {
            valuation.remove(v);
        }
        System.out.println(valuation);
        for (Variable v : variables) {
            valuation.put(v, i++);
        }
        System.out.println(valuation);
        for (Variable v : variables) {
            System.out.println(v + " = " + valuation.get(v));
        }
        VariableValuesEnumerator<Variable> enumerator = new VariableValuesEnumerator<Variable>(valuation, variables);
        do {
            System.out.println(valuation);
        } while (enumerator.next());

    }
	@Override
	public Valuation<N> deriveNewValuation() {
		DummyValuation<N> val = new DummyValuation<N>(size);
		for (int i = 0; i < size; i++) {
			val.put(getVariableAt(i), getValueAt(i));
		}
		
		return val;
	}

/*
	@Override
	public Iterator<Pair<N, Integer>> iterator() {
		class It implements Iterator<Pair<N, Integer>> {
			int i = -1;
			
			@Override
			public boolean hasNext() {
				return i < size - 1;
			}

			@Override
			public Pair<N, Integer> next() {
				i++;
				return new Pair<N, Integer>(variables[i], values[i]);
			}

			@Override
			public void remove() {
				throw new UnsupportedOperationException();
			}
			
		}
		return new It();
	}
*/
}
