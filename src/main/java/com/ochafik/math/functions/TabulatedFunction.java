package com.ochafik.math.functions;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Set;

import com.ochafik.util.string.StringUtils;


public class TabulatedFunction<N extends Variable> implements Function<N> {
	double[] doubleValues;
	List<N> arguments;
	String name;
	
	public TabulatedFunction(List<N> arguments) {
		this.arguments = arguments;
		int size = 1;
		for (N p : arguments) {
			size *= p.getValues().size();
		}
		//System.out.println(size * 8);
		doubleValues = new double[size];
	}
	
	public static <N extends Variable> int computeTableSize(List<N> arguments) {
		int size = 1;
		for (N p : arguments) {
			size *= p.getValues().size();
		}
		return size;
	}
	
	public double difference(TabulatedFunction<N> other) {
		if (other.getArgumentNames().size() != getArgumentNames().size() || !other.getArgumentNames().containsAll(getArgumentNames()))
			throw new IllegalArgumentException("Table arguments do not match : " + getArgumentNames() + " vs. " + other.getArgumentNames());
		
		double total = 0;
		double[] doubleValues = this.doubleValues, otherDoubleValues = other.doubleValues;
		for (int i = doubleValues.length; i-- != 0;) {
			double d = doubleValues[i] - otherDoubleValues[i];
			total += d * d;
		}
			
		return Math.sqrt(total / doubleValues.length);
	}
	
	public TabulatedFunction(Function<N> model) throws FunctionException {
		this.arguments = model.getArgumentNames();
		int size = computeTableSize(arguments);
		//if (size > 10000) {
		//	size = size;
		//}
		//System.out.println("TabulatedFunction: asking for new double[" + size + "]");
		doubleValues = new double[size];
		Valuation<N> values = new FastFatValuation<N>(arguments.size() + 100);
		VariableValuesEnumerator<N> instantiator = new VariableValuesEnumerator<N>(values, arguments);
		int[] variableIndices = getVariableIndices(values);
		do {
			set(values, model.eval(values), variableIndices);
		} while (instantiator.next());
	}
	public TabulatedFunction(List<N> arguments, double[] doubleValues) {
		this.doubleValues = new double[doubleValues.length];
		this.arguments = arguments;
		System.arraycopy(doubleValues, 0, this.doubleValues, 0, doubleValues.length);
	}
	public String getName() {
		return name;
	}
	public void setName(String name) {
		this.name = name;
	}
	public int getIndex(Valuation<N> argumentValues) throws MissingArgumentsException {
		int n = arguments.size();
		int lastDelta = 1;
		int offset = 0;
		for (int i = n; i-- != 0;) {
			N argument = arguments.get(i);
			int iVal = argumentValues.get(argument);
			int nVals = argument.getValues().size();
			
			//if (iVal == null) throw new MissingArgumentsException("Missing value for argument "+argument);
			if (iVal >= nVals) throw new IllegalArgumentException("Bad value for argument "+argument);
			offset += iVal * lastDelta;
			lastDelta *= nVals;
		}
		return offset;
	}
	public int getIndex(Valuation<N> argumentValues, int[] variableIndices) throws MissingArgumentsException {
		int n = variableIndices.length;
		int lastDelta = 1;
		int offset = 0;
		for (int i = n; i-- != 0;) {
			N argument = arguments.get(i);
			int iVal = argumentValues.getValueAt(variableIndices[i]);
			int nVals = argument.getValues().size();
			
			//if (iVal == null) throw new MissingArgumentsException("Missing value for argument "+argument);
			if (iVal >= nVals) throw new IllegalArgumentException("Bad value for argument "+argument);
			offset += iVal * lastDelta;
			lastDelta *= nVals;
		}
		return offset;
	}
	public int[] getVariableIndices(Valuation<N> argumentValues) throws MissingArgumentsException {
		int n = arguments.size();
		int[] indices =  new int[n];
		for (int i = n; i-- != 0;) {
			N argument = arguments.get(i);
			indices[i] = argumentValues.indexOf(argument);
		}
		return indices;
	}
	
	public TabulatedFunction<N> clone() {
		throw new UnsupportedOperationException();
	}
	public double eval(Valuation<N> argumentValues) throws MissingArgumentsException {
		return doubleValues[getIndex(argumentValues)];
	}
	public void set(Valuation<N> argumentValues, double value) throws MissingArgumentsException {
		doubleValues[getIndex(argumentValues)] = value;
	}
	public void set(Valuation<N> argumentValues, double value, int[] variableIndices) throws MissingArgumentsException {
		doubleValues[getIndex(argumentValues, variableIndices)] = value;
	}
	public List<N> getArgumentNames() {
		return arguments;
	}
	/*
	public Function<N> instantiate(Valuation<N> values) throws MissingArgumentsException {
		List<N> missingArgs = new ArrayList<N>(values.size());
		
		for (N var : arguments) {
			if (!values.hasVariable(var)) {
				missingArgs.add(var);
			}
		}
		if (missingArgs.isEmpty()) {
			return Functions.constant(eval(values));
		}
		TabulatedFunction<N> ret = new TabulatedFunction<N>(missingArgs);
		ret.setName(getName());// + " / " + values);
		
		VariableValuesEnumerator<N> missingArgsInst = new VariableValuesEnumerator<N>(values, missingArgs);
		int[] variableIndices = ret.getVariableIndices(values);
		do {
			ret.set(values, eval(values), variableIndices);
		} while (missingArgsInst.next());
		
		missingArgsInst.clear();
		
		return ret;
	}*/
	
	public String toString(List<N> variables) throws FunctionException {
		return toString(variables, false);
	}
	public String toString(List<N> variables, boolean justValues) throws FunctionException {
		List<N> parameters = new ArrayList<N>(arguments);
		parameters.removeAll(variables);
		
		StringBuffer b= new StringBuffer();
		
		if (!justValues) {
			b.append("P("+StringUtils.implode(parameters, ", ")+") = ");
			
			if (parameters.isEmpty()) {
				b.append("constant");
			} else {
				b.append("f(");
				b.append(StringUtils.implode(parameters, ", "));
				b.append(")");
			}
			b.append("\n");
		}
		Valuation<N> values = new DummyValuation<N>(variables.size());
		
		//boolean noParams = parameters.isEmpty();
		
		VariableValuesEnumerator<N> parametersInstantiator = new VariableValuesEnumerator<N>(values, parameters);
		do {
			b.append("\t");
			boolean first = true;
			VariableValuesEnumerator<N> variablesInstantiator = new VariableValuesEnumerator<N>(values, variables);
			do {
				if (first) first = false;
				else b.append(", ");
				b.append(eval(values));
			} while (variablesInstantiator.next());
			
			b.append("\t\t% ");
			first = true;
			for (N parameter : parameters) {
				if (first) first = false;
				else b.append(", ");
				b.append(parameter+" = "+parameter.getValues().get(values.get(parameter)));
			}
			b.append("\n");
		} while (parametersInstantiator.next());
		return b.toString();
	}
	@Override
	public String toString() {
		return name == null ? "table("+StringUtils.implode(arguments, ", ")+")" : "p("+name+" = f("+StringUtils.implode(arguments, ", ")+"))";
		//return "p("+name+")";
	}
	public void flushCachedData() {}

	public Collection<Function<N>> getChildren() {
		return null;
	}

	public void multiply(double d) {
		for (int i = doubleValues.length; i-- != 0;)
			doubleValues[i] *= d;
	}
}
