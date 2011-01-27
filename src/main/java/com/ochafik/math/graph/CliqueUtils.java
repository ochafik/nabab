package com.ochafik.math.graph;

import java.util.ArrayList;
import java.util.BitSet;
import java.util.Collection;
import java.util.Comparator;
import java.util.Iterator;
import java.util.LinkedList;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

import com.ochafik.lang.Threads;
import com.ochafik.math.graph.Graph.OptimizationPreference;
import com.ochafik.math.graph.impl.DefaultClique;
import com.ochafik.util.CollectionsUtils;
import com.ochafik.util.CompoundCollection;
import com.ochafik.util.IntArray;
import com.ochafik.util.IntArrayUtils;
import com.ochafik.util.IntVector;
import com.ochafik.util.IterableBitSet;
import com.ochafik.util.ShellOutput;
import com.ochafik.util.ShellProgress;
import com.ochafik.util.SortedIntArraysMerger;
import com.ochafik.util.WritableIntArray;

/**
 * Provides methods to compute the set of maximal cliques of a graph.
 * 
 * With small max degree (3), limiting step is getting the cycles.
 * With high degree (5), limiting step is getting cliques.
 * @author ochafik
 *
 */
public class CliqueUtils {
	protected static boolean isClique(EdgeSet localConnectivity, List<Integer> nodes) {
		if (!localConnectivity.isOriented()) {
			for (int node : nodes) {
				for (int otherNode : nodes) {
					if (otherNode != node) {
						if (!localConnectivity.contains(node, otherNode)) {
							return false;
						}
					}
				}
			}
		} else {
			for (int node : nodes) {
				for (int otherNode : nodes) {
					if (otherNode != node) {
						if (!localConnectivity.contains(node, otherNode) || !localConnectivity.contains(otherNode, node)) {
							return false;
						}
					}
				}
			}
		}
		return true;
	}
	protected static <N extends Comparable<N>> boolean isClique(Graph<N> graph, BitSet contains) {
		int nNodes = graph.getVertexCount();
		if (!graph.isOriented()) {
			for (int node = nNodes; node-- != 0;) {
				if (contains.get(node)) {
					for (int otherNode = 0; otherNode < node; otherNode++) {
						if (contains.get(otherNode) && !graph.hasEdge(node, otherNode)) {
							return false;
						}
					}
				}
			}
		} else {
			for (int node = nNodes; node-- != 0;) {
				if (contains.get(node)) {
					for (int otherNode = nNodes; otherNode-- != 0;) {
						if (contains.get(otherNode) && node != otherNode && (!graph.hasEdge(node, otherNode) || !graph.hasEdge(otherNode, node))) {
							return false;
						}
					}
				}
			}
		}
		return true;
	}
	/**
	 * Shrink clinkNodes by width first, and stop when we find a clique
	 * @param sourceNode
	 * @param cliqueNodes
	 * @param cliqueResults
	 */
	protected static void shrinkToCliques(EdgeSet localConnectivity, int sourceNode, List<Integer> cliqueNodes, Collection<List<Integer>> cliqueResults) {
		if (isClique(localConnectivity, cliqueNodes)) {
			cliqueResults.add(new ArrayList<Integer>(cliqueNodes));
			return;
		}
		
		for (int iNode = cliqueNodes.size(); iNode-- != 0;) {
			int node = cliqueNodes.get(iNode);
			if (node != sourceNode) {
				cliqueNodes.remove(iNode);
				if (isClique(localConnectivity, cliqueNodes)) {
					cliqueResults.add(new ArrayList<Integer>(cliqueNodes));
					cliqueNodes.add(iNode,node);
					return;
				}
				cliqueNodes.add(iNode,node);
			}
		}
		
		for (int iNode = cliqueNodes.size(); iNode-- != 0;) {
			int node = cliqueNodes.get(iNode);
			if (node != sourceNode) {
				cliqueNodes.remove(iNode);
				shrinkToCliques(localConnectivity, sourceNode,cliqueNodes,cliqueResults);
				cliqueNodes.add(iNode,node);
			}
		}
	}
	static Comparator<boolean[]> presenceComparator = new Comparator<boolean[]>() {
		public int compare(boolean[] o1, boolean[] o2) {
			int length = o1.length;
			int d = length - o2.length;
			if (d != 0) return d < 0 ? -1 : 1;
			for (int i = length; i-- != 0;) {
				boolean v = o1[i];
				if (v != o2[i]) return v ? -1 : 1;
			}
			return 0;
		}
	};
	enum AddResult {
		ADDED, MERGED, CONTAINED
	}
	static void unionAdd(BitSet newClique, int nNodes, LinkedList<BitSet> cliques) {
		for (int iClique = cliques.size(); iClique-- != 0;) {
			if (iClique >= cliques.size()) continue; // the size may vary because of recusive calls to unionAdd that may merge some cliques
			BitSet clique = cliques.get(iClique);
			
			boolean containsAll = true, isAllContained = true;
			for (int node = nNodes; node-- != 0;) {
				boolean bClique = clique.get(node), bNew = newClique.get(node);
				if (bClique) {
					if (!bNew) {
						containsAll = false;
					}
				} else {
					if (bNew) {
						isAllContained = false;
					}
				}
			}
			if (isAllContained) return; // no modification needed
			else if (containsAll) {
				// Modification needed : critical part
				cliques.remove(clique);
				for (int node = nNodes; node-- != 0;) {
					clique.set(node, newClique.get(node));
				}
				unionAdd(clique, nNodes, cliques); // added recursively
				return;
			}
		}
		
		BitSet copy = new BitSet(nNodes);
		copy.or(newClique);
		cliques.add(copy);
		return; // added clique to list
	}
	protected static <N extends Comparable<N>> void shrinkToCliques(Graph<N> graph, int sourceNode, BitSet isCliqueNode, int nNodes, LinkedList<BitSet> cliqueResults) {
		if (isClique(graph, isCliqueNode)) {
			unionAdd(isCliqueNode, nNodes, cliqueResults);
			return;
		}
		
		for (int node = nNodes; node-- != 0;) {
			if (isCliqueNode.get(node)) {
				if (node != sourceNode) {
					isCliqueNode.clear(node);
					shrinkToCliques(graph, sourceNode,isCliqueNode, nNodes, cliqueResults);
					isCliqueNode.set(node);
				}
			}
		}
	}
	public static <N extends Comparable<N>> Collection<Clique<N>> getCliques_naive(Graph<N> graph) {
		int nodeCount = graph.getNodeList().size();
		
		Set<Clique<N>> cliques = new TreeSet<Clique<N>>();
		ShellProgress p = new ShellProgress();
		p.setMaximum(nodeCount);
		p.setProgress(0);
		for (int node = nodeCount; node-- != 0;) {
			int[] neighbours = graph.getLocalConnectivity().getNeighbours(node).toArray();
			BitSet candidates = new BitSet(nodeCount);
			
			for (int neighbour : neighbours) candidates.set(neighbour);
			candidates.set(node);
			LinkedList<BitSet> cliquesResults = new LinkedList<BitSet>();
			
			//System.out.print("Shrinking "+neighbours.length+" candidates from node "+getNodeList().get(node)+"... ");
			shrinkToCliques(graph, node, candidates, nodeCount, cliquesResults);
			//System.out.println("done.");
			for (BitSet cliqueResult : cliquesResults) {
				DefaultClique<N> clique = new DefaultClique<N>(graph);
				for (int i = 0; i < nodeCount; i++) {
					if (cliqueResult.get(i)) {
						clique.addNode(i);
					}
				}
				cliques.add(clique);
			}
		}
		return cliques;
	}
	
