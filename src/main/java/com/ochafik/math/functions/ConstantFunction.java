package com.ochafik.math.functions;

import java.util.Arrays;
import java.util.Collection;
import java.util.Collections;
import java.util.List;
import java.util.Set;

class ConstantFunction<N extends Variable> implements Function<N> {
	double constant;
	
	public ConstantFunction(double constant) {
		//if (Double.isInfinite(constant) || Double.isNaN(constant))
			//throw new IllegalArgumentException("NaN constant");
		//	new IllegalArgumentException("NaN constant").printStackTrace();
		
		this.constant = constant;
	}
	public double getConstant() {
		return constant;
	}
	public double eval(Valuation<N> valuation) throws FunctionException {
		return constant;
	}
	@SuppressWarnings("unchecked")
	public List<N> getArgumentNames() {
		return Collections.EMPTY_LIST;
	}
	public Function<N> instantiate(Valuation<N> valuation) {
		return this;
	}
	public String toString() {
		return constant+"";
	}
	public void flushCachedData() {}
	public Collection<Function<N>> getChildren() {
		return null;
	}
}
