package nabab

object JunctionGraph {
    
  private[this] def makeJunctionGraphBuilder(implicit factory: GraphFactory) = 
    GraphContainerBuilder.unoriented[Clique, Unit]
    
  def get(graph: UnorientedGraph): GraphContainer[Clique, Unit] = {
    val cliques = Cliques.get(graph).toArray
    
    val builder = makeJunctionGraphBuilder(graph.factory.makeFactory)
    
    val cliqueIndicesByNode =
      (for ((clique, cliqueIndex) <- cliques.zipWithIndex;
            node <- clique) yield { node -> cliqueIndex })
      .groupBy(_._1).map {
        case (node, nodeCliquePairs) =>
          node -> nodeCliquePairs.map(_._2)
      }
    
    val cliqueNodes = builder.mutate(_.addNodes(cliques: _*))

    val edges = for {
      (cliqueNode, cliqueIndex) <- cliqueNodes.zipWithIndex;
      clique = cliques(cliqueIndex);
      node <- clique;
      otherCliqueIndex <- cliqueIndicesByNode(node);
      if otherCliqueIndex != cliqueIndex
    } yield {
      ValuedEdgeDefinition(
          origin = cliqueNode,
          destination = cliqueNodes(otherCliqueIndex),
          value = {})
    }
    builder.mutate(_.addEdges(edges: _*))
    
    builder.container
  } 
}
