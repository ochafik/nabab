package nabab

case class DefaultUnorientedGraph(underlying: Graph)
    extends GraphProxy[DefaultUnorientedGraph]
    with UnorientedGraph {

  override def factory = underlying.factory
  override def wrap(graph: Graph) = DefaultUnorientedGraph(graph)

  override def add(newNodes: Set[Node], newEdges: Seq[EdgeDefinition]) =
    super.add(newNodes, newEdges ++ newEdges.map(_.inverse))

  override def remove(removedNodes: Set[Node], removedEdges: Set[Edge]) =
    super.remove(removedNodes, removedEdges ++ removedEdges.flatMap(underlying.inverse))
}

object DefaultUnorientedGraph {
  def disorient(graph: Graph) =
    DefaultUnorientedGraph(
      graph.add(newEdges = graph.edges.toSeq.map(graph.inverseDefinition)))
}
