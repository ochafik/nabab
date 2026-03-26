package nabab

case class BVar(name: String, properties: Map[String, String], values: Seq[Any]) {
  val valueCount = values.size 
}
case class BVal(bvar: BVar, index: Int) {
  def value = bvar.values(index)
}
case class BNode(bvar: BVar,
                 dependencies: Seq[BVar],
                 table: Seq[Double]) {
  def getValue(dependencies: Seq[BVal]): Double = {
    ???
  }
}

case class BayesianNetwork(
    name: String,
    container: GraphContainer[BNode, Unit])
