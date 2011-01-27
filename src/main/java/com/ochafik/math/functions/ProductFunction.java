package com.ochafik.math.functions;

class ProductFunction<N extends Variable> extends CompositeFunction<N> {
	double constant = 1.0;
	
	public void append(double amount) {
		//if (Double.isInfinite(amount) || Double.isNaN(amount)) {
		//	new IllegalArgumentException("NaN in ProductFunction.append").printStackTrace();
		//}
		constant *= amount;
	}
	public double getConstant() {
		return constant;
	}
	@Override
	protected String getSeparatorString() {
		return "*";
	}
	public double eval(Valuation<N> values) throws FunctionException {
		if (constant == 0)
			return 0;
		
		double total = constant;
		for (Function<N> f : getFunctionList()) {
			double v = f.eval(values);
			if (v == 0)
				return 0;
			if (Double.isNaN(v) || Double.isInfinite(v)) {
				return v;
			}
			//if (Double.isNaN(v) || Double.isInfinite(v)) {
			//	new ArithmeticException("NaN in an expression").printStackTrace();
			//} else {
				total *= v;
			//}
		}
		return total;
	}
	/*
	public Function<N> instantiate(Valuation<N> values) throws FunctionException {
		Function<N> total = new ConstantFunction<N>(constant);
		for (Function<N> f : getFunctionList()) {
			if (values.containsAll(f.getArgumentNames())) {
				total = Functions.multiply(total, new ConstantFunction<N>(f.eval(values)));
			} else {
				total = Functions.multiply(total, f.instantiate(values));
			}
		}
		return total;
	}*/
	public String toString() {
		String sup = super.toString();
		if (constant == 1) {
			return sup.equals("") ? "1" : sup;
		} else if (constant == 0) {
			return "0";
		} else {
			return sup.equals("") ? constant+"" : constant + " " + getSeparatorString() + " " + sup; 
		}
	}	
}
