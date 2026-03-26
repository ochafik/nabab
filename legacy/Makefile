# NABAB - Bayesian Network Engine (Java)
# Makefile for building and running the Java version
#
# Usage:
#   make          - download deps, compile, and run
#   make build    - download deps and compile only
#   make run      - run (must build first)
#   make clean    - remove compiled classes
#   make deps     - download dependencies only

SHELL := /bin/bash

PROJECT_DIR := $(shell pwd)
SRC_DIR     := $(PROJECT_DIR)/src/main/java
RES_DIR     := $(PROJECT_DIR)/src/main/resources
BUILD_DIR   := $(PROJECT_DIR)/build/classes
LIB_DIR     := $(PROJECT_DIR)/lib

MAIN_CLASS  := com.ochafik.math.bayes.display.Baya

# All JARs in lib/
JARS := $(wildcard $(LIB_DIR)/*.jar)
CP   := $(BUILD_DIR):$(subst $(eval ) ,:,$(JARS))

# JVM flags for JDK 17+ module access
JVM_FLAGS := \
  --add-exports jdk.compiler/com.sun.tools.javac.tree=ALL-UNNAMED \
  --add-opens java.desktop/javax.swing=ALL-UNNAMED \
  --add-opens java.desktop/javax.swing.plaf.basic=ALL-UNNAMED \
  --add-opens java.desktop/java.awt=ALL-UNNAMED

JAVA_SOURCES := $(shell find $(SRC_DIR) -name "*.java")

# Dependency JARs to download
SWINGX_JAR       := $(LIB_DIR)/swingx-all-1.6.4.jar
TIMING_JAR       := $(LIB_DIR)/timingframework-1.0.jar
JXLAYER_JAR      := $(LIB_DIR)/jxlayer-3.0.4.jar
TROVE_JAR        := $(LIB_DIR)/trove4j-2.1.0.jar
DEP_JARS         := $(SWINGX_JAR) $(TIMING_JAR) $(JXLAYER_JAR) $(TROVE_JAR)

MAVEN_CENTRAL := https://repo1.maven.org/maven2

.PHONY: all build run clean deps

all: build run

# Download dependencies
$(SWINGX_JAR):
	@echo "Downloading SwingX..."
	@curl -fSL -o $@ "$(MAVEN_CENTRAL)/org/swinglabs/swingx/swingx-all/1.6.4/swingx-all-1.6.4.jar"

$(TIMING_JAR):
	@echo "Downloading TimingFramework..."
	@curl -fSL -o $@ "$(MAVEN_CENTRAL)/net/java/dev/timingframework/timingframework/1.0/timingframework-1.0.jar"

$(JXLAYER_JAR):
	@echo "Downloading JXLayer..."
	@curl -fSL -o $@ "$(MAVEN_CENTRAL)/org/swinglabs/jxlayer/3.0.4/jxlayer-3.0.4.jar"

$(TROVE_JAR):
	@echo "Downloading Trove4J 2.1.0..."
	@curl -fSL -o $@ "$(MAVEN_CENTRAL)/net/sf/trove4j/trove4j/2.1.0/trove4j-2.1.0.jar"

deps: $(DEP_JARS)

# Build: compile all sources and copy resources
build: deps $(BUILD_DIR)/.build-stamp

$(BUILD_DIR)/.build-stamp: $(JAVA_SOURCES) $(DEP_JARS) $(LIB_DIR)/AnimatedTransitions.jar
	@echo "Compiling $(words $(JAVA_SOURCES)) Java source files..."
	@rm -rf $(BUILD_DIR)
	@mkdir -p $(BUILD_DIR)
	@find $(SRC_DIR) -name "*.java" > /tmp/nabab-java-sources.txt
	@javac -d $(BUILD_DIR) \
		-cp "$(subst $(eval ) ,:,$(wildcard $(LIB_DIR)/*.jar))" \
		--add-exports jdk.compiler/com.sun.tools.javac.tree=ALL-UNNAMED \
		@/tmp/nabab-java-sources.txt
	@cp -r $(RES_DIR)/* $(BUILD_DIR)/
	@touch $@
	@echo "Build successful: $$(find $(BUILD_DIR) -name '*.class' | wc -l | tr -d ' ') class files"

# Run the application
run:
	@java $(JVM_FLAGS) -cp "$(CP)" $(MAIN_CLASS)

clean:
	rm -rf $(BUILD_DIR)
