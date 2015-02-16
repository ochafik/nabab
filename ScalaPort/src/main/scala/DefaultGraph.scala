package nabab

object DefaultGraph {
  def apply(implicit factory: GraphFactory) =
    new DefaultGraph(
      nodes = factory.makeNodeSet,
      edges = factory.makeEdgeSet,
      destinations = factory.makeEdgeNodeMap,
      origins = factory.makeEdgeNodeMap,
      incomings = factory.makeNodeMap[Set[Edge]],
      outgoings = factory.makeNodeMap[Set[Edge]])
}

case class DefaultGraph(
    nodes: Set[Node],
    edges: Set[Edge],
    destinations: Map[Edge, Node],
    origins: Map[Edge, Node],
    incomings: Map[Node, Set[Edge]],
    outgoings: Map[Node, Set[Edge]])
   (implicit val factory: GraphFactory)
        extends Graph {
  
  override def origin(edge: Edge) = origins(edge)
  override def destination(edge: Edge) = destinations(edge)

  override def incoming(node: Node) = incomings(node)
  override def outgoing(node: Node) = outgoings(node)

  private[this]
  def fillWithDefault(nodes: Set[Node],
                      map: Map[Node, Set[Edge]])
                     : Map[Node, Set[Edge]] =
    map ++ (for (n <- nodes -- map.keys) yield (n -> factory.makeEdgeSet))
  
  override def add(newNodes: Set[Node], newEdges: Seq[EdgeDefinition]) =
    DefaultGraph(
      nodes = nodes ++ newNodes,
      edges = edges ++ newEdges.map(_.edge),
      destinations = destinations ++ newEdges.map(e => e.edge -> e.destination),
      origins = origins ++ newEdges.map(e => e.edge -> e.origin),
      // incomings = incomings,
      // outgoings = outgoings)
      incomings = fillWithDefault(newNodes, incomings ++ newEdges.groupBy(_.destination).toSeq.map({
        case (destination, edges) =>
          destination -> (incomings(destination) ++ edges.map(_.edge))
      })),
      outgoings = fillWithDefault(newNodes, outgoings ++ newEdges.groupBy(_.origin).toSeq.map({
        case (origin, edges) =>
          origin -> (outgoings(origin) ++ edges.map(_.edge))
      })))

  override def remove(removedNodes: Set[Node], removedEdges: Set[Edge]) = {
    val allRemovedEdges: Set[Edge] =
      removedEdges ++
      removedNodes.flatMap(incomings) ++
      removedNodes.flatMap(outgoings)
      
    type Connection = (Node, Set[Edge])
    val transformConnections: PartialFunction[Connection, Connection] = {
      case (node, edges) if !removedNodes(node) =>
        (node, edges.filterNot(allRemovedEdges))
    }
    DefaultGraph(
        nodes = nodes -- removedNodes,
        edges = edges -- allRemovedEdges,
        destinations = destinations -- allRemovedEdges,
        origins = origins -- allRemovedEdges,
        incomings = incomings.toIterator.collect(transformConnections).toMap,
        outgoings = outgoings.toIterator.collect(transformConnections).toMap)
  }
}
