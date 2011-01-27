package com.ochafik.math.graph.view;

import java.awt.AlphaComposite;
import java.awt.Color;
import java.awt.FontMetrics;
import java.awt.Graphics;
import java.awt.Graphics2D;
import java.awt.Insets;
import java.awt.RenderingHints;
import java.awt.geom.AffineTransform;
import java.awt.geom.GeneralPath;
import java.awt.geom.Point2D;
import java.awt.geom.Rectangle2D;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedList;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.SortedMap;
import java.util.TreeMap;
import java.util.TreeSet;

import javax.swing.SwingConstants;

import com.ochafik.awt.geom.Boundable;
import com.ochafik.awt.geom.RelationShapesBuilder;
import com.ochafik.math.graph.Graph;
import com.ochafik.math.graph.GraphUtils;
import com.ochafik.math.graph.view.GraphicConstraintsUtils.PositionProxy;
import com.ochafik.util.ValuesByKey;
import com.ochafik.util.listenable.Pair;


public class Graphic<N extends Comparable<N>> {
	class NodeInfo<N> {
		N node;
		Point2D position;
		
		public NodeInfo(N node) {
			super();
			// TODO Auto-generated constructor stub
			this.node = node;
		}
		public N getNode() {
			return node;
		}
		public Point2D getPosition() {
			return position;
		}
		public void setNode(N node) {
			this.node = node;
		}
		public void setPosition(Point2D position) {
			this.position = position;
		}
	}
	Insets margin = new Insets(5,30,5,30);
	public Graph<N> getGraph() {
		return graph;
	}
	class NodeComponent implements Boundable {
		public NodeComponent(N node, Point2D position) {
			Point2D size = getNodeSize(node);
			//Point2D position = positions.get(node);
			bounds = new Rectangle2D.Double(position.getX()-size.getX()/2,position.getY()-size.getY()/2,size.getX(),size.getY());
		}
		Rectangle2D bounds;
		public boolean contains(double x, double y) {
			return bounds.contains(x, y);
		}
		public Rectangle2D getBoundingBox() {
			return bounds;
		}
		public Point2D getInterestPoint() {
			return new Point2D.Double(bounds.getCenterX(),bounds.getCenterY());
		}
	}
	Set<Pair<N,N>> edges;
	Graph<N> graph;
	List<Graph<N>> costGraphs;
	
	public Graphic(Graph<N> graph, List<Graph<N>> costGraphs) {
		setGraphAndCostGraphs(graph, costGraphs);
		
		//bounds = new Rectangle2D.Double(0,0,500,500);
	}
	SortedMap<N, Point2D> positions;
	
	SortedMap<N, Point2D> bestPositions;
	double bestCost = -1;
	
	Rectangle2D bounds;
	/*int maxGradientIterations = 200;
	double initialParameter = 0.01f;
	double maxNoise = 10.0f;*/
	
	int maxGradientIterations = 200;
	double initialParameter = 0.01f;
	double maxNoise = 10.0f;
	
	Random random = new Random();
	
	/**
	 * The closer to the root the node is, the smaller the indicator
	 * @param <N>
	 * @param iNode
	 * @param graph
	 * @return
	 */
	protected static <N extends Comparable<N>> int leafishIndicator(int iNode, Graph<N> graph, Set<Integer> subGraph) {
		//return GraphUtils.computeNodeDepth(iNode, graph, DepthType.DEPTH_ORIENTED, subGraph);
		return GraphUtils.computeNodePower(iNode, graph, subGraph);
		/*
		int[] desc = graph.getDescendentIndices(iNode),
			anc = graph.getAncestorIndices(iNode),
			dest = graph.getDestinationIndices(iNode),
			orig = graph.getOriginIndices(iNode);
		if (subGraph == null) {
			return 
				- desc.length 
				- dest.length
				+ anc.length 
				+ orig.length;
		} else {
			int tot = 0;
			for (int i : desc) if (subGraph.contains(i)) tot--;
			for (int i : dest) if (subGraph.contains(i)) tot--;
			for (int i : anc) if (subGraph.contains(i)) tot++;
			for (int i : orig) if (subGraph.contains(i)) tot++;
			return tot;
		}*/
	}
	interface ValueToPositionComputer {
		public Point2D computePosition(double value);
	}
	class CostAssignment<T> implements Comparable<CostAssignment<T>>{
		double cost;
		T element;
		Point2D position;
		public Point2D getPosition() {
			return position;
		}
		public double getCost() {
			return cost;
		}
		public T getElement() {
			return element;
		}
		public CostAssignment(T element, Point2D position, double cost) {
			this.cost = cost;
			this.element = element;
			this.position = position;
		}

