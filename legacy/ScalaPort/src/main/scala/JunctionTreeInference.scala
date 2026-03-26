package nabab

object JunctionTreeInference {
  def process(graph: Graph) = {
    val moral = Moralization.moralize(graph)
    val junctionGraph = JunctionGraph.get(moral)
    val junctionTree = MinimumSpanningTree.get(junctionGraph)

    // TODO continue    
    junctionTree
  }
}
