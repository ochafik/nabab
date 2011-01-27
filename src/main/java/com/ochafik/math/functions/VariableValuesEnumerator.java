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

import java.util.Collection;
import java.util.LinkedList;

import com.ochafik.util.listenable.Pair;

public class VariableValuesEnumerator<N extends Variable> {
    Valuation<N> target;
    Collection<N> variables;
    int[] variableIndices;
    LinkedList<Pair<N, Integer>> savedValues;
    
    public VariableValuesEnumerator(Valuation<N> target, Collection<N> variables) {
        this.target = target;
        this.variables = variables;

        reset();
    }
    public void reset() {
    	savedValues = new LinkedList<Pair<N,Integer>>();
    	
    	int n = 0;
        for (N v : variables) {
        	if (target.hasVariable(v))
        		savedValues.add(new Pair<N, Integer>(v, target.get(v)));
            target.put(v, 0);
            n++;
        }
        
        variableIndices = new int[n];
        int i = 0;
        for (N v : variables) 
            variableIndices[i++] = target.indexOf(v);
    }
    public int getCombinationCount() {
    	int c = 1;
    	for (N v : variables)
            c *= v.getValues().size();
        return c;
    }
    public boolean next() {
    	for (int iIndex = 0, nIndices = variableIndices.length; iIndex < nIndices; iIndex++) {
    		int index = variableIndices[iIndex];
    	    int value = target.getValueAt(index);
            if (value < target.getVariableAt(index).getValues().size() - 1) {
                target.setValueAt(index, value + 1);
                return true;
            } else {
                assert value == target.getVariableAt(index).getValues().size() - 1;
                target.setValueAt(index, 0);
            }
        }
        return false;
    }
    public void clear() {
    	for (N v : variables)
    		target.remove(v);
    	
    	if (savedValues != null) {
	    	for (Pair<N, Integer> s : savedValues)
	    		target.put(s.getFirst(), s.getSecond());
    	}
    	/*
        for (N v : variables) {
        	//Integer savedValue = savedValues.get(v);
        	//if (savedValue == null)
        		target.remove(v);
        	//else
        	//	target.put(v, savedValue);
        }*/
    	savedValues = null;
        variableIndices = null;
    }
}
