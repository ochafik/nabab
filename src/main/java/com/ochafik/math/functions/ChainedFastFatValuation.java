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
import java.util.NoSuchElementException;

public class ChainedFastFatValuation<N extends Variable> extends FastFatValuation<N> {
	FastFatValuation<N> parent;
	
	public ChainedFastFatValuation(FastFatValuation<N> parent) {
		super(parent.values.length);
		this.parent = parent;
	}
	
	@Override
	public int get(N var) {
		if (super.hasVariable(var))
			return super.get(var);
		return parent.get(var);
	}

	@Override
	public int getValueAt(int i) {
		if (super.getVariableAt(i) != null)
			return super.getValueAt(i);
		
		return parent.getValueAt(i);
	}

	@Override
	public N getVariableAt(int i) {
		N variable = super.getVariableAt(i);
		return variable == null ? parent.getVariableAt(i) : variable;
	}

	@Override
	public boolean hasVariable(N v) {
		return super.hasVariable(v) || parent.hasVariable(v);
	}

	@Override
	public int indexOf(N v) {
		int i = super.indexOf(v);
		return i < 0 ? parent.indexOf(v) : i;
	}
	
}
