package com.ochafik.math.bayes;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.ochafik.math.functions.Function;
import com.ochafik.math.functions.FunctionException;
import com.ochafik.math.functions.Functions;
import com.ochafik.math.functions.TabulatedFunction;
import com.ochafik.math.functions.Valuation;
import com.ochafik.math.functions.Variable;
import com.ochafik.math.graph.Graph;
import com.ochafik.math.graph.Graph.OptimizationPreference;
import com.ochafik.math.graph.impl.DefaultGraph;
import com.ochafik.util.listenable.CollectionEvent;
import com.ochafik.util.listenable.CollectionListener;
import com.ochafik.util.listenable.ListenableCollections;
import com.ochafik.util.listenable.ListenableMap;
import com.ochafik.util.listenable.ListenableSet;
import com.ochafik.util.string.StringUtils;


public class DefaultBayesianNetwork implements BayesianNetwork {
	final ListenableMap<Variable, Function<Variable>> definitions;
	final ListenableMap<Variable, Map<Integer, Float>> observations;
	
	final ListenableSet<Variable> variables;
	ListenableSet<Variable> unmodifiableVariables;
	
	final ListenableMap<Variable, Function<Variable>> inferences;
	DefaultGraph<Variable> graph;
	
	final Map<String, Object> attributes = new HashMap<String, Object>();
	
	final Map<Variable, Function<Variable>> likelinesses;
	final Map<Variable, FusionedDefinition> fusionedDefinitions;
	
	Map<Variable, List<Function<Variable>>> inferredDefinitions;
		
	public DefaultBayesianNetwork(int capacity) {
		definitions = ListenableCollections.listenableMap(new HashMap<Variable, Function<Variable>>(capacity));
		observations = ListenableCollections.listenableMap(new HashMap<Variable, Map<Integer, Float>>(capacity));
		variables = ListenableCollections.listenableSet(new HashSet<Variable>(capacity));
		inferences = ListenableCollections.listenableMap(new HashMap<Variable, Function<Variable>>(capacity));
		fusionedDefinitions = new HashMap<Variable, FusionedDefinition>(capacity);
		likelinesses = new HashMap<Variable, Function<Variable>>(capacity);
		
		definitions.keySet().addCollectionListener(new CollectionListener<Variable>() {
			public void collectionChanged(CollectionEvent<Variable> e) {
				
				switch (e.getType()) {
				case ADDED:
					for (Variable variable : e.getElements()) {
						variables.add(variable);
						fusionedDefinitions.put(variable, new FusionedDefinition(variable, definitions, likelinesses));
					}
					break;
				case REMOVED:
					for (Variable variable : e.getElements()) {
						variables.remove(variable);
						fusionedDefinitions.remove(variable);
					}
					break;
				case UPDATED:
					for (Variable variable : e.getElements()) {
						fusionedDefinitions.get(variable).flushCachedData();
					}
					break;
				}
				// TODO only invalidate inferred values of variables that are not D-separated from e.getElement() by the current set of observations 
				//inferredVariables.clear();
				inferences.clear();
				invalidateGraph();
			}
		});
		observations.keySet().addCollectionListener(new CollectionListener<Variable>() {
			public void collectionChanged(CollectionEvent<Variable> e) {
				//invalidateInferences();
				switch (e.getType()) {
				case REMOVED:
					for (Variable variable : e.getElements()) {
						likelinesses.remove(variable);
					}
					break;
				case ADDED:
				case UPDATED:
					for (Variable variable : e.getElements()) {
						// TODO handle incomplete observations here
						likelinesses.put(variable, new LikelinessFunction(variable, observations.get(variable)));
					}
					break;
				}
				inferences.clear();
				// invalidate inferences
				//for (Variable v : getVariables()) {
					//if (Baye.)
				//}
				
				// Force update events for all the inferences, which cached data is flushed (so that all the functions's algebraic tree are recomputed, down to the fusioned definition which takes account of the new likeliness
				// TODO only update dependent variables
				//Map<Variable, Function<Variable>> temp = new HashMap<Variable, Function<Variable>>(inferences);
				//inferences.keySet().clear();
				//inferences.clear();
				//for (Function<Variable> f : temp.values()) f.flushCachedData();
				//for (Function<Variable> f : temp.values()) f.flushCachedData();
				//inferences.putAll(temp);
			}
		});
		
	}
	public ListenableMap<Variable, Function<Variable>> getInferences() {
		return ListenableCollections.unmodifiableMap(inferences);
	}
	public ListenableMap<Variable, Function<Variable>> getDefinitions() {
		return definitions;
	}
	public ListenableMap<Variable, Map<Integer, Float>> getObservations() {
		return observations;
	}
	public Object getAttribute(String attrName) {
		return attributes.get(attrName);
	}
	public void setAttribute(String attrName, Object value) {
		attributes.put(attrName, value);
	}
	
