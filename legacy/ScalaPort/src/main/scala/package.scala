package object nabab {
  type Clique = Set[Node]
  
  implicit def valuedEdgeDefinition[E](v: (Node, Node, E)) = v match {
    case (origin, destination, value) =>
      ValuedEdgeDefinition[E](origin, destination, value)
  }
  implicit def unitValuedEdgeDefinition(v: (Node, Node)) = v match {
    case (origin, destination) =>
      ValuedEdgeDefinition[Unit](origin, destination, {})
  }
  implicit def edgeDefinition[E](v: (Node, Node, Edge)) = v match {
    case (origin, destination, edge) =>
      EdgeDefinition(origin, destination, edge)
  }
}

