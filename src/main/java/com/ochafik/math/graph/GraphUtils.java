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

import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.SortedSet;
import java.util.TreeMap;
import java.util.TreeSet;

import com.ochafik.math.graph.EdgeValuedGraph.Edge;
import com.ochafik.math.graph.impl.DefaultEdgeValuedGraph;
import com.ochafik.math.graph.impl.DefaultGraph;
import com.ochafik.math.graph.impl.DefaultNodeSet;
import com.ochafik.math.graph.impl.DefaultSeparator;
import com.ochafik.util.CollectionsUtils;
import com.ochafik.util.IntArray;
import com.ochafik.util.IntPairSet;
import com.ochafik.util.ShellOutput;
import com.ochafik.util.SortedSetsUtils;
import com.ochafik.util.ValuesByKey;
import com.ochafik.util.listenable.Pair;


public class GraphUtils {
	/**
	 * Computes the minimal spanning tree of an edge-valuated graph using Kruskal's algorithm
	 * @see <a href="http://en.wikipedia.org/wiki/Kruskal%27s_algorithm"/>
	 * @param graph edge-valuated graph which spanning tree we want to compute
	 * @return
	 */
	public static <N extends Comparable<N>, E extends Comparable<E>> EdgeValuedGraph<N,E> computeMinimalSpanningTree(EdgeValuedGraph<N, E> graph) {
		List<N> nodeList = graph.getNodeList();
		int nNodes = nodeList.size();
		
 		SortedSet<EdgeValuedGraph.Edge<E>> sortedEdges = new TreeSet<EdgeValuedGraph.Edge<E>>(
			new Comparator<EdgeValuedGraph.Edge<E>>() {
				/**
				 * Sort the edges by increasing cost
				 */
				public int compare(Edge<E> o1, Edge<E> o2) {
					int d = o1.getEdgeValue().compareTo(o2.getEdgeValue());
					if (d == 0) {
						return o1.compareTo(o2);
					}
					return d;
				}
			}
		);
 		graph.getEdges(sortedEdges);
		
		// Build a forest with singleton trees, one for each node
		Set<NodeSet<N>> forest = new TreeSet<NodeSet<N>>();
		Map<Integer,Set<NodeSet<N>>> treesByNodes = new TreeMap<Integer, Set<NodeSet<N>>>();
		for (int iNode = nNodes; iNode-- != 0;) {
			DefaultNodeSet<N> tree = new DefaultNodeSet<N>(graph);
			tree.addNode(iNode);
			forest.add(tree);
			Set<NodeSet<N>> trees = new TreeSet<NodeSet<N>>();
			trees.add(tree);
			treesByNodes.put(iNode, trees);
		}
		
		DefaultEdgeValuedGraph<N,E> minimalSpanningTree = new DefaultEdgeValuedGraph<N,E>(nodeList, graph.isOriented());
		
		// Grow forest by merging different trees adding edges of the least cost
		for (EdgeValuedGraph.Edge<E> edge : sortedEdges) {
			Set<NodeSet<N>> 
				treesContainingOrigin = treesByNodes.get(edge.getOriginIndex()),
				treesContainingDestination = treesByNodes.get(edge.getDestinationIndex());
			
			boolean connectedTwoTrees = false;
			for (NodeSet<N> treeA : treesContainingOrigin) {
				if (treesContainingDestination == null) {
					treesContainingDestination = treesContainingDestination;
					continue;
				}
				
				for (NodeSet<N> treeB : treesContainingDestination) {
					if (!treeA.equals(treeB)) {
						// Connect the two trees, merge them (add elements of B to A, remove references to B and update those to A)
						minimalSpanningTree.addEdge(edge.getOriginIndex(), edge.getDestinationIndex(), edge.getEdgeValue());
						treeA.addNodes(treeB);
						
						IntArray a = treeB.getNodeIndices();
						for (int i = a.size(); i-- != 0;) {
							int iNode = a.get(i);
							Set<NodeSet<N>> trees = treesByNodes.get(iNode);
							trees.add(treeA);
							trees.remove(treeB);
							forest.remove(treeB);
						}
						connectedTwoTrees = true;
						break;
					}
				}
				if (connectedTwoTrees) break;
			}
		}
		
		return minimalSpanningTree;
	}
	