	protected void updateGraph() {
		if (graph == null) {
			List<Variable> nodeList = new ArrayList<Variable>(variables);
			
			graph = new DefaultGraph<Variable>(nodeList,true);
			
			for (Variable node : nodeList) {
				int nodeIndex = nodeList.indexOf(node);
				
				for (Variable variable : definitions.get(node).getArgumentNames()) {
					if (!variable.equals(node)) {
						int iCause = nodeList.indexOf(variable);
						if (iCause < 0) throw new RuntimeException("variableSet is not up to date !!!");
						graph.addEdge(iCause, nodeIndex);
					}
				}
			}
		}
	}
	protected void invalidateGraph() {
		graph = null;
		inferredDefinitions = null;
	}
	public Graph<Variable> getGraph() {
		updateGraph();
		return graph;//GraphUtils.unmodifiableGraph(graph);
	}
	
	public ListenableSet<Variable> getVariables() {
		if (unmodifiableVariables == null) {
			unmodifiableVariables = ListenableCollections.unmodifiableSet(variables);
		}
		return unmodifiableVariables;
	}
	/*
	public void invalidateInferences() {
		for (Map.Entry<Variable, List<Function<Variable>>> e : inferredDefinitions.entrySet()) {
			for (Function<Variable> f : e.getValue()) {
				f.flushCachedData();
			}
		}
		for (Map.Entry<Variable, FusionedDefinition> e : fusionedDefinitions.entrySet()) {
			e.getValue().flushCachedData();
		}
		for (Map.Entry<Variable, Function<Variable>> e : definitions.entrySet()) {
			e.getValue().flushCachedData();
		}
		inferences.keySet().clear();
	}*/
	public void infer() throws FunctionException {
		
		if (inferredDefinitions == null) {
			getGraph().freeze(OptimizationPreference.SPEED);
			inferredDefinitions = JunctionTreeAlgorithmUtils.junctionTreeInference(getGraph(), fusionedDefinitions);
		}
		
		Set<Variable> missingVariables = new HashSet<Variable>(variables);
		missingVariables.removeAll(inferences.keySet());
		System.out.println("After observation changes, need to recompute " + missingVariables);
		if (missingVariables.isEmpty()) 
			return;
		
		for (Variable variable : missingVariables) {
			List<Function<Variable>> definitionsForThisVariable = inferredDefinitions.get(variable);
			int iDef = 0;//definitionsForThisVariable.size() - 1;
			Function<Variable> inferredDefinition =	Functions.cache(definitionsForThisVariable.get(iDef));
				
			if (definitionsForThisVariable.size() > 1) {
				TabulatedFunction<Variable> baseTable = Functions.table(inferredDefinition);
				
				boolean announcedMismatch = false;
				for (Function<Variable> def : definitionsForThisVariable) {
					TabulatedFunction<Variable> tab = Functions.table(def);
					if (def == inferredDefinition)
						continue;
					
					double dif = baseTable.difference(tab);
					if (dif > 1e-10) {
						if (!announcedMismatch) {
							System.out.println("Mismatch between the " + definitionsForThisVariable.size() + " definitions of " + variable);
							System.out.println("\t# Chosen definition :");
							System.out.println("\tf(" + StringUtils.implode(inferredDefinition.getArgumentNames(), ", ") + ") : " + def);
							System.out.println("\t-> " + baseTable.toString(Arrays.asList(variable), true));
							announcedMismatch = true;
						}
						System.out.println("\t# Mismatching (difference = " + dif + ") :");
						System.out.println("\tf(" + StringUtils.implode(def.getArgumentNames(), ", ") + ") : " + def);
						System.out.println("\t-> " + tab.toString(Arrays.asList(variable), true));
					}
					//System.out.println("\t"+def+"\n\tValues : " + StringUtils.implode(BayesianNetworkUtils.getProbabilities(variable, def, ), ", "));
				}
			}
			inferredDefinition.flushCachedData();
			inferences.put(variable, inferredDefinition);
		}
		System.out.println();
		
	}
	static class FusionedDefinition implements Function<Variable> {
		Variable variable;
		Function<Variable> function;
		final Map<Variable, Function<Variable>> definitions, likelinesses;
		
