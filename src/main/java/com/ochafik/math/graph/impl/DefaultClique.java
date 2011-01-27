package com.ochafik.math.graph.impl;

import java.util.BitSet;

import com.ochafik.math.graph.Clique;
import com.ochafik.math.graph.Graph;


public class DefaultClique<N extends Comparable<N>> extends DefaultNodeSet<N> implements Clique<N> {

	public DefaultClique(Graph<N> graph) {
		super(graph);
	}
	public DefaultClique(BitSet content, Graph<N> graph) {
		super(content,graph);
	}
	public DefaultClique(boolean[] content, Graph<N> graph) {
		super(content,graph);
	}
}
