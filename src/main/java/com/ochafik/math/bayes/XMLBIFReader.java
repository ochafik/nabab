/*
 * Copyright (C) 2006-2011 by Olivier Chafik (http://ochafik.com)
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

package com.ochafik.math.bayes;

import java.awt.Component;
import java.awt.Container;
import java.awt.Point;
import java.io.IOException;
import java.net.URL;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.parsers.ParserConfigurationException;


import org.w3c.dom.Document;
import org.w3c.dom.Node;
import org.xml.sax.SAXException;

import com.ochafik.math.functions.DefaultVariable;
import com.ochafik.math.functions.FunctionException;
import com.ochafik.math.functions.TabulatedFunction;
import com.ochafik.math.functions.Variable;
import com.ochafik.xml.XMLUtils;

/**
 * Reads files in format XMLBIF (XML Bayesian Interchange Format), version 0.3
 * @see <a href="http://www.poli.usp.br/p/fabio.cozman/Research/InterchangeFormat/index.html"/>
 * 
 * To create arbitrary XMLBIF files, use BNGenerator
 * @see <a href="http://www.pmr.poli.usp.br/ltd/Software/BNGenerator/#examples"/>
 * 
 * @author ochafik
 */
public class XMLBIFReader {
	
	public static final Point absolutize(Point p, Component c, Container root) {
		if (c == root) {
			Point r = absolutize(p, c.getParent(), root);
			Point off = c.getLocation();
			return new Point(r.x + off.x, r.y + off.y);
		}
		return p;
	}
	public static List<BayesianNetwork> read(URL source) throws SAXException, IOException, ParserConfigurationException, FunctionException {
		List<BayesianNetwork> ret = new ArrayList<BayesianNetwork>(1);
		
		Document document = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(source.openStream());

		for (Node networkNode : XMLUtils.getByName(document, "network")) {
			Collection<Node> variableNodes = XMLUtils.getByName(networkNode, "variable");
			BayesianNetwork net = new DefaultBayesianNetwork(variableNodes.size());
			
			Node netNameNode = XMLUtils.getFirstNamedNode(networkNode, "name");
			if (netNameNode != null) {
				net.setAttribute(BayesianNetwork.ATTRIB_NAME, netNameNode.getTextContent());
			}
			
			Map<String, Variable> variablesByName = new HashMap<String, Variable>(variableNodes.size());
			
			for (Node variableNode : variableNodes) {
				Collection<Node> outcomeNodes = XMLUtils.getByName(variableNode, "outcome");
				List<Object> values = new ArrayList<Object>(outcomeNodes.size());
				for (Node outcomeNode : outcomeNodes) {
					values.add(outcomeNode.getTextContent().trim());
				}
				Node varNameNode = XMLUtils.getFirstNamedNode(variableNode, "name");
				if (varNameNode == null) 
					throw new IOException("Found variable with no name ! Aborting.");
				
				String varName = varNameNode.getTextContent().trim();
				Variable variable = DefaultVariable.createVariable(varName, values);
				variablesByName.put(varName, variable);
				for (Node attributeNode : XMLUtils.getByName(variableNode, "property")) {
					String txt = attributeNode.getTextContent();
					int iSpace = txt.indexOf("=");
					if (iSpace < 0) variable.setProperty(txt, "");
					else {
						String attrName = txt.substring(0, iSpace).trim();
						String attrVal = txt.substring(iSpace+1).trim();
						Object objVal = attrVal;
						if (attrName.equals(BayesianNetwork.ATTRIB_POSITION)) {
							Matcher matcher = POSITION_PATTERN.matcher(attrVal);
							if (matcher.find()) {
								objVal = new Point(Integer.parseInt(matcher.group(1)), Integer.parseInt(matcher.group(2)));
							}
						}
						variable.setProperty(attrName, objVal);
					}
				}
			}
			for (Node definitionNode : XMLUtils.getByName(networkNode, "definition")) {
				String varName = XMLUtils.getFirstNamedNode(definitionNode, "for").getTextContent().trim();
				Variable variable = variablesByName.get(varName);
				if (variable == null) throw new IOException("Definition refers to unknown variable '"+varName+"'");
				List<Variable> parameters = new ArrayList<Variable>();
				for (Node givenNode : XMLUtils.getByName(definitionNode, "given")) {
					Variable given = variablesByName.get(givenNode.getTextContent());
					if (given == null) throw new IOException("Definition refers to unknown given '"+givenNode.getTextContent()+"'");
					parameters.add(given);
				}
				String tableString = XMLUtils.getFirstNamedNode(definitionNode, "table").getTextContent().trim();
				String[] tabVals = tableString.split("\\s+");
				
				List<Variable> arguments = new ArrayList<Variable>(parameters.size() + 1);
				arguments.addAll(parameters);
				arguments.add(variable);
				
				double[] allValues = new double[tabVals.length];
				for (int iVal = tabVals.length; iVal-- != 0;) {
					allValues[iVal] = Double.parseDouble(tabVals[iVal]);
				}
				TabulatedFunction<Variable> conditionalProbabilities = new TabulatedFunction<Variable>(arguments, allValues);
				conditionalProbabilities.setName(varName);
				net.getDefinitions().put(variable, conditionalProbabilities);
			}
			ret.add(net);
		}
		return ret;
	}
	private final static Pattern POSITION_PATTERN = Pattern.compile("\\(\\s*([0-9]+)\\s*,\\s*([0-9]+)\\s*\\)"); 
}
