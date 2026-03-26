package nabab

package test

import org.junit._
import org.junit.Assert._

import org.scalatest.DiagrammedAssertions._

class MinimumSpanningTreeTest {

  @Test
  def testMinimumSpanningTree {
    implicit val factory = new DefaultGraphFactory
    val builder = GraphContainerBuilder.unoriented[String, Int]

    val Seq(a, b, c, d) = builder.mutate(_.addNodes("a", "b", "c", "d"))
    builder.mutate(_.addEdges(
        (a, b, 0),
        (b, c, 10),
        (c, d, 20),
        (b, d, 30)
    ))

    val mst = MinimumSpanningTree.get(builder.container)
    println("Minimum spanning tree:")
    mst.printGraph()
    
    val graph = mst.graph
    val nodes = graph.nodes
    assert(nodes == builder.graph.nodes)

    assert(Traversals.findReachableNodes(graph, a) == nodes)

    val mstEdges = mst.graph.edges
    val edges = builder.graph.edges
    assert(mstEdges != edges)
    assert(mstEdges.size == 2 * 3)
  }
}