		public int compareTo(CostAssignment o) {
			double d = cost - o.cost;
			if (d == 0) {
				return element.toString().compareTo(o.element.toString());
			}
			return d < 0 ? -1 : 1;  
		}
	}
	public void initializePositions() {
		//if (graph.isTree()) {
			
		//} else {
			ValuesByKey<Integer, Integer> nodesByLeafishIndicator = new ValuesByKey<Integer, Integer>();
			List<N> nodeList = graph.getNodeList();
			int nNodes = nodeList.size();
			for (int iNode = nNodes; iNode-- != 0;) nodesByLeafishIndicator.add(iNode, leafishIndicator(iNode, graph, null));
			int  nIndicators = nodesByLeafishIndicator.keySet().size();
			
			//getNodeSize(node)
			double yStep = bounds.getHeight() / (nIndicators+1);
			Map<Double,Collection<Integer>> rows = new TreeMap<Double, Collection<Integer>>();
			
			double y = yStep;
			double step = yStep;
			for (int indicator : nodesByLeafishIndicator.keySet()) {
				Set<Integer> nodeIndices = nodesByLeafishIndicator.get(indicator);
				ValuesByKey<Integer, Integer> nodesByOtherLeafishIndicator = new ValuesByKey<Integer, Integer>();
				//for (int iNode : nodeIndices) nodesByOtherLeafishIndicator.add(iNode, leafishIndicator(iNode, graph, nodeIndices));
				
				int maxNodes = (int)(bounds.getWidth() / 50);
				
				List<Integer> currentRow = new LinkedList<Integer>();
				//for (int otherIndicator : nodesByOtherLeafishIndicator.keySet()) {
					for (int iNode : nodeIndices) {//nodesByOtherLeafishIndicator.get(otherIndicator)) {
						currentRow.add(iNode);
						if (currentRow.size() > maxNodes) {
							rows.put(y, currentRow);
							currentRow = new LinkedList<Integer>();

							y += yStep;
						}
					}
				//}
				if (currentRow.size() > 0) {
					rows.put(y, currentRow);
					y += yStep;
				}
			}
			
			Map<N, Point2D> positions = new TreeMap<N, Point2D>();
			
			int lastNValues = -1;
			int lastNNodesInRow = -1;
			for (Map.Entry<Double,Collection<Integer>> row : rows.entrySet()) {
				y = row.getKey();
				Collection<Integer> nodeIndices = row.getValue();
				int nNodesInRow = nodeIndices.size();
				int nValues = nNodesInRow;//nNodesInRow * 3;
				
				if (lastNNodesInRow > 0) {
					int nMoreNodes = nNodesInRow - lastNNodesInRow;
					nValues = nNodesInRow + 2 * nMoreNodes;
				} else {
					if (lastNValues > nValues) nValues = lastNValues;
					else lastNValues = nValues;
				}
				//lastNNodesInRow = nNodesInRow;
				nValues *= 3;
				
				double xStep = bounds.getWidth()/(nValues+1);
				
				List<Double> values = new ArrayList<Double>(nValues);
				for (int i = nValues; i-- != 0;) values.add(xStep*(i+1));
				/*
				ValuesByKey<Double, CostAssignment<N>> cheapestNodesByValue = new ValuesByKey<Double, CostAssignment<N>>();
				for (int iNode : nodeIndices) {
					N node = nodeList.get(iNode);
					for (double value : values) {
						Point2D hypotheticPosition = new Point2D(value, y);
						double cost = GraphicConstraintsUtils.computeCost(
							node, 
							hypotheticPosition, graph, positions, bounds, 
							//GraphicConstraintsUtils.COST_COLLISION_BIT | 
							GraphicConstraintsUtils.COST_EDGE_BIT
							//GraphicConstraintsUtils.COST_ALL_BITS
						);
						cheapestNodesByValue.add(new CostAssignment<N>(node, hypotheticPosition, cost), value);
					}
				}
				if (xStep < step) step = xStep;
				
				Set<N> assignedNodes = new TreeSet<N>();
				for (double value : values) {
					for (CostAssignment<N> assignment : cheapestNodesByValue.get(value)) {
						N node = assignment.getElement();
						if (!assignedNodes.contains(node)) {
							assignedNodes.add(node);
							positions.put(node, assignment.getPosition());
							break;
						}
					}
				}*/
				Set<Double> assignedValues = new TreeSet<Double>();
				for (int iNode : nodeIndices) {
					N node = nodeList.get(iNode);
					double cheapestCost = -1;
					double cheapestValue = -1;
					Point2D cheapestPosition = null;
					for (double value : values) {
						if (assignedValues.contains(value)) continue;
						
						Point2D hypotheticPosition = new Point2D.Double(value, y);
						double cost = GraphicConstraintsUtils.computeCost(
							node, 
							hypotheticPosition, graph, edges, positions, bounds, 
							GraphicConstraintsUtils.COST_COLLISION_BIT | 
							GraphicConstraintsUtils.COST_EDGE_BIT |
							GraphicConstraintsUtils.COST_INTERSECTION_BIT
							//GraphicConstraintsUtils.COST_ALL_BITS
						);
						if (cheapestCost < 0 || cost < cheapestCost) {
							cheapestCost = cost;
							cheapestPosition = hypotheticPosition;
							cheapestValue = value;
						}
					}
					positions.put(node, cheapestPosition);
					assignedValues.add(cheapestValue);
				}
				if (xStep < step) step = xStep;
				
				
			}
			this.positions.putAll(positions);
			//for (int i = 1000; i-- != 0;)
			//for (int i = 50; i-- != 0;)
			//	gradientDescent(0.0004f, 0);//step/2);
		//}
		/*
		double rangeX = bounds.getWidth()/2, rangeY = bounds.getHeight()/2; 
		for (N node : graph.getNodeList()) {
			Point2D size = getNodeSize(node);
			Point2D.Double position = new Point2D.Double(
				bounds.getX()+bounds.getWidth()/2-rangeX/2+random.nextFloat()*rangeX,
				bounds.getY()+bounds.getHeight()/2+rangeY/2+random.nextFloat()*rangeY
			);
			positions.put(node, position);
		}*/
		invalidatePositions();
	}
	Point2D getNodeSize(N node) {
		return new Point2D.Double(30, 30);
	}
	public Map<N, Point2D> getPositions() {
		return positions;
	}
	public void setBestPositions(SortedMap<N, Point2D> positions) {
		this.bestPositions = positions;
		this.positions = new TreeMap<N, Point2D>(positions);
		bestCost = -1;
	}
	Point2D recenter(Point2D point) {
		double x = point.getX(), y = point.getY();
		
		if (x < bounds.getMinX()+margin.left) x = bounds.getX()+margin.left;
		else if (x > bounds.getMaxX()-margin.right) x = bounds.getX() + bounds.getWidth()-margin.right;
		
		if (y < bounds.getMinY()+margin.top) y = bounds.getY()+margin.top;
		else if (y > bounds.getMaxY()-margin.bottom) y = bounds.getY() + bounds.getHeight()-margin.bottom;
		
		return new Point2D.Double(x,y);
	}
	static final Point2D 
		NORTH_VECT = new Point2D.Double(0,10),
		SOUTH_VECT = new Point2D.Double(0,-10),
		WEST_VECT = new Point2D.Double(-10,0),
		EAST_VECT = new Point2D.Double(10,0),
		NORTH_WEST_VECT = new Point2D.Double(-10,10),
		SOUTH_WEST_VECT = new Point2D.Double(-10,-10),
		NORTH_EAST_VECT = new Point2D.Double(10,10),
		SOUTH_EAST_VECT = new Point2D.Double(10,-10)
		;
	
