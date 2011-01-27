package com.ochafik.math.functions;

class SumFunction<N extends Variable> extends CompositeFunction<N> {
	double constant = 0.0;
	
	public SumFunction(int initialCapacity) {
		super(initialCapacity);
	}
	public void append(double amount) {
		if (Double.isInfinite(amount) || Double.isNaN(amount)) {
			throw new IllegalArgumentException();
		}
		constant += amount;
	}
	public double getConstant() {
		return constant;
	}
	@Override
	protected String getSeparatorString() {
		return "+";
	}
	public double eval(Valuation<N> values) throws FunctionException {
		double total = constant;
		for (Function<N> f : getFunctionList()) {
			double v = f.eval(values);
			if (Double.isNaN(v) || Double.isInfinite(v)) {
				return v;
				//new ArithmeticException("NaN in an expression").printStackTrace();
			} else {
				total += v;
			}
		}
		return total;
	}
	/*
	public Function<N> instantiate(Valuation<N> values) throws FunctionException {
		Function<N> total = new ConstantFunction<N>(constant);
		for (Function<N> f : getFunctionList()) {
			if (values.containsAll(f.getArgumentNames())) {
				total = Functions.add(total, new ConstantFunction<N>(f.eval(values)));
			} else {
				total = Functions.add(total, f.instantiate(values));
			}
		}
		return total;
	}*/
	public String toString() {
		String sup = super.toString();
		if (constant == 0) {
			return sup.equals("") ? "0" : sup;
		} else {
			return sup.equals("") ? constant+"" : (constant + " " + getSeparatorString() + " " + sup); 
		}
	}
	
}
