package com.ochafik.math.bayes;

import java.util.List;
import java.util.Map;

import com.ochafik.math.functions.Function;
import com.ochafik.math.functions.FunctionException;
import com.ochafik.math.functions.Variable;
import com.ochafik.math.graph.Graph;
import com.ochafik.util.listenable.ListenableMap;
import com.ochafik.util.listenable.ListenableSet;


public interface BayesianNetwork {
	public static final String 
		ATTRIB_POSITION = "position",
		ATTRIB_NAME = "name",
		ATTRIB_AUTHOR = "author",
		ATTRIB_DESCRIPTION = "description"
		;
	
	public void setAttribute(String attrName, Object value);
	public Object getAttribute(String attrName);
	
	/**
	 * The graph returned is read-only, and should be used only in this library
	 * @return
	 */
	Graph<Variable> getGraph();
	
	/**
	 * Setting the likeliness table of a variable is equivalent to declaring one or multiple nodes
	 * and connections between nodes (arcs).
	 * @param node
	 * @param likelinessTable
	 */
	public ListenableMap<Variable, Function<Variable>> getDefinitions();
	public ListenableMap<Variable, Map<Integer,Float>> getObservations();
	public ListenableMap<Variable, Function<Variable>> getInferences();
	
	public ListenableSet<Variable> getVariables();
	
	public void infer() throws FunctionException;
}
