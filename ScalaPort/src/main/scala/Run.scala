package nabab

import java.io.File

/**
 * Test app to help debug.
 */
object Run extends App {
  implicit val factory = new DefaultGraphFactory()
  
  var builder = new GraphContainerBuilder[String, Double](DefaultUnorientedGraph(DefaultGraph(factory)))
  
  println(builder.container)
  val Seq(a, b) = builder.mutate(_.addNodes("a", "b"))
  val Seq(c, d) = builder.mutate(_.addNodes("c", "d"))
  println(builder.container)
  val Seq(a_b, c_d) = builder.mutate(_.addEdges(
      (a, b, 1.0),
      (c, d, 2.0)
  ))
  println(builder.container)

  val cliques = Cliques.get(builder.container.graph)
  println("Cliques:")
  println(cliques)
  
  val network = BayesianNetworkParser.loadFile(new File("../src/main/resources/com/ochafik/math/bayes/alarm.xml"))
  println(network)
  println(s"""
    network.nodes = ${network.container.graph.nodes.size}
    network.edges = ${network.container.graph.edges.size}
  """)

  
  val jt = JunctionTreeInference.process(network.container.graph)
  println(jt)
  println(s"""
    jt.nodes = ${jt.graph.nodes.size}
    jt.edges = ${jt.graph.edges.size}
  """)
}
