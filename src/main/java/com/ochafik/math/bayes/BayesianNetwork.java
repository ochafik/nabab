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
