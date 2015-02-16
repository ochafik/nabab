package nabab

import java.util.concurrent.atomic.AtomicInteger

trait GraphFactory {
  def makeFactory: GraphFactory
  def makeNode: Node
  def makeGraph = DefaultGraph(this)
  def makeEdge(origin: Node, destination: Node): Edge
  def makeNodeSet: Set[Node]
  def makeEdgeSet: Set[Edge]
  def makeEdgeNodeMap: Map[Edge, Node]
  def makeNodeMap[V]: Map[Node, V]
  def makeEdgeMap[V]: Map[Edge, V]
}

class DefaultGraphFactory extends GraphFactory {
  private[this] val nextNodeId = new AtomicInteger
  private[this] val nextEdgeId = new AtomicInteger

  override def makeFactory = new DefaultGraphFactory
  
  // TODO: use specialized sets and maps
  override def makeNodeSet = Set[Node]()
  override def makeEdgeSet = Set[Edge]()
  override def makeNode = Node(nextNodeId.getAndIncrement)
  override def makeEdge(origin: Node, destination: Node) =
    Edge(nextEdgeId.getAndIncrement)
  override def makeEdgeNodeMap = Map[Edge, Node]()
  override def makeNodeMap[V] = Map[Node, V]()
  override def makeEdgeMap[V] = Map[Edge, V]()
}
