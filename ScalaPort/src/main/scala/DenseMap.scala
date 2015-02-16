package nabab

case class DenseIntMap(emptyValue: Int = 0, data: Vector[Int] = Vector()) extends Map[Int, Int] {
  override def +[B1 >: Int](kv: (Int, B1)): DenseIntMap = {
    val size = data.size
    val (key, value: Int) = kv
    this.copy(data = (
      if (key >= size) {
        val countToAdd = key - size + 1
        data ++ (for (i <- 1 to countToAdd) yield
            if (i == countToAdd) value else emptyValue)
      } else {
        data.updated(key, value)
      }
    ))
  }

  override def -(key: Int): DenseIntMap =
    this.copy(data = data.updated(key, 0))

  override def get(key: Int) =
    if (key >= data.size)
      None
    else 
      Some(data(key)).filter(_ != emptyValue)

  override lazy val toSeq: Seq[(Int, Int)] =
    data.zipWithIndex collect {
      case (v, i) if v != emptyValue =>
        (i, v)
    }
  
  def iterator = toSeq.iterator
}
