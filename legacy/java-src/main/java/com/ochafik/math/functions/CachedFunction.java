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

import java.lang.ref.PhantomReference;
import java.lang.ref.SoftReference;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Set;

public class CachedFunction<N extends Variable> implements Function<N> {
	final Function<N> function;
	TabulatedFunction<N> table;
	final boolean hasTable;
	private static final int 
		MAX_TABULATED_FUNCTION_SIZE = 1000000,
		MIN_TABULATED_FUNCTION_SIZE = 0;
	
	public CachedFunction(Function<N> function) {
		if (function == null) 
			throw new NullPointerException();
		this.function = function;
		int tableSize = TabulatedFunction.computeTableSize(function.getArgumentNames());
		hasTable = 
			tableSize <= MAX_TABULATED_FUNCTION_SIZE &&
			tableSize >= MIN_TABULATED_FUNCTION_SIZE;
			
	}
	public double eval(Valuation<N> valuation) throws FunctionException {
		if (hasTable) {
			
			if (table == null)
				table = new TabulatedFunction<N>(function);
				
			return table.eval(valuation);
		} else {
			return function.eval(valuation);
		}
	}
	public List<N> getArgumentNames() {
		return function.getArgumentNames();
	}
	/*
	public Function<N> instantiate(Valuation<N> valuation) throws FunctionException {
		if (hasTable) {
			updateTable();
			return table.instantiate(valuation);
		} else {
			return function.instantiate(valuation);
		}
	}*/
	public void flushCachedData() {
		table = null;
		function.flushCachedData();
	}
	public String toString() {
		return "[" + function + "]";
	}
	public Collection<Function<N>> getChildren() {
		return Collections.singleton(function);
	}
}
