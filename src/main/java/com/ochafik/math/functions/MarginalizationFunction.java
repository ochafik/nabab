package com.ochafik.math.functions;

import static com.ochafik.math.functions.Functions.add;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

import com.ochafik.math.bayes.BayesianNetworkUtils;
import com.ochafik.util.string.StringUtils;
import com.sun.tools.javac.tree.TreeMaker;

public class MarginalizationFunction<N extends Variable> implements Function<N> {
	Function<N> function;
	Collection<N> variables;

	List<N> argumentNames;
	
	public MarginalizationFunction(Function<N> function, Collection<N> variables) {
		if (function == null) 
			throw new NullPointerException();

		if (variables.isEmpty())
			throw new RuntimeException("No variables for this marginalization !");

		this.function = function;
		this.variables = variables;
		argumentNames = new ArrayList<N>(function.getArgumentNames());
		argumentNames.removeAll(variables);
		if (argumentNames.isEmpty())
			throw new IllegalArgumentException("Constant marginalization !");
	}
	public double eval(Valuation<N> values) throws FunctionException {
		
		//if (!values.containsAll(argumentNames))
		//	throw new RuntimeException("Not enough variables for marginalization : expected " + argumentNames + ", got " + values);
		
		if (false && values.containsAll(function.getArgumentNames())) {
			return function.eval(values);
		} else {
			//Collection<N> variablesToMarginalize = new ArrayList<N>(variables);
			/*
			for (int i = values.size(); i-- != 0;) {
				N v = values.getVariableAt(i);
				if (v == null)
					continue;
				variablesToMarginalize.remove(values.getVariableAt(i));
			}
			*/
			//Valuation<N> derivedValuation = values.deriveNewValuation();
			VariableValuesEnumerator<N> enumerator = new VariableValuesEnumerator<N>(values, variables);//ToMarginalize);
			double total = 0;
			do {
				double v = function.eval(values);
				total += v;
			} while (enumerator.next());
			enumerator.clear();
			//System.out.println("  value = " + values);
			//System.out.println("derived = " + derivedValuation);
			return total;
		}
	}
	public List<N> getArgumentNames() {
		return argumentNames;
	}
	/*
	public Function<N> instantiate(Valuation<N> values) throws FunctionException {
		//ArrayList<>
		return getMarginalization(values).instantiate(values);
	}*/
	@Override
	public String toString() {
		StringBuffer b = new StringBuffer("margin(");
		b.append(function);
		b.append(", {");
		boolean first = true;
		for (N v : variables) {
			if (first) first = false;
			else b.append(", ");
			b.append(v);
		}
		b.append("})");
		return b.toString();
	}
	public void flushCachedData() {
		//marginalization = null;
		function.flushCachedData();
	}
	public Collection<Function<N>> getChildren() {
		return Collections.singleton(function);
	}
}
