package com.ochafik.math.graph;

import java.util.List;


public interface Graph<N extends Comparable<N>> {
	
	public boolean hasEdge(int originIndex, int destinationIndex);
	public boolean hasPath(int originIndex, int destinationIndex);

	public List<N> getNodeList();
	public int getVertexCount();
	public int getEdgeCount();
	
	public int computeShortestPathLength(int originIndex, int destinationIndex, int minimalLength);
	
	public EdgeSet getLocalConnectivity();
	public EdgeSet getGlobalConnectivity();
	public IntEdgeSet getPathsLengths();
	
	//public boolean addEdge(int originIndex, int destinationIndex);
	//public boolean removeEdge(int originIndex, int destinationIndex);
	
	public boolean isOriented();
	public boolean isAcyclic();
	public boolean isTree();
	public boolean isConnex();
	
	public enum OptimizationPreference {
		SPEED, SPACE
	}
	
	/**
	 * Declare that the graph is now immutable.
	 * This lets implementation optimize their data for speed or space.
	 */
	public void freeze(OptimizationPreference optimizationPreference);
	
}