	/**
	 * Optimized container for a clique being grown out.
	 * Constant-time addition and removal of nodes via stack storage, and constant-time ownership test via boolean array.
	 * @author ochafik
	 * @param <N>
	 */
	private static final class GrowingClique<N extends Comparable<N>> implements IntArray {
		private final boolean[] isContained;
		private final Graph<N> graph;
		private final IntVector nodes;
		
		public GrowingClique(Graph<N> graph) {
			int nNodes = (this.graph = graph).getVertexCount();
			isContained = new boolean[nNodes];
			nodes = new IntVector(nNodes);
		}
		public int[] getBackingArray() {
			return null;
		}
		public int[] toArray() {
			throw new UnsupportedOperationException();
		}
		public void set(int pos, int value) {
			throw new UnsupportedOperationException();
		}
		public void push(int node) {
			isContained[node] = true;
			nodes.pushBack(node);
		}
		public int pop() {
			int node = nodes.popBack();
			isContained[node] = false;
			return node;
		}
		public int top() {
			return nodes.back();
		}
		public Clique<N> toClique() {
			return new DefaultClique<N>(isContained, graph);
		}
		public boolean contains(int node) {
			return isContained[node];
		}
		public int size() {
			return nodes.size();
		}
		public int get(int iNode) {
			return nodes.get(iNode);
		}
		public String toString() {
			return toClique().toString();
		}

		public Iterator<Integer> iterator() {
			return IntArrayUtils.iterator(this);
		}
	}
	
