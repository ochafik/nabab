package nabab

import scala.reflect.ClassTag

object MinimumSpanningTree {
  def get[N : ClassTag, E : ClassTag : Ordering]
         (graphContainer: GraphContainer[N, E])
         : GraphContainer[N, E] = {
    val graph = graphContainer.graph
    val edges = graph.edges
    val nodes = graph.nodes.toSeq
    
    implicit val edgeOrdering = Ordering.by[Edge, E](graphContainer.getEdge)  
    val remainingEdges = new collection.mutable.PriorityQueue[Edge]()
    remainingEdges ++= edges
    
    val forests = nodes.map(Set(_)).toArray
    var forestCount = nodes.size
    var forestIndexesByNode = nodes.zipWithIndex.toMap
    
    val finalEdges = List[Edge]()
    while (forestCount > 1) {
      println("Forest count = " + forestCount)
      val edge = remainingEdges.dequeue()
      val origin = graph.origin(edge)
      val destination = graph.destination(edge)
      println(s"Edge: $edge = $origin -> $destination")
      
      val originForestIndex = forestIndexesByNode(origin)
      val destinationForestIndex = forestIndexesByNode(destination)
      
      if (originForestIndex != destinationForestIndex) {
        val originForest = forests(originForestIndex)
        val destinationForest = forests(destinationForestIndex)
        val newForest = originForest ++ destinationForest
        forestIndexesByNode = forestIndexesByNode ++ originForest.map(n => n -> destinationForestIndex)
        forests(destinationForestIndex) = newForest
        forests(originForestIndex) = null
        forestCount -= 1
      }
    }
    
    graphContainer.remove(
        nodes = graph.factory.makeNodeSet,
        edges = edges -- remainingEdges)
  }
}
