package com.ochafik.math.graph.impl;

import java.util.Collection;

import com.ochafik.math.graph.Graph;
import com.ochafik.math.graph.Separator;


public class DefaultSeparator<N extends Comparable<N>> extends DefaultNodeSet<N> implements Separator<N> {

	public DefaultSeparator(Graph<N> graph) {
		super(graph);
	}
	public DefaultSeparator(Graph<N> graph, Collection<N> nodes) {
		super(graph);
		for (N node : nodes) addNode(node);
	}
	
}
