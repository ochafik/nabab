package com.ochafik.math.functions;

import java.util.Collection;
import java.util.Iterator;
import java.util.LinkedList;
import java.util.List;
import java.util.Set;

public class Functions {
	static boolean safe = false;
	public static <N extends Variable> Function<N> constant(double value) {
		return new ConstantFunction<N>(value);
	}
	public static <N extends Variable> Function<N> invert(Function<N> f) throws FunctionException {
		return new InverseFunction<N>(f);
	}
	@SuppressWarnings("unchecked")
	public static final Function nullFunction = new ConstantFunction(0);
	
	@SuppressWarnings("unchecked")
	public static <N extends Variable> Function<N> multiply(Function<N> f1, Function<N> f2) throws FunctionException {
		if (safe) {
			ProductFunction<N> ret = new ProductFunction<N>();
			ret.append(f1);
			ret.append(f2);
			return ret;
		} else {
			if (f1 instanceof ProductFunction) {
				ProductFunction<N> pf1 = (ProductFunction<N>)f1;
				ProductFunction<N> ret = new ProductFunction<N>();
				ret.append(pf1.getConstant());
				for (Function<N> f : pf1.getFunctionList()) ret.append(f);
				
				if (f2 instanceof ProductFunction) {
					ProductFunction<N> pf2 = (ProductFunction<N>)f2;
					ret.append(pf2.getConstant());
					for (Function<N> f : pf2.getFunctionList()) {
						ret.append(f);
					}
				} else if (f2 instanceof ConstantFunction) {
					ret.append(((ConstantFunction<N>)f2).getConstant());
				} else {
					ret.append(f2);
				}
				return ret;
			} else if (f2 instanceof ProductFunction) {
				return multiply(f2, f1);
			}
			return multiply(multiply(new ProductFunction<N>(), f1), f2);
		}
	}
	public static <N extends Variable> Function<N> add(Function<N> f1, Function<N> f2) throws FunctionException {
		if (safe) {
			SumFunction<N> ret = new SumFunction<N>(2);
			ret.append(f1);
			ret.append(f2);
			return ret;
		} else {
			if (f1 instanceof SumFunction) {
				SumFunction<N> pf1 = (SumFunction<N>)f1;
				SumFunction<N> pf2 = (f2 instanceof SumFunction) ? (SumFunction<N>)f2 : null;				
				
				SumFunction<N> ret = new SumFunction<N>(pf1.getFunctionList().size() + (pf2 == null ? 1 : pf2.getFunctionList().size()));
				ret.append(pf1.getConstant());
				for (Function<N> f : pf1.getFunctionList()) 
					ret.append(f);
				
				if (pf2 != null) {
					ret.append(pf2.getConstant());
					for (Function<N> f : pf2.getFunctionList())
						ret.append(f);
					
				} else if (f2 instanceof ConstantFunction) {
					ret.append(((ConstantFunction<N>)f2).getConstant());
				} else {
					ret.append(f2);
				}
				return ret;
			} else if (f2 instanceof SumFunction) {
				return add(f2, f1);
			}
			SumFunction<N> ret = new SumFunction<N>(2);
			ret.append(f1);
			ret.append(f2);
			return ret;
			//return add(add(new SumFunction<N>(1), f1), f2);
		}
	}
	public static <N extends Variable> Function<N> marginalize(Function<N> f, Collection<N> variablesToMarginalizeOut) throws FunctionException {
		if (variablesToMarginalizeOut.isEmpty()) {
			return f;
		} else {
			return new MarginalizationFunction<N>(f, variablesToMarginalizeOut);
		}
	}
	public static <N extends Variable> TabulatedFunction<N> table(Function<N> f) throws FunctionException {
		return //f;
			f instanceof TabulatedFunction ? (TabulatedFunction<N>)f : new TabulatedFunction<N>(f);
	}
	public static <N extends Variable> Function<N> cache(Function<N> f) throws FunctionException {
		return f instanceof CachedFunction ? f : new CachedFunction<N>(f);
	}
	public static <N extends Variable> Function<N> normalize(Function<N> function, double norm) throws FunctionException {
		return new NormalizedFunction<N>(function, norm);
	}
}
