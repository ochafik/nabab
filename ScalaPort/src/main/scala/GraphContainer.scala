package nabab

import scala.reflect.ClassTag

case class ValuedEdgeDefinition[E](origin: Node, destination: Node, value: E) {
  def toEdgeDefinition(implicit factory: GraphFactory) =
    EdgeDefinition(
        origin = origin,
        destination = destination,
        edge = factory.makeEdge(origin, destination))
}

trait GraphContainer[N, E] {
  def getNode(node: Node): N
  def getEdge(edge: Edge): E

  def graph: Graph

  def addNodes(nodeValues: N*): (GraphContainer[N, E], Seq[Node])
  def addEdges(edgeValues: ValuedEdgeDefinition[E]*): (GraphContainer[N, E], Seq[Edge])

  def remove(nodes: Set[Node], edges: Set[Edge]): GraphContainer[N, E]
}

object DefaultGraphContainer {
  def apply[N : ClassTag, E : ClassTag](graph: Graph)(implicit factory: GraphFactory) =
    new DefaultGraphContainer[N, E](
      nodeMappings = factory.makeNodeMap[N],
      edgeMappings = factory.makeEdgeMap[E],
      graph = graph)
}

// TODO: pass a factory for these Map[Node, _], Set[Node] and al.
case class DefaultGraphContainer[N : ClassTag, E : ClassTag](
    nodeMappings: Map[Node, N],
    edgeMappings: Map[Edge, E],
    graph: Graph)
   (implicit val factory: GraphFactory)
        extends GraphContainer[N, E] {

  lazy val hasUnitEdges =
    implicitly[ClassTag[E]].runtimeClass == classOf[Unit]

  override def getNode(node: Node) = nodeMappings(node)
  override def getEdge(edge: Edge) =
    if (hasUnitEdges)
      {}.asInstanceOf[E]
    else
      edgeMappings(edge)

  override def addNodes(nodeValues: N*): (GraphContainer[N, E], Seq[Node]) = {
    val newNodesMapping = nodeValues.map(nodeValue => factory.makeNode -> nodeValue)
    val newContainer = this.copy(
        nodeMappings = nodeMappings ++ newNodesMapping,
        graph = graph.add(newNodes = newNodesMapping.toIterator.map(_._1).toSet))

    newContainer -> newNodesMapping.map(_._1)
  }

  override def addEdges(edgeValues: ValuedEdgeDefinition[E]*): (GraphContainer[N, E], Seq[Edge]) = {
    val (newEdgesMapping, newEdges) = {
      if (hasUnitEdges) {
        // Don't create edge mappings for Unit edge values.
        (Seq[(Edge, E)](), edgeValues.map(e => {
          assert(e.value == {})
          e.toEdgeDefinition
        })) 
      } else {
        edgeValues.map(ev => {
          val e = ev.toEdgeDefinition
          ((e.edge -> ev.value), e)
        }).unzip
      }
    }

    val newContainer = this.copy(
        edgeMappings = edgeMappings ++ newEdgesMapping,
        graph = graph.add(newEdges = newEdges))

    newContainer -> newEdgesMapping.map(_._1)
  }

  override def remove(removedNodes: Set[Node], removedEdges: Set[Edge]): GraphContainer[N, E] = {
    this.copy(
        nodeMappings = nodeMappings -- removedNodes,
        edgeMappings = edgeMappings -- removedEdges,
        graph = graph.remove(
            removedNodes = removedNodes,
            removedEdges = removedEdges))
  }
}
