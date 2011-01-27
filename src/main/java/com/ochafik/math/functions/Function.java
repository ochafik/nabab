package com.ochafik.math.functions;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Set;


public interface Function<N extends Variable> {
	public List<N> getArgumentNames();
	public Collection<Function<N>> getChildren();

	public double eval(Valuation<N> valuation) throws FunctionException;
	
	public void flushCachedData();
	
}
