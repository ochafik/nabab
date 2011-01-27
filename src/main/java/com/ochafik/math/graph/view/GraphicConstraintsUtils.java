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

package com.ochafik.math.graph.view;

import java.awt.geom.Point2D;
import java.awt.geom.Rectangle2D;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;

import com.ochafik.math.graph.Graph;
import com.ochafik.util.listenable.Pair;


public class GraphicConstraintsUtils {
	public static final long 
		COST_COLLISION_BIT = 1, 
		COST_ANGULAR_BIT = 2,
		COST_EDGE_BIT = 4,
		COST_PATH_BIT = 8,
		COST_INTERSECTION_BIT = 16,
		COST_NEIGHBOURS_ANGULAR_BIT = 32,
		
		COST_ALL_BITS = 0xFFFFFFFFFFFFFFFFl;
	
	public interface PositionProxy<N extends Comparable<N>> {
		Point2D getPosition(N variable);
		void setPosition(N variable, Point2D position);
	}
	public static class OverriddenPositionGetter<N extends Comparable<N>> implements PositionProxy<N> {
		final PositionProxy<N> getter;
		final Graph<N> graph;
		Map<N, Point2D> map = new TreeMap<N, Point2D>();
		
		public OverriddenPositionGetter(Graph<N> graph, PositionProxy<N> getter) {
			this.getter = getter;
			this.graph = graph;
		}

		public Point2D getPosition(N variable) {
			Point2D position = map.get(variable);
			return position == null ? getter.getPosition(variable) : position;
		}
		
		public void setPosition(N variable, Point2D position) {
			map.put(variable, position);
		}
	}
	
	/*static Point3d crossProduct(Point3d a, Point3d b) {
		Point3d r = new Point3d();
		r.x = a.getY()* b.z - a.z * b.getY();
		r.getY()= a.z * b.x - a.x * b.z;
		r.z = a.x * b.getY()- a.getY()* b.x;
		return r;
	}
	static Point2D computeIntersectionPositions(Pair<Point2D, Point2D> segment1, Pair<Point2D, Point2D> segment2) {
		Point3d eqSegment1 = getSegmentEquation(segment1), eqSegment2 = getSegmentEquation(segment2);
		Point3d inter = crossProduct(eqSegment1, eqSegment2);
		
		return null;
	}
	static Point3d getSegmentEquation(Pair<Point2D, Point2D> segment) {
		Point2D pA = segment.getFirst(), pB = segment.getSecond();
		Point3d eqSegmentA = new Point3d();
		eqSegmentA.x = pA.getY()* 1 - 1 * pB.getY();
		eqSegmentA.getY()= 1 * pB.x - pA.x * 1;
		eqSegmentA.z = pA.x * pB.getY()- pA.getY()* pB.x;
		return eqSegmentA;
	}*/
	private static final Point2D minus(Point2D a, Point2D b) {
		return new Point2D.Double(a.getX() - b.getX(), a.getY()- b.getY());
	}
	private static final Point2D segmentsIntersection(Pair<Point2D, Point2D> segAB, Pair<Point2D, Point2D> segCD) {
		Point2D 
			a = segAB.getFirst(), b = segAB.getSecond(),
			c = segCD.getFirst(), d = segCD.getSecond();
		return segmentsIntersection(a, b, c, d);
	}
	private static final Point2D segmentsIntersection(Point2D a, Point2D b, Point2D c, Point2D d) {
		final Point2D 
			ac = minus(c, a),
			ab = minus(b, a),
			cd = minus(d, c);
		final double delta = ab.getY()* cd.getX() - ab.getX() * cd.getY();
		if (delta == 0) return null;
		return new Point2D.Double((cd.getY()* ac.getX() - cd.getX() * ac.getY()) / delta, (ab.getX() * ac.getY()- ab.getY()* ac.getX()) / delta);
	}
	static <N extends Comparable<N>> Set<Pair<N,N>> getNonOrientedEdges(Graph<N> graph) {
		Set<Pair<N,N>> ret = new TreeSet<Pair<N,N>>();
		List<N> nodes = graph.getNodeList();
		for (int iNode = nodes.size(); iNode-- != 0;) {
			N node = nodes.get(iNode);
			for (int iOther : graph.getLocalConnectivity().getNeighbours(iNode).toArray()) {
				N other = nodes.get(iOther);
				if (node.compareTo(other) < 0) {
					ret.add(new Pair<N,N>(node, other));
				}
			}
		}
		return ret;
	}
	static <N extends Comparable<N>> List<N> getNeighbours(N node, Graph<N> graph) {
		List<N> nodeList = graph.getNodeList();
		List<N> neighbours = new ArrayList<N>();
		for (int i : graph.getLocalConnectivity().getNeighbours(nodeList.indexOf(node)).toArray())
			neighbours.add(nodeList.get(i));
		return neighbours;
	}
	
