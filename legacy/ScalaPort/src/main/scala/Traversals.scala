package nabab

object Traversals {
//  type Traverser = PartialFunction[Node, Unit]
//  def depthFirst(graph: Graph, start: Node)(f: Traverser): Boolean = {
//    var success = true
//    if (f.isDefinedAt(start)) {
//      for (destination <- graph.destinations(start)) {
//        depthFirst(graph, destination)(f)
//      }
//      f(start)
//    }
//    success
//  }
  def findReachableNodes(graph: Graph, start: Node): Set[Node] = {
    var seen = collection.mutable.Set[Node]()
    def visit(node: Node) {
      if (seen.add(node)) {
        for (destination <- graph.destinations(node)) {
          visit(destination)   
        }
      }
    }
    visit(start)
    seen.toSet
  } 
//  def widthFirst(graph: Graph, start: Node)(f: Traverser): Boolean = {
//    var success = true
//    for (destination <- graph.destinations(start); if success) {
//      success = depthFirst(graph, destination)(f)
//      if (success) {
//        f(start)
//      }
//    }
//    success
//  }
//    ???
}