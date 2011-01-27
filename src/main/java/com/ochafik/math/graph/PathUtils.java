/*
 * Copyright (C) 2006-2011 by Olivier Chafik (http://ochafik.com)
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

import gnu.trove.TIntArrayList;

import java.io.PrintStream;
import java.util.ArrayList;
import java.util.BitSet;
import java.util.Collection;
import java.util.LinkedList;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

import com.ochafik.math.graph.impl.DefaultCycle;
import com.ochafik.math.graph.impl.DefaultPath;
import com.ochafik.util.IntArray;
import com.ochafik.util.ShellOutput;


public class PathUtils {
	public static <N extends Comparable<N>> Collection<Path<N>> getPaths(Graph<N> graph, int originIndex, int destinationIndex, int minimalLength, int maximalLength) {
		Collection<Path<N>> paths = new LinkedList<Path<N>>();
		getPaths(
			graph,
			originIndex, 
			originIndex, 
			destinationIndex, 
			minimalLength,
			maximalLength,
			new BitSet(graph.getVertexCount()), 
			new LinkedList<Integer>(), 
			paths,
			false,
			false, // for cycles only
			false // for cycles only
		);
		return paths;
	}
	protected static <N extends Comparable<N>> Collection<Cycle<N>> getCycles(Graph<N> graph, int originIndex, boolean minimalCyclesOnly, int minimalNodeListSize, int maximalNodeListSize, Set<Cycle<N>> excludeList) {
		Collection<Path<N>> paths = new LinkedList<Path<N>>();
		getPaths(
			graph,
			originIndex, 
			originIndex, 
			originIndex, 
			minimalNodeListSize,
			maximalNodeListSize,
			new BitSet(graph.getVertexCount()), 
			new LinkedList<Integer>(), 
			paths, 
			minimalCyclesOnly, 
			true,
			false
		);
		
		Collection<Cycle<N>> cycles = new ArrayList<Cycle<N>>(paths.size());
		for (Path<N> path : paths) {
			if (path.getNodeIndexList().size() < minimalNodeListSize) throw new RuntimeException();
			
			Cycle<N> cycle = new DefaultCycle<N>(path);
			if (cycle.isMinimal() && !excludeList.contains(cycle)) {
				cycles.add(cycle);
			}
		}
		return cycles;
	}
	/*
	public static <N extends Comparable<N>> Set<Cycle<N>> getMinimalCycles(Graph<N> graph, int minimalCycleLength) {
		Set<Cycle<N>> cycles = new TreeSet<Cycle<N>>();
	
		ValuedEdgeSet<Integer> pathLengths = graph.getPathsLengths();
		
		int nNodes = graph.getVertexCount();
		BitSet forbiddenNodes = new BitSet(nNodes);
		for (int iNode = nNodes; iNode-- != 0;) {
			Collection<Path<N>> paths = new LinkedList<Path<N>>();
			forbiddenNodes.clear();
			getPaths(
				graph,
				iNode, 
				iNode, 
				iNode, 
				minimalCycleLength,
				-1,
				forbiddenNodes, 
				new LinkedList<Integer>(), 
				paths, 
				true, 
				true, // skip reverse cycles : we get each of them one way or another, anyway
				true // skip unordered cycles : anyway, we will get them all !
			);
		}
		return cycles;
		
		return cycles;
	}*/
	public static <N extends Comparable<N>> Set<Cycle<N>> getAllCycles(Graph<N> graph, boolean minimalCyclesOnly, int minimalNodeListSize, int maximalNodeListSize) {
		
		if (minimalCyclesOnly && maximalNodeListSize < 0) {
			return getMinimalCycles(graph, minimalNodeListSize);
		}
		Set<Cycle<N>> cycles = new TreeSet<Cycle<N>>();
		int nNodes = graph.getVertexCount();
		BitSet forbiddenNodes = new BitSet(nNodes);
		for (int iNode = nNodes; iNode-- != 0;) {
			Collection<Path<N>> paths = new LinkedList<Path<N>>();
			forbiddenNodes.clear();
			getPaths(
				graph,
				iNode, 
				iNode, 
				iNode, 
				minimalNodeListSize,
				maximalNodeListSize,
				forbiddenNodes, 
				new LinkedList<Integer>(), 
				paths, 
				minimalCyclesOnly, 
				true, // skip reverse cycles : we get each of them one way or another, anyway
				true // skip unordered cycles : anyway, we will get them all !
			);
			for (Path<N> path : paths) {
				if (path.getNodeIndexList().size() < minimalNodeListSize) throw new RuntimeException();
				
				Cycle<N> cycle = new DefaultCycle<N>(path);
				if (!cycles.contains(cycle)) {
					if (cycle.isMinimal()) {
						cycles.add(cycle);
					} /*else {
						System.out.print('.');
					}*/
				}
			}
		}
		return cycles;
	}
	
	/**
	 * 
	 * @param originalOriginIndex
	 * @param originIndex
	 * @param destinationIndex
	 * @param minimalNodeListSize
	 * @param forbiddenIndices
	 * @param indicesToPrepend
	 * @param paths
	 * @param filterAsManyNonMinimalPathsAsPossible
	 * @param skipReverseCycles if the index of the first element of the cycle is greater than the one before the last, then the cycle is not 'ordered' (it is the reverse of the ordered cycle for this cycle)
	 * @param skipUnorderedCycles if the original origin index is not the lowest index in the cycle, the cycle is not ordered
	 */
	protected static <N extends Comparable<N>> void getPaths(
			Graph<N> graph, 
			int originalOriginIndex, 
			int originIndex, 
			int destinationIndex, 
			int minimalNodeListSize, 
			int maximalNodeListSize,
			BitSet forbiddenIndices, 
			List<Integer> indicesToPrepend, 
			Collection<Path<N>> paths, 
			boolean filterAsManyNonMinimalPathsAsPossible, 
			boolean skipReverseCycles, 
			boolean skipUnorderedCycles) {
		
		int nIndicesToPrepend = indicesToPrepend.size();
		int subLength = nIndicesToPrepend + 2;
		if (maximalNodeListSize < 0 || subLength <= maximalNodeListSize) {
			forbiddenIndices.set(originIndex);
			
			IntArray ends = graph.getLocalConnectivity().getEnds(originIndex);
			for (int iEnd = ends.size(); iEnd-- != 0;) {
				int nextStep = ends.get(iEnd);
				if (nextStep == destinationIndex) {
					if (subLength >= minimalNodeListSize) {
						if (skipReverseCycles && nIndicesToPrepend > 1 && indicesToPrepend.get(1) > originIndex) continue;
						
						ArrayList<Integer> indices = new ArrayList<Integer>(subLength);
						indices.addAll(indicesToPrepend);
						indices.add(originIndex);
						indices.add(destinationIndex);
						
						Path<N> path = new DefaultPath<N>(indices, graph);
						if (filterAsManyNonMinimalPathsAsPossible) {
							if (path.isMinimal()) {
								paths.add(path);
							}
						}
					}
				} else if (!forbiddenIndices.get(nextStep)) {
					if (skipUnorderedCycles && nextStep < originalOriginIndex) continue;
						
					if (graph.hasPath(nextStep, destinationIndex)) {
						if (filterAsManyNonMinimalPathsAsPossible) {
							boolean isProbablyMinimal = true;
							for (int iPossibleShortcutSource = nIndicesToPrepend; iPossibleShortcutSource-- > 1;) {
								int possibleShortcutSource = indicesToPrepend.get(iPossibleShortcutSource);
								if (graph.hasEdge(possibleShortcutSource, nextStep)) {
									isProbablyMinimal = false;
									break;
								}
							}
							if (!isProbablyMinimal) continue; // next nextStep
						}
						int prependSize = indicesToPrepend.size();
						indicesToPrepend.add(originIndex);
						
						// if current path length + distance of next to dest is bigger than max node list size, cancel
						getPaths(
							graph,
							originalOriginIndex, 
							nextStep, 
							destinationIndex, 
							minimalNodeListSize,
							maximalNodeListSize,
							forbiddenIndices, 
							indicesToPrepend, 
							paths,  
							filterAsManyNonMinimalPathsAsPossible, 
							skipReverseCycles, 
							skipUnorderedCycles
						);
						
						indicesToPrepend.remove(prependSize);
					}
				}
			}
			forbiddenIndices.clear(originIndex);
		}
	}
	
	/**
	 * 
	 * @param <N>
	 * @param graph
	 * @param minimalNodeListSize 4 to get triangles at minimum
	 * @return
	 */
	public static <N extends Comparable<N>> Set<Cycle<N>>  getMinimalCycles(Graph<N> graph, int minimalNodeListSize) {
		Set<Cycle<N>> ret = new TreeSet<Cycle<N>>();
		
		Collection<Path<N>> paths = new ArrayList<Path<N>>();
		BuildingPath currentPath = new BuildingPath();
		
		//ShellOutput.ShellBar pbar = new ShellOutput.ShellBar(50);
		//pbar.setMaximum(graph.getVertexCount());
		//pbar.setValue(0);
		//ShellOutput.ShellLabel lab = new ShellOutput.ShellLabel("Computing cycles...", 20);
		for (int nodeId = graph.getVertexCount(); nodeId-- != 0;) {
			
			getMinimalPaths(graph, nodeId, nodeId, nodeId, currentPath, paths, true, minimalNodeListSize);
			
			assert currentPath.isEmpty();
			
			for (Path<N> path : paths) {
				ret.add(new DefaultCycle<N>(path));
			}
			paths.clear();
			
			//pbar.setValue(nodeId + 1);
			//lab.setText((nodeId + 1)+" cycles added");
			//System.out.print('.');
		}
		
		return ret;		
	}
	public static boolean isMinimalPath(
			int start, int end,
			BuildingPath currentPath,
			int next,
			IntEdgeSet pathsLengths) 
	{
		int iNext = currentPath.size();
		boolean isCycle = start == end;
		
		for (int iNode = 0, len = currentPath.size() - 1; iNode < len; iNode++) {
			int node = currentPath.get(iNode);
			
			int distOnPath = iNext - iNode;
			int minDistOnRestOfPath = iNode + (next == end ? 0 : 1); // start length + path to end
			if (!isCycle) {
				if (pathsLengths.contains(end, start))
					minDistOnRestOfPath += pathsLengths.get(end, start); 
			}
			
			int actualDist = pathsLengths.get(node, next);
			if (actualDist < distOnPath && actualDist < minDistOnRestOfPath) {
				return false;
			}
		}
		return true;
	}
	
	static class BuildingPath {
		private final TIntArrayList currentPath; 
		private final TIntArrayList nodeCounts;
		
		public BuildingPath() {
			currentPath = new TIntArrayList();
			nodeCounts = new TIntArrayList();
		}
		
		public boolean isEmpty() {
			return currentPath.isEmpty();
		}

		private void addCount(int node) {
			int size = nodeCounts.size();
			for (int i = size; i <= node; i++) {
				nodeCounts.add(0);
			}
			nodeCounts.set(node, nodeCounts.get(node) + 1);
		}
		private void removeCount(int node) {
			if (node >= nodeCounts.size()) {
				return;
			}
			nodeCounts.set(node, nodeCounts.get(node) - 1);
		}
		public boolean contains(int node) {
			return nodeCounts.get(node) > 0;
		}
		
		public int get(int iNode) {
			return currentPath.get(iNode);
		}
		public void push(int node) {
			currentPath.add(node);
			addCount(node);
		}
		
		public void pop() {
			int node = currentPath.remove(currentPath.size() - 1);
			removeCount(node);
		}
		
		public int size() {
			return currentPath.size();
		}
		public int[] toArray() {
			return currentPath.toNativeArray();
		}
	}
	/**
	 * 
	 * @param <N>
	 * @param graph
	 * @param start
	 * @param current
	 * @param end
	 * @param currentPath
	 * @param currentPathSet
	 * @param paths
	 * @param orderedCycles
	 */
	protected static <N extends Comparable<N>> void getMinimalPaths(
			Graph<N> graph,
			int start,
			int current,
			int end,
			BuildingPath currentPath, 
			Collection<Path<N>> paths, 
			boolean orderedCycles, 
			int minPathLength) {
		
		EdgeSet local = graph.getLocalConnectivity();
		IntEdgeSet lengths = graph.getPathsLengths();
		
		currentPath.push(current);
		
		int currentLength = currentPath.size();
		
		IntArray ends = local.getEnds(current);
		for (int iEnd = ends.size(); iEnd-- != 0;) {
			int next = ends.get(iEnd);
			if (next == end && currentLength + 1 >= minPathLength) {
				// reached destination
				currentPath.push(next);
				
				paths.add(new DefaultPath<N>(currentPath.toArray(), graph));
				
				currentPath.pop();
				continue;
			}
			if (orderedCycles && next <= start) {
				// cycle is not ordered : representation of ordered cycle starts by vertex with the least index
				continue;
			}
			if (currentPath.contains(next)) {
				// next is already in the current path
				continue;
			}
			
			if (!lengths.contains(next, end))
				// next node has no path to destination 
				continue;
			
			int lengthNextEnd = lengths.get(next, end);
			
			// maybe check length for oriented paths...

			if (!isMinimalPath(start, end, currentPath, next, lengths)) {
				// path is not minimal
				//throw new RuntimeException("Path is not minimal !");
				continue;
			}
			/*
			if (oriented) {
				for (int iI = 1, len = currentLength - 1; iI < len; iI++) {
					int lenOnPath = current - iI + 1;
					int minLen = lengths.get(currentPath.get(iI), next);
					
					if (minLen < lenOnPath) {
						// path is not minimal !
						continue;
					}
				}
			}*/
			//for (int i)
			getMinimalPaths(graph, start, next, end, currentPath, paths, orderedCycles, minPathLength);
		}
		
		currentPath.pop();
		
	}
	public static <N extends Comparable<N>> void printPath(Graph<N> graph, List<Integer> path, PrintStream out) {
		int lastNode = -1;
		List<N> nodeList = graph.getNodeList();
		if (graph.isOriented()) {
			for (int node : path) {
				if (lastNode >= 0) {
					if (graph.hasEdge(lastNode, node)) {
						out.print(" -> ");
					} else if (graph.hasEdge(node, lastNode)) {
						out.print(" <- ");
					} else {
						out.print(" || ");
					}
				} 
				out.print(nodeList.get(node));
				lastNode = node;
			}
		} else {
			for (int node : path) {
				if (lastNode >= 0) {
					if (graph.hasEdge(lastNode, node)) {
						out.print(" - ");
					} else {
						out.print(" || ");
					}
				} 
				out.print(nodeList.get(node));
				lastNode = node;
			}
		}
	}
}