	static <N extends Comparable<N>> double computeCost(N node, PositionProxy<N> positionGetter, Graph<N> graph, Rectangle2D bounds, long costBits) {
		double total = 0;
		
		Point2D position = positionGetter.getPosition(node);
		total += (double)Math.sqrt(squareDistance(position, new Point2D.Double(bounds.getX()+bounds.getWidth()/2, bounds.getY()+bounds.getHeight()/2)));
		
		List<N> nodeList = graph.getNodeList();
		int nodeIndex = nodeList.indexOf(node);
		
		List<N> linkedNodes = new ArrayList<N>();
		
		for (int otherNodeIndex  = nodeList.size(); otherNodeIndex-- != 0;) {
			if (otherNodeIndex != nodeIndex) {
				Point2D otherPosition = positionGetter.getPosition(nodeList.get(otherNodeIndex));
				if (otherPosition == null) continue;
				
				double squareDistance = 0.1f+(double)squareDistance(position,otherPosition);
				
				if ((costBits & COST_COLLISION_BIT) != 0) {
					// collision potential
					total += 7000000/squareDistance;
				}
				if ((costBits & COST_EDGE_BIT) != 0) {
					if (graph.hasEdge(otherNodeIndex, nodeIndex) || graph.hasEdge(nodeIndex, otherNodeIndex)) {
						// there is an arc : minimize it
						total += 40*(double)Math.sqrt(squareDistance);
						linkedNodes.add(nodeList.get(otherNodeIndex));
					}
				}
			}
		}
		if ((costBits & COST_ANGULAR_BIT) != 0) {
			total += 900*computeAngularCost(node, positionGetter, linkedNodes);
		}
		
		if ((costBits & COST_NEIGHBOURS_ANGULAR_BIT) != 0) {
			for (N neighbour : linkedNodes) {
				total += 900*computeAngularCost(neighbour, positionGetter, getNeighbours(neighbour, graph));
			}
		}
		
		/*
		if ((costBits & COST_INTERSECTION_BIT) != 0) {
			//for (Pair<N,N> e1 : edges) {
			for (int iNeighbour : graph.getLocalConnectivity().getNeighbours(nodeIndex).toArray()) {
				N neighbour = nodeList.get(iNeighbour);
				Point2D 
					a = position, 
					b = positionGetter.getPosition(neighbour); 
				//boolean inf = node.compareTo(neighbour) < 0;
				//N nA = inf ? node : neighbour, nB = inf ? neighbour : node;
				
				if (b == null) {
					continue;
				}
				for (Pair<N,N> e2 : edges) {
					N nC = e2.getFirst(), nD = e2.getSecond();
					//if (nC.equals(nA) && nD.equals(nB)) continue;
					if (nC.equals(node) || nD.equals(node) || nC.equals(neighbour) || nD.equals(neighbour)) continue;
					
					Point2D  
						//c = nC.equals(node) ? position : positions.get(nC), 
						//d = nD.equals(node) ? position : positions.get(nD);
						c = positions.get(nC), 
						d = positions.get(nD);
					if (c == null || d == null) {
						continue;
					}
					Point2D inter = segmentsIntersection(a, b, c, d);
					if (inter != null) {
						double alpha = inter.getX(), gamma = inter.getY();
						if (alpha <= 0 || gamma <= 0 || alpha >= 1 || gamma >= 1) {
							continue;
						}
						
						double d1 = alpha, d2 = gamma;
						if (d1 > 0.5) d1 = 1f - d1;
						if (d2 > 0.5) d2 = 1f - d2;
						
						total += 100 + 1000 * (d1 + d2);
						//System.out.print('getX()');
					}
				}
			}
		}*/
		return total;
	}
	static <N extends Comparable<N>> double computeCost(N node, Point2D position, Graph<N> graph, Set<Pair<N,N>> edges, Map<N, Point2D> positions, Rectangle2D bounds, long costBits) {
		double total = 0;
		
		total += (double)Math.sqrt(squareDistance(position, new Point2D.Double(bounds.getX()+bounds.getWidth()/2, bounds.getY()+bounds.getHeight()/2)));
		
		List<N> nodeList = graph.getNodeList();
		int nodeIndex = nodeList.indexOf(node);
		
		List<N> linkedNodes = new ArrayList<N>();
		
		for (int otherNodeIndex  = nodeList.size(); otherNodeIndex-- != 0;) {
			if (otherNodeIndex != nodeIndex) {
				Point2D otherPosition = positions.get(nodeList.get(otherNodeIndex));
				if (otherPosition == null) continue;
				
				double squareDistance = 0.1f+(double)squareDistance(position,otherPosition);
				
				if ((costBits & COST_COLLISION_BIT) != 0) {
					// collision potential
					total += 7000000/squareDistance;
				}
				if ((costBits & COST_EDGE_BIT) != 0) {
					if (graph.hasEdge(otherNodeIndex, nodeIndex) || graph.hasEdge(nodeIndex, otherNodeIndex)) {
						// there is an arc : minimize it
						total += 40*(double)Math.sqrt(squareDistance);
						linkedNodes.add(nodeList.get(otherNodeIndex));
					}
				}
			}
		}
		if ((costBits & COST_ANGULAR_BIT) != 0) {
			total += 900*computeAngularCost(node, position, linkedNodes, positions);
		}
		
		if ((costBits & COST_NEIGHBOURS_ANGULAR_BIT) != 0) {
			Map<N, Point2D> newPositions = new TreeMap<N, Point2D>(positions);
			positions.put(node, position);
			
			for (N neighbour : linkedNodes) {
				total += 900*computeAngularCost(neighbour, positions.get(neighbour), getNeighbours(neighbour, graph), newPositions);
			}
		}
		
		if ((costBits & COST_INTERSECTION_BIT) != 0) {
			//for (Pair<N,N> e1 : edges) {
			for (int iNeighbour : graph.getLocalConnectivity().getNeighbours(nodeIndex).toArray()) {
				N neighbour = nodeList.get(iNeighbour);
				Point2D 
					a = position, 
					b = positions.get(neighbour); 
				//boolean inf = node.compareTo(neighbour) < 0;
				//N nA = inf ? node : neighbour, nB = inf ? neighbour : node;
				
				if (b == null) {
					continue;
				}
				for (Pair<N,N> e2 : edges) {
					N nC = e2.getFirst(), nD = e2.getSecond();
					//if (nC.equals(nA) && nD.equals(nB)) continue;
					if (nC.equals(node) || nD.equals(node) || nC.equals(neighbour) || nD.equals(neighbour)) continue;
					
					Point2D  
						//c = nC.equals(node) ? position : positions.get(nC), 
						//d = nD.equals(node) ? position : positions.get(nD);
						c = positions.get(nC), 
						d = positions.get(nD);
					if (c == null || d == null) {
						continue;
					}
					Point2D inter = segmentsIntersection(a, b, c, d);
					if (inter != null) {
						double alpha = inter.getX(), gamma = inter.getY();
						if (alpha <= 0 || gamma <= 0 || alpha >= 1 || gamma >= 1) {
							continue;
						}
						
						double d1 = alpha, d2 = gamma;
						if (d1 > 0.5) d1 = 1f - d1;
						if (d2 > 0.5) d2 = 1f - d2;
						
						total += 100 + 1000 * (d1 + d2);
						//System.out.print('getX()');
					}
				}
			}
		}
		return total;
	}
	