		public FusionedDefinition(Variable variable, ListenableMap<Variable, Function<Variable>> definitions, Map<Variable, Function<Variable>> likelinesses) {
			this.variable = variable;
			this.definitions = definitions;
			this.likelinesses = likelinesses;
		}
		
		protected Function<Variable> getFunction() throws FunctionException {
			if (function == null) {
				Function<Variable> likeliness = likelinesses.get(variable), definition = definitions.get(variable);
				function = likeliness == null ? definition : Functions.multiply(definition, likeliness);
			}
			return function;
		}
		
		public double eval(Valuation<Variable> values) throws FunctionException {
			return getFunction().eval(values);
		}
		public void flushCachedData() {
			definitions.get(variable).flushCachedData();
			Function<Variable> likeliness = likelinesses.get(variable);
			if (likeliness != null)
				likeliness.flushCachedData();
			function = null;
		}
		public List<Variable> getArgumentNames() {
			try {
				return getFunction().getArgumentNames();
			} catch (FunctionException e) {
				throw new RuntimeException(e);
			}
		}
		public Collection<Function<Variable>> getChildren() {
			Function<Variable> likeliness = likelinesses.get(variable);
			Function<Variable> definition = definitions.get(variable); 
			if (likeliness == null) return Collections.singleton(definition);
			else {
				ArrayList<Function<Variable>> ret = new ArrayList<Function<Variable>>(2);
				ret.add(definition);
				ret.add(likeliness);
				return ret;
			}
		}
		public String toString() {
			if (true)
				return //"VAR(" + 
				variable.toString() 
				//+ ")"
				;
			
			//Function<Variable> likeliness = likelinesses.get(variable);
			//Function<Variable> definition = getDefinitions().get(variable);
			try {
				return getFunction().toString();
			} catch (FunctionException e) {
				e.printStackTrace();
				return null;
			}
			//return likeliness == null ? definition.toString() : likeliness.toString();
		}
	}
}
class LikelinessFunction implements Function<Variable> {
	private final Map<Integer, Float> likeliness;
	private final Variable variable;
	
	public LikelinessFunction(Variable variable, Map<Integer, Float> likeliness) {
		this.variable = variable;
		this.likeliness = likeliness;
	}
	
	public double eval(Valuation<Variable> values) throws FunctionException {
 		int value = values.get(variable);
		//if (value == null) throw new MissingArgumentsException();
		return likeliness.get(value).doubleValue();
	}
	public void flushCachedData() {}
	public List<Variable> getArgumentNames() {
		return Collections.singletonList(variable);
	}
	public Function<Variable> instantiate(Valuation<Variable> values) throws FunctionException {
		int value = values.get(variable);
		//if (value == null) throw new MissingArgumentsException(variable.getName());
		return Functions.constant(likeliness.get(value).doubleValue());
	}
	public Collection<Function<Variable>> getChildren() {
		return null;
	}
	public String toString() {
		return "obs("+variable +")";
	}
}