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
