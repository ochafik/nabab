package nabab

case class Node(id: Int) extends AnyVal with Ordered[Node] {
  def compare(that: Node) = id.compare(that.id)
}

case class Edge(id: Int) extends AnyVal with Ordered[Edge] {
  def compare(that: Edge) = id.compare(that.id)
}

case class EdgeDefinition(origin: Node, destination: Node, edge: Edge) {
  def inverse = this.copy(origin = destination, destination = origin)
}
object EdgeDefinition {
  def apply(origin: Node, destination: Node)(implicit factory: GraphFactory) =
    new EdgeDefinition(origin, destination, factory.makeEdge(origin, destination))
  
//  def apply(origin: Node, destination: Node, edge: Edge) =
//    new EdgeDefinition(origin, destination, edge)
}

trait GraphLike {
  implicit def factory: GraphFactory
  def nodes: Set[Node]
  def edges: Set[Edge]

  def origin(edge: Edge): Node
  def destination(edge: Edge): Node

  def incoming(node: Node): Set[Edge]
  def outgoing(node: Node): Set[Edge]
  def edge(origin: Node, destination: Node): Option[Edge] =
    outgoing(origin).find(e => this.destination(e) == destination)
  
  def add(newNodes: Set[Node] = Set(), newEdges: Seq[EdgeDefinition] = Seq()): Graph

  def remove(removedNodes: Set[Node] = Set(), removedEdges: Set[Edge] = Set()): Graph
}

trait GraphUtils {
  self: Graph =>

  def destinations(node: Node): Set[Node] =
    outgoing(node).map(destination)

  def origins(node: Node): Set[Node] =
    outgoing(node).map(destination)

  def neighbours(node: Node): Set[Node] =
    destinations(node) ++ origins(node)

  def inverse(edgeToInverse: Edge): Option[Edge] =
    edge(destination(edgeToInverse), origin(edgeToInverse))

  def inverseDefinition(edge: Edge) =
    EdgeDefinition(destination(edge), origin(edge), edge)
}

trait GraphDebugging {
  self: Graph =>

  def printGraph() {
    printNodes()
    printEdges()
  }
  def printNodes() {
    for (node <- nodes) {
      println(s"\t${incoming(node).map(origin)} -> $node -> ${outgoing(node).map(destination)}")
    }
  }
  def printEdges() {
    for (edge <- edges) {
      println(s"\t$edge: ${origin(edge)} -> ${destination(edge)}")
    }
  }
}

trait Graph
  extends GraphLike
  with GraphUtils
  with GraphDebugging
trait UnorientedGraph extends Graph
