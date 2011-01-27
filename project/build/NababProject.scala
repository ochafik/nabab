import sbt._
import FileUtilities.{write, Newline}

class NababProject(info: ProjectInfo) 
extends DefaultProject(info) 
   with AutoCompilerPlugins
{
  import java.io.File
  
  val javaNet = "java.net" at "http://download.java.net/maven/2/"
  val nativelibs4javaRepo = "NativeLibs4Java Repository" at "http://nativelibs4java.sourceforge.net/maven/"
  
  override def libraryDependencies = Set(
    //"trove" % "trove" % "1.1-beta-5",
    "net.sf.trove4j" % "trove4j" % "2.0.2",
    "org.swinglabs" % "swingx" % "1.6.1",
    "org.swinglabs" % "jxlayer" % "3.0.4",
    "net.java.dev.timingframework" % "timingframework" % "1.0",
    
    //"com.kenai.nbpwr" % "org-jdesktop-animation-transitions" % "0.11.2",
    
    //"com.kenai.nbpwr" % "org-jdesktop-swingx" % "1.6-201002261215",
    //"com.kenai.nbpwr" % "org-jdesktop-animation-timing" % "1.0-201002281504",
    //"com.kenai.nbpwr" % "org-jdesktop-ws" % "1.0-201002281504",
    
    
    "junit" % "junit" % "4.7" % "test->default",
    "com.novocode" % "junit-interface" % "0.4" % "test->default"
    //"org.scala-tools.testing" %% "specs" % "1.6.5" % "test->default",
    
    //"com.nativelibs4java" %% "buswing" % "0.1.1-SNAPSHOT" from "http://nativelibs4java.sourceforge.net/maven/com/nativelibs4java/buswing_2.8.0/0.1.1-SNAPSHOT/buswing-0.1.1-SNAPSHOT.jar"
  ) ++ super.libraryDependencies
  
  //val scalacl = compilerPlugin("com.nativelibs4java" % "scalacl-compiler-plugin" % "0.1")
  
}