	static final Collection<Point2D> DIRECTIONS = Arrays.asList(new Point2D[] {
			NORTH_VECT,SOUTH_VECT, EAST_VECT, WEST_VECT,
			NORTH_EAST_VECT, NORTH_WEST_VECT, SOUTH_EAST_VECT, SOUTH_WEST_VECT
	});
	
	Point2D computeGradient(N node) {
		Point2D position = positions.get(node);
		if (position == null) return null;
		
		Map<Point2D,Double> values = new HashMap<Point2D, Double>(DIRECTIONS.size());
		
		double nodeCost = GraphicConstraintsUtils.computeCost(node, position, graph, edges, positions, bounds, GraphicConstraintsUtils.COST_ALL_BITS);
		
		for (Point2D direction : DIRECTIONS) {
			Point2D newPosition = new Point2D.Double(position.getX()+direction.getX(), position.getY()+direction.getY()); 
			double cost = GraphicConstraintsUtils.computeCost(node, newPosition, graph, edges, positions, bounds, GraphicConstraintsUtils.COST_ALL_BITS);
			if (Double.isNaN(cost) || Double.isInfinite(cost)) continue;
			
			values.put(direction, cost - nodeCost);
			//values.put(direction, cost);
		}
		if (values.isEmpty()) return null;
		
		return GraphicConstraintsUtils.computeBarycenter(values);
	}
	void gradientDescent(double parameter, double noise) {
		List<N> nodeList = graph.getNodeList();
		Map<N,Point2D> gradients = new TreeMap<N, Point2D>();
		
		
		if (true) {
			for (N node : nodeList) {
				Point2D gradient = computeGradient(node);
				if (gradient != null) gradients.put(node, gradient);
			}
			
			for (N node : nodeList) {
				Point2D oldPosition = positions.get(node);
				Point2D gradient = gradients.get(node);
				if (gradient == null) continue;
				
				Point2D newPosition = new Point2D.Double(
					oldPosition.getX() - gradient.getX() * parameter + (random.nextFloat()-0.5f)*2*noise,
					oldPosition.getY() - gradient.getY() * parameter + (random.nextFloat()-0.5f)*2*noise
				);	
				positions.put(node, recenter(newPosition));
			}
		} else {
			for (N node : nodeList) {
				Point2D oldPosition = positions.get(node);
				Point2D gradient = computeGradient(node);
				if (gradient == null) continue;
				Point2D newPosition = new Point2D.Double(
					oldPosition.getX() - gradient.getX() * parameter,
					oldPosition.getY() - gradient.getY() * parameter
				);	
				positions.put(node, recenter(newPosition));
			}
		}
	}
	