	static <N extends Comparable<N>> double computeAngularCost(N node, PositionProxy<N> positionGetter, List<N> linkedNodes) {
		int nLinkedNodes = linkedNodes.size();
		if (nLinkedNodes == 1) return 0;
		
		double[] angles = new double[nLinkedNodes];
		for (int iAngle = nLinkedNodes; iAngle-- != 0;) {
			N linkedNode = linkedNodes.get(iAngle); 
			Point2D linkedNodePosition = positionGetter.getPosition(linkedNode);
			Point2D position = positionGetter.getPosition(node);
			double dx = linkedNodePosition.getX() - position.getX(), dy = linkedNodePosition.getY()- position.getY();
			angles[iAngle] = (double)Math.atan2(dy, dx);
		}
		Arrays.sort(angles);
		double idealAngle = 2 * Math.PI / nLinkedNodes;
		
		double total = 0;
		for (int iAngle = nLinkedNodes; iAngle-- != 0;) {
			double diff = Math.abs(angles[iAngle] - angles[(iAngle+1)%nLinkedNodes]);
			//if (diff < 0.0) diff = -diff;//2.0*Math.PI;
			if (diff > 2.0 * Math.PI) diff -= 2.0*Math.PI;
			double compl = Math.abs(2*Math.PI - diff);
			if (compl < diff) diff = compl;
			
			diff -= idealAngle;
			total += diff * diff;//Math.abs(diff);
		}
		return total * nLinkedNodes;
	}
	static <N extends Comparable<N>> double computeAngularCost(N node, Point2D position, List<N> linkedNodes, Map<N, Point2D> positions) {
		int nLinkedNodes = linkedNodes.size();
		if (nLinkedNodes == 1) return 0;
		
		double[] angles = new double[nLinkedNodes];
		for (int iAngle = nLinkedNodes; iAngle-- != 0;) {
			N linkedNode = linkedNodes.get(iAngle); 
			Point2D linkedNodePosition = positions.get(linkedNode);
			double dx = linkedNodePosition.getX() - position.getX(), dy = linkedNodePosition.getY()- position.getY();
			angles[iAngle] = (double)Math.atan2(dy, dx);
		}
		Arrays.sort(angles);
		double idealAngle = 2 * Math.PI / nLinkedNodes;
		
		double total = 0;
		for (int iAngle = nLinkedNodes; iAngle-- != 0;) {
			double diff = Math.abs(angles[iAngle] - angles[(iAngle+1)%nLinkedNodes]);
			//if (diff < 0.0) diff = -diff;//2.0*Math.PI;
			if (diff > 2.0 * Math.PI) diff -= 2.0*Math.PI;
			double compl = Math.abs(2*Math.PI - diff);
			if (compl < diff) diff = compl;
			
			diff -= idealAngle;
			total += diff * diff;//Math.abs(diff);
		}
		return total * nLinkedNodes;
	}
	static <N extends Comparable<N>> double computeCost(List<Graph<N>> graphs, Set<Pair<N,N>> edges, Map<N, Point2D> positions, Rectangle2D bounds) {
		double totalCost = 0;
		for (Graph<N> graph : graphs) {
			totalCost += computeCost(graph,edges,positions,bounds);
		}
		return totalCost;
	}
	static <N extends Comparable<N>> double computeCost(Graph<N> graph, Set<Pair<N,N>> edges, Map<N, Point2D> positions, Rectangle2D bounds) {
			double total = 0;
		
		for (N node : graph.getNodeList()) {
			Point2D position = positions.get(node);
			if (position == null) continue;
			
			double cost = computeCost(node, position, graph, edges, positions, bounds, COST_NEIGHBOURS_ANGULAR_BIT | COST_ANGULAR_BIT | COST_COLLISION_BIT | COST_EDGE_BIT | COST_INTERSECTION_BIT);
			if (Double.isNaN(cost) || Double.isInfinite(cost)) continue;
			total += cost;
		}
		return total;
	}
	static Point2D computeBarycenter(Map<Point2D,Double> values) {
		double x = 0, y = 0;
		for (Map.Entry<Point2D, Double> e : values.entrySet()) {
			Point2D point = e.getKey();
			double value = e.getValue();
			x += value * point.getX();
			y += value * point.getY();
		}
		int size = values.size();
		return new Point2D.Double(x / size, y / size);
	}
	/*double squareDistance(Point2D p1, Point2D p2) {
		double dX = p1.getX()-p2.getX(), dY = p1.getY()-p2.getY();
		return dX * dX + dY * dY;
	}*/
	static double squareDistance(Point2D p1, Point2D p2) {
		double dX = p1.getX()-p2.getX(), dY = p1.getY()-p2.getY();
		return dX * dX + dY * dY;
	}
	
	//static <N> double computeAngularCost()
}
