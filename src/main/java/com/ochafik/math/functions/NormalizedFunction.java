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
import java.util.Collections;
import java.util.List;
import java.util.Set;

public class NormalizedFunction<N extends Variable> implements Function<N> {
	Function<N> function;
	TabulatedFunction<N> table;
	double norm;
	
	public NormalizedFunction(Function<N> function, double norm) {
		this.function = function;
		this.norm = norm;
		/*norm = 1;
		for (Variable v : norm) {
			if (!function.getArgumentNames().contains(v))
				throw new IllegalArgumentException("Variable " + v + " not in function !");
			norm *= v.getValueCount();
		}*/
	}
	
	@Override
	public String toString() {
		return "normalized(" + function + ")";
	}

	@Override
	public double eval(Valuation<N> valuation) throws FunctionException {
		if (table == null) {
			table = new TabulatedFunction<N>(function);
			
			int nTotalVariables = 0;
			
			for (N var : function.getArgumentNames()) {
				int i = var.getId();
				if (i >= nTotalVariables)
					nTotalVariables = i + 1;
			}
			//nTotalVariables = DefaultVariable.getMaxId() + 1;
				
			Valuation<N> normalizationValuation = new FastFatValuation<N>(nTotalVariables);
			VariableValuesEnumerator<N> enumerator = new VariableValuesEnumerator<N>(normalizationValuation, function.getArgumentNames());
			double sum = 0;
			do {
				double v = table.eval(normalizationValuation);
				sum += v;
			} while (enumerator.next());
			
			if (sum != 0 && sum != norm) {
				table.multiply(norm / sum);
			}
		}
		return table.eval(valuation);
	}



	
	public static <N extends Variable> double sumValues(List<N> variables, Function<N> function, int nTotalVariables) throws FunctionException {
		Valuation<N> valuation = new FastFatValuation<N>(nTotalVariables);
		VariableValuesEnumerator<N> enumerator = new VariableValuesEnumerator<N>(valuation, variables);
		double total = 0;
		do {
			double v = function.eval(valuation);
			total += v;
		} while (enumerator.next());
		return total;
	}
	
	@Override
	public void flushCachedData() {
		table = null;
		function.flushCachedData();
	}

	@Override
	public List<N> getArgumentNames() {
		return function.getArgumentNames();
	}

	@Override
	public Collection<Function<N>> getChildren() {
		return Collections.singleton(function);
	}
}