	boolean positionsValid = false;
	public void setBounds(Rectangle2D bounds) {
		if (this.bounds == null) {
			this.bounds = bounds;
			init();
		} else {
			//if (!this.bounds.equals(bounds)) invalidatePositions();
			this.bounds = bounds;
			for (Map.Entry<N,Point2D> e : bestPositions.entrySet()) {
				e.setValue(recenter(e.getValue()));
			}
			for (Map.Entry<N,Point2D> e : positions.entrySet()) {
				e.setValue(recenter(e.getValue()));
			}
		}
		
	}
	void invalidatePositions() {
		positionsValid = false;
	}
	public void setGraphAndCostGraphs(Graph<N> graph, List<Graph<N>> costGraphs) {
		this.graph = graph;
		this.costGraphs = costGraphs;
		positions = new TreeMap<N, Point2D>();
		bestPositions = new TreeMap<N, Point2D>(positions);
		edges = GraphicConstraintsUtils.getNonOrientedEdges(graph);
		if (bounds != null) {
			init();
		}		
	}
	public void init() {
		initializePositions();
		bestPositions = new TreeMap<N, Point2D>(positions);
		bestCost = GraphicConstraintsUtils.computeCost(costGraphs, edges, positions, bounds);
	}
	
	public void computePositions() {
		for (int i = 0; i < maxGradientIterations; i++) {
			gradientDescent(initialParameter, maxNoise / (i+1));
		}
	}
	
	
	public void adjustPositions(int maxIterations, double threshold, Set<N> variables, PositionProxy positionGetter) {
		
	}
	public int computePositions(int maxIterations, double threshold) {
		if (bounds == null) return -1;
		
		double lastCost = GraphicConstraintsUtils.computeCost(costGraphs, edges, positions, bounds), noise = 10;//maxNoise;
		double parameter = initialParameter;
		
		if (bestCost < 0) {
			bestCost = GraphicConstraintsUtils.computeCost(costGraphs, edges, bestPositions, bounds);
		}
		for (int i = 0; i < maxIterations; i++) {
			gradientDescent(parameter, noise / (i+1));
			
			double cost = GraphicConstraintsUtils.computeCost(costGraphs, edges, positions, bounds);
			if (cost <= threshold) return (i+1);
			if (lastCost >= 0) {
				double dif = cost - lastCost;
				if (dif < 0) dif = -dif;
				
				if (dif < threshold) {
					return (i+1);
				}
			}
			lastCost = cost;
			
			if (bestPositions == null || cost < bestCost || !positionsValid) {
				bestCost = cost;
				positionsValid = true;
				bestPositions = new TreeMap<N, Point2D>(positions);
			}
		}
		return -1;
	}
	public SortedMap<N, Point2D> getBestPositions() {
		return bestPositions == null ? positions : bestPositions;
	}
	public void draw(Graphics g) {
		Graphics2D g2d = (Graphics2D)g;
		g2d.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
		g2d.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
		g2d.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
		
		if (bestPositions.size() == 0) return;
		//if (!positionsValid) 
			//computePositions();
		//computeCost();
		List<N> nodeList = graph.getNodeList();
		
		for (int nodeIndex = nodeList.size(); nodeIndex-- != 0;) {
			N node = nodeList.get(nodeIndex);
			Point2D position = bestPositions.get(node);
			if (position == null) continue;
			
			int[] destinationIndices = graph.getLocalConnectivity().getEnds(nodeIndex).toArray();
			if (destinationIndices.length > 0) {
				if (false) {
					List<NodeComponent> components = new ArrayList<NodeComponent>();
					NodeComponent destinationComponent = new NodeComponent(node, bestPositions.get(node));
					for (int destinationIndex : destinationIndices) {
						N destination = nodeList.get(destinationIndex);
						components.add(new NodeComponent(destination, bestPositions.get(destination)));
						//Point2D destination = positions.get(nodeList.get(destinationIndex));
						//g.drawLine((int)position.getX(), (int)position.getY(), (int)destination.getX(), (int)destination.getY());
					}
					if (components.size() > 0) {
						g2d.setColor(Color.BLACK);
						g2d.draw(RelationShapesBuilder.createArrowsFromSingleSource(destinationComponent, components));
								//RelationShapesBuilder.createArrowsToSingleDestination(destinationComponent, components, 10f));
					}
				} else {
					for (int destinationIndex : graph.getLocalConnectivity().getEnds(nodeIndex).toArray()) {
						Point2D destination = bestPositions.get(nodeList.get(destinationIndex));
						if (destination == null) continue;
						
						double destX = destination.getX(), destY = destination.getY(), srcX = position.getX(), srcY = position.getY();
						if (graph.isOriented()) {
							double dX = destX - srcX, dY = destY - srcY;
							double angle = (double)Math.atan2(dY, dX);
							double deltaAngle = (double)(11.3 * Math.PI/12.0);
							double arrowLength = 15;
							//double dist = (double)Math.sqrt(dX*dX + dY*dY);
							double arrX = srcX + dX * 0.9f, arrY = srcY + dY * 0.9f;
							
							GeneralPath path = new GeneralPath();
							path.moveTo((float)arrX, (float)arrY);
							path.lineTo((float)(arrX+arrowLength*Math.cos(angle+deltaAngle)), (float)(arrY+arrowLength*Math.sin(angle+deltaAngle)));
							path.lineTo((float)(arrX+arrowLength*Math.cos(angle-deltaAngle)), (float)(arrY+arrowLength*Math.sin(angle-deltaAngle)));
							path.lineTo((float)arrX, (float)arrY);
							//g.drawLine((int)arrX, (int)arrY, (int)(arrX+arrowLength*Math.cos(angle-deltaAngle)), (int)(arrY+arrowLength*Math.sin(angle-deltaAngle)));
							//g.drawLine((int)arrX, (int)arrY, (int)(arrX+arrowLength*Math.cos(angle+deltaAngle)), (int)(arrY+arrowLength*Math.sin(angle+deltaAngle)));
							//g.drawLine((int)arrX, (int)arrY, (int)(arrX+arrowLength*Math.cos(angle-deltaAngle)), (int)(arrY+arrowLength*Math.sin(angle-deltaAngle)));
							g2d.fill(path);
						}
						g.drawLine((int)srcX, (int)srcY, (int)destX, (int)destY);
					}
				}
			}
		}
		for (int nodeIndex = nodeList.size(); nodeIndex-- != 0;) {
			N node = nodeList.get(nodeIndex);
			
			Point2D position = bestPositions.get(node);
			if (position == null) continue;
			//Point2D size = getNodeSize(node);
			
			String text = node.toString();
			
			drawString(g2d,g2d.getFontMetrics(),Color.BLACK,1.0f, text, position,valueTextInsets, SwingConstants.CENTER,0.0,true);
		}
	}
	Insets valueTextInsets = new Insets(5,5,5,5);
	void drawString(Graphics2D g2d, FontMetrics fontMetrics, Color color, float alpha, String text, Point2D referencePoint, Insets insets, int orientation, double rotationAngle,boolean drawBackBox) {//, int alignment) {
		Rectangle2D textBounds=fontMetrics.getStringBounds(text,g2d);
		/// xULC, yULC coordinates of the Upper Left Corner of bounds
		/// TODO convert this to xBL, yBL of text base line

		double xULC,yULC;

		double width=textBounds.getWidth(),
			height=textBounds.getHeight();
		double xRP=referencePoint.getX(), yRP=referencePoint.getY();
		switch (orientation) {
			case SwingConstants.NORTH:
				xULC=xRP-width/2.0;
				yULC=(yRP-height)-insets.bottom;
				break;
			case SwingConstants.SOUTH:
				xULC=xRP-width/2.0;
				yULC=yRP+insets.bottom;
				break;
			case SwingConstants.EAST:
				xULC=xRP+insets.right;
				yULC=yRP-height/2.0;
				break;
			case SwingConstants.WEST:
				xULC=(xRP-width)-insets.left;
				yULC=yRP-height/2.0;
				break;
			case SwingConstants.CENTER:
				xULC=xRP-width/2.0;
				yULC=yRP-height/2.0;

				break;

			default:

				throw new IllegalArgumentException("Invalid orientation : "+orientation);

		}

		double xBL,yBL;

		xBL=xULC;

		yBL=yULC+fontMetrics.getAscent();

		

		AffineTransform initialAffineTransform=g2d.getTransform();

		if (rotationAngle!=0) {

			g2d.transform(AffineTransform.getRotateInstance(rotationAngle,xRP,yRP));

		}

		if (drawBackBox) {

			setColor(g2d,Color.white,textBackBoxesAlpha);

			int arcd=textBackBoxCornerArcDiameter;

			g2d.fillRoundRect(-arcd/2+(int)xULC,(int)yULC,arcd+(int)textBounds.getWidth(),(int)textBounds.getHeight(),arcd,arcd);

			setColor(g2d,Color.white.darker(),textBackBoxesAlpha);

			g2d.drawRoundRect(-arcd/2+(int)xULC,(int)yULC,arcd+(int)textBounds.getWidth(),(int)textBounds.getHeight(),arcd,arcd);

		}

		setColor(g2d,color,alpha);

		g2d.drawString(text,(int)xBL,(int)yBL);

		//textLayout.draw(g2d,(double)xULC,(double)yULC);

		if (rotationAngle!=0) {

			g2d.setTransform(initialAffineTransform);

		}
	}
	void setColor(Graphics2D g2d, Color color, float alpha) {

		g2d.setColor(color);

		g2d.setComposite(AlphaComposite.getInstance(AlphaComposite.SRC_OVER,alpha));

	}
	
	
	float textBackBoxesAlpha = 0.9f;
	int textBackBoxCornerArcDiameter = 5;
	
	
}
