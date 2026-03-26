
object CssPseudoParser {
  sealed trait PseudoToken {
    def start: Int
  }

  case class BlockStartToken(id: String, start: Int) extends PseudoToken
  case class PropertyToken(name: String, start: Int) extends PseudoToken
  case class UrlDefToken(id: String, start: Int) extends PseudoToken
  case class CommentToken(start: Int, end: Int) extends PseudoToken

  def getCommentEnd(source: String, fromOffset: Int): Option[Int] = {
    var i = fromOffset
    val length = source.length
    var end: Option[Int] = None
    while (i < length - 1 && end.isEmpty) {
      source(i) match {
        case '*' if source(i + 1) == '/' =>
          end = Some(i + 2)

        case _ =>
          i += 1
      }
    }
    end
  }

  def nextPseudoToken(source: String, fromOffset: Int): (PseudoToken, Int) = {

    var i = fromOffset
    val length = source.length

    def peek(n: Int = 0) = source(i + n)
    def consume(n: Int = 1) = i += n
    def take() = {
      val c = peek()
      consume(1)
      c
    }
    val isSpace = Set('_', '\t', '\n', '\r')
    def isId(c: Char) =
      Character.isLetterOrDigit(c) ||
      c == '_' ||
      c == '-' ||
      c == '.'

    def skipSpaces() = while (isSpace(peek())) consume()
    def takeWord(pred: Char => Boolean = isId): Option[String] = {
      skipSpaces()
      var w = ""
      var done = false
      var start: Option[Int] = None
      while (i < length) {
        if (!pred(peek()))
          return None
        else if (start == None)
          start = Some(i)
        else {
          consume()
          return Some(source.substring(start.get, i))
        }
      }
      return None
    }

    var token: PseudoToken = null
    def done = token == null
    var inBlock = false

    while (i < length && !done) {
      skipSpaces()
      peek() match {
        case '/' if peek(1) == '*' =>
          val start = i
          consume(2)

          val end = getCommentEnd(source, start).get
          i = end
          token = CommentToken(start, end)

        case '{' =>
          inBlock = true
          consume()

        case '}' =>
          inBlock = false
          consume()

        case '@' =>
          val start = i
          consume()

          val w1 = takeWord()
          val w2 = takeWord()

          if (w1 == "url") {
            token = UrlDefToken(id = w2.get, start)
          }

        case _ =>
          val start = i
          val id = takeWord().get
          if (inBlock)
            BlockStartToken(id, start)
          else
            PropertyToken(id, start)
      }
    }
    ???
  }
}

object TestCssPseudoParser extends App {

}
