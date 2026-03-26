package nabab

object Moralization {
  def moralize(graph: Graph): UnorientedGraph = {
    import graph.factory
    val edges = for {
      node <- graph.nodes.toIterator;
      parents = graph.origins(node).toList;
      parentCount = parents.size;
      iParent1 <- 0 until parentCount - 1;
      parent1 = parents(iParent1);
      iParent2 <- iParent1 + 1 until parentCount;
      parent2 = parents(iParent2)
    } yield {
      EdgeDefinition(parent1, parent2)
    }
    
    DefaultUnorientedGraph.disorient(graph.add(newEdges = edges.toSeq))
  }
}
