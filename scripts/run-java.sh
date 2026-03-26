#!/usr/bin/env bash
#
# Build and run the NABAB Bayesian Network engine (Java version).
#
# Usage:
#   ./scripts/run-java.sh              # build and launch the Baya GUI
#   ./scripts/run-java.sh --build-only # compile without running
#   ./scripts/run-java.sh --run-only   # run without recompiling
#
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DIR="$PROJECT_DIR/src/main/java"
RES_DIR="$PROJECT_DIR/src/main/resources"
BUILD_DIR="$PROJECT_DIR/build/classes"
LIB_DIR="$PROJECT_DIR/lib"

MAIN_CLASS="com.ochafik.math.bayes.display.Baya"

# Classpath: compiled classes + all JARs in lib/
CP="$BUILD_DIR"
for jar in "$LIB_DIR"/*.jar; do
  CP="$CP:$jar"
done

# JVM flags needed for JDK 17+ module access
JVM_FLAGS=(
  --add-exports jdk.compiler/com.sun.tools.javac.tree=ALL-UNNAMED
  --add-opens java.desktop/javax.swing=ALL-UNNAMED
  --add-opens java.desktop/javax.swing.plaf.basic=ALL-UNNAMED
  --add-opens java.desktop/java.awt=ALL-UNNAMED
)

build() {
  echo "=== Downloading dependencies (if needed) ==="

  # SwingX
  if [ ! -f "$LIB_DIR/swingx-all-1.6.4.jar" ]; then
    echo "  Downloading swingx-all-1.6.4.jar..."
    curl -fSL -o "$LIB_DIR/swingx-all-1.6.4.jar" \
      "https://repo1.maven.org/maven2/org/swinglabs/swingx/swingx-all/1.6.4/swingx-all-1.6.4.jar"
  fi

  # TimingFramework (org.jdesktop.animation.timing)
  if [ ! -f "$LIB_DIR/timingframework-1.0.jar" ]; then
    echo "  Downloading timingframework-1.0.jar..."
    curl -fSL -o "$LIB_DIR/timingframework-1.0.jar" \
      "https://repo1.maven.org/maven2/net/java/dev/timingframework/timingframework/1.0/timingframework-1.0.jar"
  fi

  # JXLayer (org.jdesktop.jxlayer)
  if [ ! -f "$LIB_DIR/jxlayer-3.0.4.jar" ]; then
    echo "  Downloading jxlayer-3.0.4.jar..."
    curl -fSL -o "$LIB_DIR/jxlayer-3.0.4.jar" \
      "https://repo1.maven.org/maven2/org/swinglabs/jxlayer/3.0.4/jxlayer-3.0.4.jar"
  fi

  # Trove 2.x (gnu.trove with flat package structure)
  if [ ! -f "$LIB_DIR/trove4j-2.1.0.jar" ]; then
    echo "  Downloading trove4j-2.1.0.jar..."
    curl -fSL -o "$LIB_DIR/trove4j-2.1.0.jar" \
      "https://repo1.maven.org/maven2/net/sf/trove4j/trove4j/2.1.0/trove4j-2.1.0.jar"
  fi

  echo "=== Compiling 161 Java source files ==="
  rm -rf "$BUILD_DIR"
  mkdir -p "$BUILD_DIR"

  # Build classpath from all JARs
  JAVAC_CP=""
  for jar in "$LIB_DIR"/*.jar; do
    if [ -n "$JAVAC_CP" ]; then
      JAVAC_CP="$JAVAC_CP:$jar"
    else
      JAVAC_CP="$jar"
    fi
  done

  find "$SRC_DIR" -name "*.java" > /tmp/nabab-java-sources.txt

  javac -d "$BUILD_DIR" \
    -cp "$JAVAC_CP" \
    --add-exports jdk.compiler/com.sun.tools.javac.tree=ALL-UNNAMED \
    @/tmp/nabab-java-sources.txt

  # Copy resources (XMLBIF example files) to classpath
  if [ -d "$RES_DIR" ]; then
    cp -r "$RES_DIR"/* "$BUILD_DIR"/
  fi

  NCLASSES=$(find "$BUILD_DIR" -name "*.class" | wc -l | tr -d ' ')
  echo "=== Build successful: $NCLASSES class files ==="
}

run() {
  if [ ! -d "$BUILD_DIR" ]; then
    echo "Error: build/classes not found. Run with --build-only first, or without flags to build and run."
    exit 1
  fi

  echo "=== Launching $MAIN_CLASS ==="
  java "${JVM_FLAGS[@]}" -cp "$CP" "$MAIN_CLASS" "$@"
}

# Parse arguments
BUILD=true
RUN=true
EXTRA_ARGS=()

for arg in "$@"; do
  case "$arg" in
    --build-only) RUN=false ;;
    --run-only)   BUILD=false ;;
    *)            EXTRA_ARGS+=("$arg") ;;
  esac
done

if $BUILD; then
  build
fi

if $RUN; then
  run "${EXTRA_ARGS[@]}"
fi