	protected static final <N extends Comparable<N>> boolean checkRemainsClique(EdgeSet localConnectivity, GrowingClique<N> growingClique, int newNode) {
		for (int iInternal = growingClique.size(); iInternal-- != 0;) {
			int internal = growingClique.get(iInternal);
			assert internal != newNode;
			//if (internal == newNode) continue;
			if (!localConnectivity.contains(internal, newNode)) {
				return false;
			}
		}
		return true;
	}
	private static final <N extends Comparable<N>> void growOrderedClique(
			EdgeSet localConnectivity, 
			GrowingClique<N> growingClique, 
			boolean[] nodesKnownNotToBeInGrowingClique, 
			Collection<Clique<N>> cliquesOutput, 
			IntVector growableNeighbour, 
			IntVector nonGrowableNeighbours, 
			IntVector disorientedNeighbours,
			IterableBitSet mergedNeighbours) 
	{	
		//System.out.println("Growing clique "+growingClique);
		int lastNode = growingClique.top();
		
		int nInitCliques = cliquesOutput.size(),
			nInitGrowable = growableNeighbour.size(),
			nInitNonGrowable = nonGrowableNeighbours.size(),
			nInitDisoriented = disorientedNeighbours.size();
		
		// Merge the list of neighbours of all nodes of the clique
		for (int iNode = growingClique.size(); iNode-- != 0;) {
			IntArray neighbours = localConnectivity.getEnds(growingClique.get(iNode));
			mergedNeighbours.setAll(neighbours);
		}
		
		IterableBitSet.MyIntIterator itNeighbours = mergedNeighbours.intIterator();
		while (itNeighbours.hasNext()) {
			// Get the neighbour and remove it, so that mergedNeighbours stays clean for recursive calls
			int neighbour = itNeighbours.removeNext();
			
			// Only take neighbours that are not yet in the clique
			if (!nodesKnownNotToBeInGrowingClique[neighbour]) {
				if (!growingClique.contains(neighbour)) {
					if (neighbour < lastNode) {
						disorientedNeighbours.pushBack(neighbour);
					} else {
						// check if the current clique + neighbour is still a clique :
						if (checkRemainsClique(localConnectivity, growingClique, neighbour)) {
							growableNeighbour.pushBack(neighbour);
						} else {
							nonGrowableNeighbours.pushBack(neighbour);
							nodesKnownNotToBeInGrowingClique[neighbour] = true;
						}
					}
				}
			}
		}
		
		// Try to grow with every growable neighbour
		for (int i = growableNeighbour.size() - nInitGrowable; i-- != 0;) {
			int neighbour = growableNeighbour.popBack();
			
			// Go on growing with neighbour
			growingClique.push(neighbour);
			assert isClique(localConnectivity, CollectionsUtils.asArrayList(growingClique));
			
			growOrderedClique(localConnectivity, growingClique, nodesKnownNotToBeInGrowingClique, cliquesOutput, growableNeighbour, nonGrowableNeighbours, disorientedNeighbours, mergedNeighbours);
			
			growingClique.pop();
		}
		
		// Restore forbidden nodes
		for (int i = nonGrowableNeighbours.size() - nInitNonGrowable; i-- != 0;) {
			nodesKnownNotToBeInGrowingClique[nonGrowableNeighbours.popBack()] = false;
		}
		
		if (nInitCliques == cliquesOutput.size() &&  growingClique.size() > 1) {
			boolean couldHaveGrown = false;
			// Check if the clique could have grown if it had not needed to be oriented
			for (int i = disorientedNeighbours.size() - nInitDisoriented; i-- != 0;) {
				int neighbour = disorientedNeighbours.popBack(); // don't exit the loop prematurely so as to pop all values properly
				if (!couldHaveGrown && checkRemainsClique(localConnectivity, growingClique, neighbour)) {
					couldHaveGrown = true;
				}
			}
			
			if (!couldHaveGrown) {
				// Recursive calls did not manage to grow this clique : it is hence maximal and shall be added to cliques
				//System.out.println("Adding clique that could not grow : "+growingClique);
				cliquesOutput.add(growingClique.toClique());
			}
		}
	}
	
