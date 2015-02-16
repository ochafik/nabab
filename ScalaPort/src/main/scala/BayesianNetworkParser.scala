package nabab

import java.io.File
import scala.xml.XML
import scala.collection.breakOut

object BayesianNetworkParser {
    
  private[this] val propertyRx = raw"\s*(\w+)\s*=\s*(.*?)\s*"r
  
  def loadFile(file: File)
              (implicit factory: GraphFactory)
              : BayesianNetwork = {
    val xml = XML.loadFile(file)
    assert(xml.label.toString == "BIF")
    
    val network = xml \ "NETWORK"
    
    val bvars: Seq[BVar] = for (variable <- network \ "VARIABLE" toList) yield {
      BVar(
          name = variable \ "NAME" text,
          properties = (variable \ "PROPERTY").map(_.text).map({
            case propertyRx(key, value) => key -> value
          }).toMap,
          values = (variable \ "OUTCOME" toList).map(_.text))
    } 
    
    val bvarsByName = bvars.map(v => v.name -> v).toMap
    val bnodes: Seq[BNode] = for (definition <- network \ "DEFINITION" toList) yield {
      BNode(
        bvar = bvarsByName(definition \ "FOR" text),
        dependencies = (definition \ "GIVEN" toList).map(_.text).map(bvarsByName),
        table = (definition \ "TABLE" text).split(" ").map(_.toDouble))
    }
    // TODO: use indices instead.
    val bnodesByBVar = bnodes.map(n => n.bvar -> n).toMap
    
    var builder = new GraphContainerBuilder[BNode, Unit](DefaultGraph(factory))
    val nodesByBNode = bnodes.zip(builder.mutate(_.addNodes(bnodes: _*))).toMap
    val edges = for {
      bnode <- bnodes;
      destination = nodesByBNode(bnode);
      depBVar <- bnode.dependencies
    } yield {
      ValuedEdgeDefinition(
          origin = nodesByBNode(bnodesByBVar(depBVar)),
          destination = destination,
          value = {})
    }
    builder.mutate(_.addEdges(edges: _*))
    
    BayesianNetwork(
        name = network \ "NAME" text,
        container = builder.container)
  }
}
