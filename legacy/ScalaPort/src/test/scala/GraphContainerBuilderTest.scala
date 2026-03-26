package nabab

package test

import org.junit._
import org.junit.Assert._

import org.scalatest.DiagrammedAssertions._

class GraphContainerBuilderTest {
//  class Tester {
//    implicit val factory = new DefaultGraphFactory
//    val builder = GraphContainerBuilder.oriented[String, Int]
//    
//    def container = builder.container
//    def graph = container.graph
//    
//  }
  @Test
  def testBuildOriented {
    implicit val factory = new DefaultGraphFactory
    val builder = GraphContainerBuilder.oriented[String, Int]
    
    val Seq(a, b, c, d) = builder.mutate(_.addNodes("a", "b", "c", "d"))
    println("Oriented graph after add: " + builder.graph)
    val Seq(
        a_b,
        b_c,
        c_d,
        b_d
    ) = builder.mutate(_.addEdges(
        (a, b, 0),
        (b, c, 10),
        (c, d, 20),
        (b, d, 30)
    ))

    val graph = builder.container.graph
    assert(graph.nodes == Set(a, b, c, d))

    builder.container.printGraph()
//    println("graph: " + graph)
//    println("nodes: " + graph.nodes)
//    println("edges: " + graph.edges)

    assert(graph.destinations(b) == Set(c, d))
    assert(graph.edge(b, c) == Some(b_c))
      
    def testOrientedEdge(x: Node, y: Node, e: Edge) {
      assert(graph.edge(x, y) == Some(e))
      assert(graph.edge(y, x) == None)
    }
    testOrientedEdge(a, b, a_b)
    testOrientedEdge(b, c, b_c)
    testOrientedEdge(c, d, c_d)
    testOrientedEdge(b, d, b_d)
  }
  
  @Test
  def testBuildUnoriented {
    implicit val factory = new DefaultGraphFactory
    val builder = GraphContainerBuilder.unoriented[String, Int]
    
    val Seq(a, b, c, d) = builder.mutate(_.addNodes("a", "b", "c", "d"))
    println("Unoriented graph after add: " + builder.graph)
    val Seq(
        a_b,
        b_c,
        c_d,
        b_d
    ) = builder.mutate(_.addEdges(
        (a, b, 0),
        (b, c, 10),
        (c, d, 20),
        (b, d, 30)
    ))

    val graph = builder.container.graph
    assert(graph.nodes == Set(a, b, c, d))

    builder.container.printGraph()
//    println("graph: " + graph)
//    println("nodes: " + graph.nodes)
//    println("edges: " + graph.edges)

    assert(graph.destinations(b) == Set(a, c, d))
    assert(graph.edge(b, c) == Some(b_c))
      
    def testUnorientedEdge(x: Node, y: Node, e: Edge) {
      assert(graph.edge(x, y) == Some(e))
      assert(graph.edge(y, x).nonEmpty)
    }
    testUnorientedEdge(a, b, a_b)
    testUnorientedEdge(b, c, b_c)
    testUnorientedEdge(c, d, c_d)
    testUnorientedEdge(b, d, b_d)
  }
}
