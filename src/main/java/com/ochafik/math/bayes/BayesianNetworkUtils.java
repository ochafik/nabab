package com.ochafik.math.bayes;

import java.util.Map;

import com.ochafik.math.functions.FastFatValuation;
import com.ochafik.math.functions.Function;
import com.ochafik.math.functions.FunctionException;
import com.ochafik.math.functions.Valuation;
import com.ochafik.math.functions.Variable;

public class BayesianNetworkUtils {
	
	public static <N extends Variable> Valuation<Variable> getKnownValues(BayesianNetwork network) {
		Valuation<Variable> values = new FastFatValuation<Variable>(network.getVariables().size());
		for (Map.Entry<Variable, Map<Integer, Float>> e : network.getObservations().entrySet()) {
			Variable variable = e.getKey();
			for (Map.Entry<Integer,Float> obs : e.getValue().entrySet()) {
				if (obs.getValue() == 1) {
					// Found useful observation ! That's cool...
					values.put(variable, obs.getKey());
				}
			}
		}
		return values;
	}
	public static <N extends Variable> double[] getProbabilities(N variable, Function<N> f, Valuation<N> knownValues) throws FunctionException {
		int nValues = variable.getValues().size();
		double[] probabilities = new double[nValues];
		
		//Valuation<N> values = new DefaultValuation<N>(1);
		//Map<Variable,Integer> values = new TreeMap<Variable, Integer>();
		//if (knownValues.hasVariable(variable)) {
		//	throw new RuntimeException("Variable requested already known !");
		//}
		boolean hadIt = knownValues.hasVariable(variable);
		
		for (int iVal = nValues; iVal-- != 0;) {
			knownValues.put(variable, iVal);
			probabilities[iVal] = f.eval(knownValues);
		}
		
		if (!hadIt)
			knownValues.remove(variable);
		
		double total = 0;
		for (double p : probabilities) 
			total += p;

		if (Math.abs(total - 1) > 1e-10) {
			if (total == 0) {
				for (int iVal = nValues; iVal-- != 0;) {
					knownValues.put(variable, iVal);
					probabilities[iVal] = f.eval(knownValues);
				}
			} else {
				for (int i = probabilities.length; i-- != 0;) 
					probabilities[i] /= total;
			}
		}
	
		return probabilities;
	}
	
}
