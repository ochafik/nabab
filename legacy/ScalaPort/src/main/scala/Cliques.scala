package nabab

import scala.collection.SortedSet
import scala.collection.breakOut

object Cliques {

  def get(graph: Graph): List[Clique] = {
    (for {
      node <- graph.nodes;
      clique <- growOrderedCliques(
          graph = graph,
          clique = Set(node),
          lastNode = node,
          neighbours = graph.neighbours(node),
          nodesKnownNotToBeInClique = Set());
      if clique.size > 1
    } yield clique)(breakOut)
  }

  private[this]
  def growOrderedCliques(graph: Graph,
                         clique: Clique,
                         lastNode: Node,
                         neighbours: Set[Node],
                         nodesKnownNotToBeInClique: Set[Node])
                        : Iterable[Clique] = {
//    println("Blacklist: " + nodesKnownNotToBeInClique)
//    println("Skipping: " + neighbours.filter(nodesKnownNotToBeInClique))
    var (newCandidates, newBlacklisted) =
      neighbours.toIterator
        .filterNot(nodesKnownNotToBeInClique)
        .toSeq
        .partition(neighbour => clique.forall(n => graph.edge(n, neighbour).nonEmpty))

    if (newCandidates.exists(_ > lastNode)) {
      // Could have grown with a different ordering: bailing out.
      Seq()
    } else if (newCandidates.isEmpty) {
      // Can't grow anymore: the clique is maximal.
      Seq(clique)
    } else {
      // Try and grow with each candidate.
      for {
        candidate <- newCandidates;
        candidateNeighbours = graph.neighbours(candidate);
        newNeighbours = (
          neighbours.toIterator.filterNot(_ == candidate) ++
          candidateNeighbours.toIterator.filterNot(clique)
        ).toSet;  
        sub <- growOrderedCliques(
          graph = graph,
          clique = clique + candidate,
          lastNode = candidate,
          neighbours = newNeighbours,
          nodesKnownNotToBeInClique = nodesKnownNotToBeInClique ++ newBlacklisted
        )
      } yield {
        sub
      }
    }
  }
}
