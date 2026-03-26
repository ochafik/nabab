package nabab

case class GraphPrinter(graph: Graph, nodeToString: Node => String, edgeToString: Edge => String) {

  def describeOriginsAndDestinations(node: Node): String = {
    val Seq(origins, Seq(n), destinations) =
      Seq(graph.incoming(node).map(graph.origin), Seq(node), graph.outgoing(node).map(graph.destination))
        .map(_.map(nodeToString))
    s"\t$origins -> $n -> $destinations)}"
  }
    
  def describeEdge(edge: Edge) =
    s"${nodeToString(graph.origin(edge))} -> ${nodeToString(graph.destination(edge))} : ${edgeToString(edge)}"
    
    
  def printGraph() {
    for (node <- graph.nodes) {
      println("\t" + describeOriginsAndDestinations(node))
    }
    for (edge <- graph.edges) {
      println(s"\t" + describeEdge(edge))
    }
  }
}
