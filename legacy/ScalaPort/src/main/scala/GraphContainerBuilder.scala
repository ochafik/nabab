package nabab

import scala.reflect.ClassTag

case class GraphContainerBuilder[N : ClassTag, E : ClassTag](initialGraph: Graph)(implicit factory: GraphFactory) {
  private[this] var _container: GraphContainer[N, E] =
    DefaultGraphContainer[N, E](initialGraph)
  
  def mutate[R](f: GraphContainer[N, E] => (GraphContainer[N, E], R)): R = {
    val (newContainer, r) = f(_container)
    _container = newContainer
    r
  }

  def container = _container
  def graph = _container.graph
  
  override def toString = graph.toString
}

object GraphContainerBuilder {
  def oriented[N : ClassTag, E : ClassTag](implicit factory: GraphFactory) = 
    GraphContainerBuilder[N, E](DefaultGraph(factory))

  def unoriented[N : ClassTag, E : ClassTag](implicit factory: GraphFactory) = 
    GraphContainerBuilder[N, E](DefaultUnorientedGraph(DefaultGraph(factory)))

}
