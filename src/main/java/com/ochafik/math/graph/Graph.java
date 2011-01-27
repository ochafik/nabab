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