	public enum DepthType {
		DEPTH_ORIENTED, DEPTH_DESCENDENTS, DEPTH_ANCESTORS, DEPTH_UNORIENTED 
	}
	
	static <N extends Comparable<N>> boolean[] toPresenceArray(Set<Integer> subGraph, Graph<N> graph) {
		int nNodes = graph.getVertexCount();
		boolean[] isInSubGraph = new boolean[nNodes];
		for (int node : subGraph) isInSubGraph[node] = true;
		return isInSubGraph;
	}

	public static <N extends Comparable<N>> int computeNodePower(int originIndex, Graph<N> graph, Set<Integer> subGraph) {
		if (subGraph == null) return computeNodeDepth(originIndex, graph, DepthType.DEPTH_UNORIENTED, (boolean[])null);
		return computeNodePower(originIndex, graph, toPresenceArray(subGraph,graph));
	}
	
	/**
	 * Search in breadth first
	 * @param originIndex
	 * @param destinationIndex
	 * @return length of shortest path between originIndex and destinationIndex (where a->b->c has length 3)
	 */
	public static <N extends Comparable<N>> int computeNodeDepth(int originIndex, Graph<N> graph, DepthType depthType, Set<Integer> subGraph) {
		//if (subGraph == null) return computeNodeDepth(originIndex, graph, depthType, (boolean[])null);
		if (subGraph == null) return computeNodePower(originIndex, graph, (boolean[])null);
		return computeNodeDepth(originIndex, graph, depthType, toPresenceArray(subGraph,graph));
	}
	