	/**
	 * Get the list of maximal cliques of the graph.
	 * Uses a greedy algorithm to grow cliques out of singletons in all possible ways.
	 * Has been highly optimized for multithreaded computation (two threads per processor), 
	 * and the memory usage is kept to a minimum (each computation thread hosts only one GrowingClique structure, which is used over recursive calls). 
	 * @see <a href="http://en.wikipedia.org/wiki/Maximal_clique"/>
	 * @see java.lang.Runtime.availableProcessors() 
	 * @param <N>
	 * @param graph
	 * @return list of unique maximal cliques of the graph
	 */
	public static <N extends Comparable<N>> List<Clique<N>> getCliques(final Graph<N> graph) {
//		return getCliques(graph, false);
//	}
//	public static <N extends Comparable<N>> List<Clique<N>> getCliques(final Graph<N> graph, final boolean verbose) {
		if (graph.isOriented()) 
			throw new IllegalArgumentException("Can only get cliques of a non oriented graph !");
		
		final int[] nextStartNode = new int[] {0}, nodesDone = new int[] {0};
		final int nThreads = 2 * Runtime.getRuntime().availableProcessors();
		
		//System.out.println("Computing cliques with "+nThreads+" threads...");
//		final ShellOutput.ShellLabel lab = verbose ?
//			new ShellOutput.ShellLabel("("+ nThreads + " threads)") : null;
		
		graph.freeze(OptimizationPreference.SPEED);
		
		class CliquesRunner implements Runnable {
			final List<Clique<N>> cliqueList = new ArrayList<Clique<N>>();
			
			public void run() {
				
				final int nNodes = graph.getVertexCount();
				final boolean[] forbiddenNodes = new boolean[nNodes];
				final GrowingClique<N> growingClique = new GrowingClique<N>(graph);
				
				final int nInitStackSize = 100;
				final IntVector growable = new IntVector(nInitStackSize),
					nonGrowable = new IntVector(nInitStackSize),
					disoriented = new IntVector(nInitStackSize);
				final IterableBitSet mergesOutput = new IterableBitSet(nNodes);
				
				for (;;) {
					int startNode;
					synchronized (nextStartNode) {
						startNode = nextStartNode[0]++;
					}
					if (startNode >= nNodes) break;
					
					growingClique.push(startNode);
					
					// growOrderedClique is up to 2x faster than growOrderedClique_OldMerge with the -client VM, and +25% faster with the -server VM.
					growOrderedClique(graph.getLocalConnectivity(), growingClique, forbiddenNodes, cliqueList, growable, nonGrowable, disoriented, mergesOutput);
					//growOrderedClique_OldMerge(graph.getLocalConnectivity(), growingClique, forbiddenNodes, cliqueList, growable, nonGrowable, disoriented);
					growingClique.pop();
					
					synchronized (nodesDone) {
						nodesDone[0]++;
//						if (verbose)
//							lab.setText(" "+ nodesDone[0] +" / " +nNodes + " ("+ nThreads + " threads)");
					}
				}
			}
		};
		
		Threads threadsJoint = new Threads();
		
		//CompoundCollection<Clique<N>> cliques = new CompoundCollection<Clique<N>>();
		List<Collection<Clique<N>>> lists = new ArrayList<Collection<Clique<N>>>(); 
		for (int i = nThreads; i-- != 0;) {
			//cliques.addComponent(threadsJoint.add(new CliquesRunner()).cliqueList);
			lists.add(threadsJoint.add(new CliquesRunner()).cliqueList);
		}
		
		threadsJoint.start();
		try {
			threadsJoint.join();
		} catch (InterruptedException e) {
			throw new RuntimeException(e);
		}
		
//		if (verbose)
//			lab.setText("");
		
		//return new CompoundCollection<Clique<N>>(lists);
		
		int size = 0;
		for (Collection<Clique<N>> col : lists) {
			size += col.size();
		}
		List<Clique<N>> cliques = new ArrayList<Clique<N>>(size);
		for (Collection<Clique<N>> col : lists) {
			cliques.addAll(col);
		}
		return cliques;
		//return new ArrayList<Clique<N>>(cliques);
	}
	public static <N extends Comparable<N>> Collection<Clique<N>> getCliquesSingleThread(Graph<N> graph) {
//		return getCliquesSingleThread(graph, false);
//	}
//	public static <N extends Comparable<N>> Collection<Clique<N>> getCliquesSingleThread(Graph<N> graph, boolean verbose) {
		if (graph.isOriented()) throw new IllegalArgumentException("Can only get cliques of a non oriented graph !");
		int nNodes = graph.getVertexCount();
		
		List<Clique<N>> cliqueList = new ArrayList<Clique<N>>(nNodes);
		boolean[] forbiddenNodes = new boolean[nNodes];
		GrowingClique<N> growingClique = new GrowingClique<N>(graph);
		
//		ShellOutput.ShellLabel lab = verbose ?
//				new ShellOutput.ShellLabel("Computing cliques...") : null;

		int nInitStackSize = 100;
		IntVector growable = new IntVector(nInitStackSize),
			nonGrowable = new IntVector(nInitStackSize),
			disoriented = new IntVector(nInitStackSize);
		
		final IterableBitSet mergesOutput = new IterableBitSet(nNodes);
		
		for (int node = nNodes; node-- != 0;) {
//			if (verbose)
//				lab.setText("Cliques : node "+ (nNodes - (node + 1)) +" / " +nNodes);
			growingClique.push(node);
			growOrderedClique(graph.getLocalConnectivity(), growingClique, forbiddenNodes, cliqueList, growable, nonGrowable, disoriented, mergesOutput);
			growingClique.pop();
		}
//		if (verbose)
//			lab.setText("");
		
		return cliqueList;
	}
	
}
