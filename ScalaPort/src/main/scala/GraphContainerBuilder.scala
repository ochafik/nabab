package nabab

import scala.reflect.ClassTag

case class GraphContainerBuilder[N : ClassTag, E : ClassTag](graph: Graph)(implicit factory: GraphFactory) {
  private[this] var g: GraphContainer[N, E] =
    DefaultGraphContainer[N, E](graph)
  
  def mutate[R](f: GraphContainer[N, E] => (GraphContainer[N, E], R)): R = {
    val (newG, r) = f(g)
    g = newG
    r
  }

  def container = g
  
  override def toString = g.toString
}

object GraphContainerBuilder {
  def oriented[N : ClassTag, E : ClassTag](implicit factory: GraphFactory) = 
    GraphContainerBuilder[N, E](DefaultGraph(factory))

  def unoriented[N : ClassTag, E : ClassTag](implicit factory: GraphFactory) = 
    GraphContainerBuilder[N, E](DefaultUnorientedGraph(DefaultGraph(factory)))

}
