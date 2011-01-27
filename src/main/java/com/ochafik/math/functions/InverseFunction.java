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
import java.util.Collections;
import java.util.List;
import java.util.Set;


class InverseFunction<N extends Variable> implements Function<N> {
	Function<N> function;	
	
	public InverseFunction(Function<N> function) {
		this.function = function;
	}
	public double eval(Valuation<N> valuation) throws FunctionException {
		double v = function.eval(valuation);
		/*if (v == 0) {
			v = function.eval(valuation);
			//new IllegalArgumentException("Zero to inverse").printStackTrace();
		}*/
			//throw new IllegalArgumentException("Zero to inverse");
		if (Double.isNaN(v) || Double.isInfinite(v))
			return 0;
		
		return 1 / v;
	}
	public List<N> getArgumentNames() {
		return function.getArgumentNames();
	}
	/*
	public Function<N> instantiate(Valuation<N> valuation) throws FunctionException {
		return new InverseFunction<N>(function.instantiate(valuation));
	}*/
	public String toString() {
		return "1 / ("+function+")";
	}
	public void flushCachedData() {
		function.flushCachedData();
	}
	public Collection<Function<N>> getChildren() {
		return Collections.singleton(function);
	}
}