	public static <N extends Comparable<N>> int computeNodeDepth(int originIndex, Graph<N> graph, DepthType depthType, boolean[] isInSubGraph) {
		if (depthType == DepthType.DEPTH_ORIENTED) {
			return 
				  computeNodeDepth(originIndex, graph, DepthType.DEPTH_DESCENDENTS, isInSubGraph)
				- computeNodeDepth(originIndex, graph, DepthType.DEPTH_ANCESTORS, isInSubGraph)
			;
		}
		int nNodes = graph.getVertexCount();
		boolean[] 
			isForbiddenNode = new boolean[nNodes], 
			isNextNode = new boolean[nNodes],
			isNextNode2 = new boolean[nNodes];;
		
		isNextNode[originIndex] = true;
		
		int currentDepth = -1;
		int nNextNodes;
		do {
			nNextNodes = 0;

			currentDepth++;
			for (int node = nNodes; node-- != 0;) {
				if (isNextNode[node]) {
					isNextNode[node] = false;
					isForbiddenNode[node] = true;
					switch (depthType) {
					case DEPTH_ANCESTORS:
						nNextNodes += updateNextNodes(node, graph.getLocalConnectivity().getStarts(node), isForbiddenNode, isNextNode2, isInSubGraph);
						break;
					case DEPTH_DESCENDENTS:
						nNextNodes += updateNextNodes(node, graph.getLocalConnectivity().getEnds(node), isForbiddenNode, isNextNode2, isInSubGraph);
						break;
					case DEPTH_ORIENTED:
						throw new RuntimeException();
					case DEPTH_UNORIENTED:
						nNextNodes += updateNextNodes(node, graph.getLocalConnectivity().getEnds(node), isForbiddenNode, isNextNode2, isInSubGraph);
						nNextNodes += updateNextNodes(node, graph.getLocalConnectivity().getStarts(node), isForbiddenNode, isNextNode2, isInSubGraph);
						break;
					}
				}
			}
			// permute isNextNode and isNextNode2
			boolean[] t = isNextNode;
			isNextNode = isNextNode2;
			isNextNode2 = t;
		} while (nNextNodes > 0);
		
		return currentDepth;
	}
	private static int updateNextNodes(int node, IntArray neighbours, boolean[] isForbiddenNode, boolean[] isNextNode, boolean[] isInSubGraph) {
		int nNextNodes = 0;
		for (int iNeighbour = neighbours.size(); iNeighbour-- != 0;) {
			int neighbour = neighbours.get(iNeighbour);
			if (isInSubGraph != null && !isInSubGraph[neighbour]) continue;
			if (!isForbiddenNode[neighbour]) {
				isNextNode[neighbour] = true;
				nNextNodes++;
			}
		}
		return nNextNodes;
	}
	public static <N extends Comparable<N>> int computeNodePower(int originIndex, Graph<N> graph, boolean[] isInSubGraph) {
		int depth = computeNodeDepth(originIndex, graph, DepthType.DEPTH_UNORIENTED, isInSubGraph);
		
		int nNodes = graph.getVertexCount();
		boolean[] 
		        isForbiddenNode = new boolean[nNodes], 
		        isNextNode = new boolean[nNodes],
		        isNextNode2 = new boolean[nNodes];;
		
		isNextNode[originIndex] = true;
		
		int power = 0;
		int currentHeight = depth;
		int nNextNodes;
		do {
			nNextNodes = 0;
			for (int node = nNodes; node-- != 0;) {
				if (isNextNode[node]) {
					isNextNode[node] = false;
					isForbiddenNode[node] = true;
					nNextNodes += updateNextNodes(node, graph.getLocalConnectivity().getEnds(node), isForbiddenNode, isNextNode2, isInSubGraph);
					nNextNodes += updateNextNodes(node, graph.getLocalConnectivity().getStarts(node), isForbiddenNode, isNextNode2, isInSubGraph);
				}
			}
			// permute isNextNode and isNextNode2
			boolean[] t = isNextNode;
			isNextNode = isNextNode2;
			isNextNode2 = t;
			
			power += nNextNodes * currentHeight * currentHeight;
			currentHeight--;
		} while (nNextNodes > 0);
		
		return power;
	}
	
