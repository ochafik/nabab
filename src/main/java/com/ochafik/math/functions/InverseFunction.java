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
