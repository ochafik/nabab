package nabab

trait GraphProxy[P <: GraphProxy[P]] extends Graph {
  def underlying: Graph
  def wrap(graph: Graph): P

  override def nodes = underlying.nodes
  override def edges = underlying.edges

  override def origin(edge: Edge) = underlying.origin(edge)
  override def destination(edge: Edge) = underlying.destination(edge)

  override def incoming(node: Node) = underlying.incoming(node)
  override def outgoing(node: Node) = underlying.outgoing(node)

  override def add(newNodes: Set[Node], newEdges: Seq[EdgeDefinition]) =
    wrap(underlying.add(newNodes, newEdges))

  override def remove(removedNodes: Set[Node], removedEdges: Set[Edge]) =
    wrap(underlying.remove(removedNodes, removedEdges))
}