	public static <N extends Comparable<N>> List<Integer> depthFirstOrdering(int iNode, Graph<N> graph) {
		int nNodes = graph.getNodeList().size();
		List<Integer> order = new ArrayList<Integer>(nNodes);
		depthFirstOrdering(iNode, graph, new boolean[nNodes], order);
		return order;
	}
	private static <N extends Comparable<N>> void depthFirstOrdering(int iNode, Graph<N> graph, boolean[] forbidden, List<Integer> order) {
			forbidden[iNode] = true;
		order.add(iNode);
		IntArray ends = graph.getLocalConnectivity().getEnds(iNode);
		for (int iEnd = ends.size(); iEnd-- != 0;) {
			int iNext = ends.get(iEnd);
			if (!forbidden[iNext]) {
				depthFirstOrdering(iNext, graph, forbidden, order);
			}
		}
	}
	public static <N extends Comparable<N>> Graph<N> createMoralizedGraph(Graph<N> model) {
		DefaultGraph<N> moralization = new DefaultGraph<N>(model,false);
		
		for (int iNode = model.getNodeList().size(); iNode-- != 0;) {
			int[] parentIndices = model.getLocalConnectivity().getStarts(iNode).toArray();
			int nParents = parentIndices.length;
			for (int iiParent1 = nParents; iiParent1-- != 0;) {
				int iParent1 = parentIndices[iiParent1];
				for (int iiParent2 = iiParent1+1; iiParent2 < nParents; iiParent2++) {
					int iParent2 = parentIndices[iiParent2];
					moralization.addEdge(iParent1, iParent2);
				}
			}
		}
		return moralization;
	}
	public static <N extends Comparable<N>> Graph<NodeSet<N>> createJunctionTree(Graph<N> model) {
		Graph<N> graph;
		if (model.isOriented()) {
			graph = createMoralizedGraph(model);
		} else {
			graph = model;
		}
		graph = createTriangulizedGraph(graph);
		Graph<NodeSet<N>> junctionGraph = createJunctionGraph(graph);
		
		// Weight each edge of the junction graph by minus the size of the intersection of its vertices
		final DefaultEdgeValuedGraph<NodeSet<N>, Integer> weightedJunctionGraph = new DefaultEdgeValuedGraph<NodeSet<N>, Integer>(junctionGraph.getNodeList(),false);
		final List<NodeSet<N>> nodeList = weightedJunctionGraph.getNodeList();
		junctionGraph.getLocalConnectivity().export(new IntPairSet.IntPairOutput() {
			public void output(int x, int y) {
				int nIntersections = 0;
				NodeSet<N> origin = nodeList.get(x), destination = nodeList.get(y);
				IntArray indices = origin.getNodeIndices();
				for (int i = indices.size(); i-- != 0;) {
					if (destination.containsNode(indices.get(i))) nIntersections++;
				}
				weightedJunctionGraph.addEdge(x, y, new Integer(-nIntersections));
			}
		});
		/*
		for (EdgeValuedGraph.Edge<Integer> edge : weightedJunctionGraph.getEdges()) {
			int nIntersections = 0;
			NodeSet<N> origin = nodeList.get(edge.getOriginIndex()), destination = nodeList.get(edge.getDestinationIndex());
			for (int i : origin.getNodeIndices()) {
				if (destination.containsNode(i)) nIntersections++;
			}
			weightedJunctionGraph.addEdge(edge.getOriginIndex(), edge.getDestinationIndex(), new Integer(-nIntersections));
		}*/
		
		// Compute the minimum weight spanning tree of the weighted junction graph
		Graph<NodeSet<N>> minimalSpanningTree = GraphUtils.computeMinimalSpanningTree(weightedJunctionGraph);
		List<NodeSet<N>> newNodeList = new ArrayList<NodeSet<N>>(nodeList.size());  
		for (int iNodeList = nodeList.size(); iNodeList-- != 0;) {
			NodeSet<N> nl = nodeList.get(iNodeList);
			// remove separators with only one clique attached to them
			if (nl instanceof Separator) {
				IntArray destinations = minimalSpanningTree.getLocalConnectivity().getEnds(iNodeList);
				if (destinations.size() < 2) {
					continue;
				}
			}
			newNodeList.add(nl);
		}
		return new DefaultGraph<NodeSet<N>>(minimalSpanningTree, newNodeList, false);
	}
	public static <N extends Comparable<N>> Graph<NodeSet<N>> createJunctionGraph(Graph<N> model) {
		long startTime = System.currentTimeMillis();
		System.out.println("Computing junction graph");
		//System.out.println("Junction graph computed in "+(System.currentTimeMillis()-startTime)+" ms");
		
		
		System.out.print("\tGetting all cliques...");
		//List<Clique<N>> cliques = new ArrayList<Clique<N>>(CliqueUtils.getCliques(model));
		List<Clique<N>> cliques = CliqueUtils.getCliques(model);
		
		int totSize = 0, maxSize = 0, minSize = Integer.MAX_VALUE;
		for (Clique<N> clique : cliques) {
			int s = clique.getNodeIndices().size();
			if (s > maxSize) maxSize = s;
			else if (s < minSize) minSize = s;
			totSize += s;
		}
		System.out.println(" done in "+(System.currentTimeMillis()-startTime)+" ms.");
		System.out.println("\t\tFound " + cliques.size() + " cliques (min size = " + minSize+ ", avg = " + ((cliques.size() == 0 ? 0 : totSize / (cliques.size()))) + ", max = " + maxSize+")");
		
		//long startTimeOld = System.currentTimeMillis();
		//System.out.print("\tGetting all cliques (old method)...");
		//List<Clique<N>> cliquesOld = new ArrayList<Clique<N>>(CliqueUtilsOld.getCliques(model));
		//System.out.println(" done in "+(System.currentTimeMillis()-startTimeOld)+" ms");
		
		
		
		System.out.println("\tCreating node -> cliques index");
		// By convenience, create the set of all cliques that contain each node
		ValuesByKey<N, Clique<N>> cliquesByNodes = new ValuesByKey<N, Clique<N>>();
		for (Clique<N> clique : cliques) {
			cliquesByNodes.add(clique, clique.getNodes());
		}
		
		System.out.println("\tCreating set of cliques separators");
		// Create the set of separators for each clique
		ValuesByKey<Clique<N>, Separator<N>> separatorsByClique = new ValuesByKey<Clique<N>, Separator<N>>();
		for (Clique<N> clique : cliques) {
			// For each node of the clique, find all neighbours and keep a set of nodes that led to each neighbour.
			ValuesByKey<Clique<N>, N> nodesByNeighbourClique = new ValuesByKey<Clique<N>, N>();
			
			for (N node : clique.getNodes()) {
				Set<Clique<N>> cliquesForThisNode = new TreeSet<Clique<N>>(cliquesByNodes.get(node));
				cliquesForThisNode.remove(clique);
				nodesByNeighbourClique.add(node, cliquesForThisNode);
			}
			
			for (Clique<N> neighbour : nodesByNeighbourClique.keySet()) {
				separatorsByClique.add(new DefaultSeparator<N>(model, nodesByNeighbourClique.get(neighbour)), clique);
			}
		}
		
		System.out.println("\tGathering cliques and separators");
		// Create list of nodes for the junction tree (union of cliques and separators)
		Set<NodeSet<N>> junctionNodesSet = new TreeSet<NodeSet<N>>(cliques);
		junctionNodesSet.addAll(separatorsByClique.valueSet());
		List<NodeSet<N>> junctionNodes = new ArrayList<NodeSet<N>>(junctionNodesSet);
		
		System.out.println("\tLinking cliques and separators");
		// Link each clique with its separators
		DefaultGraph<NodeSet<N>> junctionGraph = new DefaultGraph<NodeSet<N>>(junctionNodes, false);
		for (Clique<N> clique : separatorsByClique.keySet()) {
			int cliqueIndex = junctionNodes.indexOf(clique);
			for (Separator<N> separator : separatorsByClique.get(clique)) {
				int separatorIndex = junctionNodes.indexOf(separator);
				junctionGraph.addEdge(cliqueIndex, separatorIndex);
			}
		}
		
		System.out.println("Junction graph computed in "+(System.currentTimeMillis()-startTime)+" ms");
		
		return junctionGraph;
	}
	public static <N extends Comparable<N>> Graph<N> createTriangulizedGraph_naive(Graph<N> model) {
		DefaultGraph<N> graph = new DefaultGraph<N>(model, false);
		List<N> nodeList = model.getNodeList();
		int nodeCount = nodeList.size();
		
		boolean isTriangulated;
		do {
			isTriangulated = true;
			for (int iNode = nodeCount; iNode-- != 0;) {
				Collection<Path<N>> cycles = PathUtils.getPaths(graph, iNode, iNode, 5, -1);
				for (Path<N> cycle : cycles) {
					List<Integer> cycleNodeIndices = cycle.getNodeIndexList();
					//if (cycleNodeIndices.size() > 4) {
						if (cycle.isMinimal()) {
							System.out.println(cycle+" needs triangulation");
							isTriangulated = false;
							//for (int i = 1; i<)
							graph.addEdge(cycleNodeIndices.get(1), cycleNodeIndices.get(3));
							break;
						}
					//}
				}
				if (!isTriangulated) break;
			}
		} while (!isTriangulated);
		
		
		return graph;
	}
	public static <N extends Comparable<N>> Graph<N> createTriangulizedGraph(Graph<N> model) {
		DefaultGraph<N> graph = new DefaultGraph<N>(model, false);
		List<N> nodeList = model.getNodeList();
		int nodeCount = nodeList.size();
		
		long startTime = System.currentTimeMillis();
		System.out.println("Triangulating graph with "+nodeCount+" nodes and " + graph.getLocalConnectivity().size() + " edges.");
		
		ValuesByKey<Integer, Cycle<N>> cyclesToTriangulateByNodeIndex = new ValuesByKey<Integer, Cycle<N>>();
		
		System.out.println("\tGetting all cycles");
		Set<Cycle<N>> cycles = PathUtils.getAllCycles(graph, true, 5, -1);
		
		System.out.println("\tInitializing triangulation");
		for (Cycle<N> cycle : cycles) {
			//System.out.println("Cycle "+cycle+" will need triangulation... Queueing it.");
			cyclesToTriangulateByNodeIndex.add(cycle, cycle.getNodeIndexList());
		}
		
		System.out.println("\tTriangulating");
		//ShellOutput.ShellLabel lab = new ShellOutput.ShellLabel("");
		
		ShellOutput.ShellLabel lab = new ShellOutput.ShellLabel("");
		int idisplay = 0;
		
		int nCyclesTriangulated = 0;
		while (!cyclesToTriangulateByNodeIndex.isEmpty()) {
			int remaining = cyclesToTriangulateByNodeIndex.size();
			if (((idisplay++) & 15) == 0) lab.setText(remaining + "");
			
			Cycle<N> cycle = cyclesToTriangulateByNodeIndex.valueSet().iterator().next();
			cyclesToTriangulateByNodeIndex.remove(cycle);
			
			List<Integer> nodeIndexList = cycle.getNodeIndexList();
			int size = nodeIndexList.size();
			
			//System.out.println("\tCycle "+cycle+" needs triangulation");
			for (int originIndexIndex = 1; originIndexIndex+2<size; originIndexIndex+=2) {
				int destinationIndexIndex = originIndexIndex+2;
				int originIndex = nodeIndexList.get(originIndexIndex), destinationIndex = nodeIndexList.get(destinationIndexIndex);
				
				//System.out.println("\t\tAdding edge "+graph.getNodeList().get(originIndex)+" -> "+graph.getNodeList().get(destinationIndex));
				graph.addEdge(originIndex, destinationIndex);
				
				Collection<Cycle<N>> set1 = CollectionsUtils.asArrayList(cyclesToTriangulateByNodeIndex.get(destinationIndex)),
					set2 = CollectionsUtils.asArrayList(cyclesToTriangulateByNodeIndex.get(originIndex));
				for (Cycle<N> affectedCycle : SortedSetsUtils.iterableSortedUnion(set1, set2)) {
					Pair<Cycle<N>, Cycle<N>> splitCycles = affectedCycle.splitByEdge(originIndex, destinationIndex);
					if (splitCycles == null) 
						continue; // the cycle was not really affected, as it refused to split with this new edge
					
					// Replace the affectedCycle by its two splitted cycles in cyclesB
					cyclesToTriangulateByNodeIndex.remove(affectedCycle);
					
					Cycle<N> first = splitCycles.getFirst(), second = splitCycles.getSecond();
					List<Integer> firstNodeIndexList = first.getNodeIndexList(), secondNodeIndexList = second.getNodeIndexList();
					if (firstNodeIndexList.size() > 4) {
						cyclesToTriangulateByNodeIndex.add(first, firstNodeIndexList);
					}
					if (secondNodeIndexList.size() > 4) {
						cyclesToTriangulateByNodeIndex.add(second, secondNodeIndexList);
					}
				}
			}
			nCyclesTriangulated++;
		}
		lab.setText("");
		System.out.println("Triangulation done in "+(System.currentTimeMillis()-startTime)+" ms : " + graph.getEdgeCount() + " edges (split "+nCyclesTriangulated+" cycles)");
		
		return graph;
	}
	
}
