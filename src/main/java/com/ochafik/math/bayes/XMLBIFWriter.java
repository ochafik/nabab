/*
 * Copyright (C) 2011 by Olivier Chafik (http://ochafik.com)
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

import java.awt.Point;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

import com.ochafik.math.functions.FastFatValuation;
import com.ochafik.math.functions.Function;
import com.ochafik.math.functions.FunctionException;
import com.ochafik.math.functions.Valuation;
import com.ochafik.math.functions.Variable;
import com.ochafik.math.functions.VariableValuesEnumerator;
import com.ochafik.util.string.StringUtils;

public class XMLBIFWriter {
	private PrintWriter out;
	public XMLBIFWriter(PrintWriter out) {
		this.out = out;
		out.println("<?xml version=\"1.0\" encoding=\"utf-8\"?>");
		out.println("<!-- \n\tBayesian network in XMLBIF v0.3 (BayesNet Interchange Format)\n\tProduced by Baya (copyright Olivier Chafik)\n-->");
		out.println("<BIF VERSION=\"0.3\">");
	}
	
	public static String writeXML(BayesianNetwork... networks) throws FunctionException {
		StringWriter out = new StringWriter(); 
		XMLBIFWriter w = new XMLBIFWriter(new PrintWriter(out));
		for (BayesianNetwork net : networks)
			w.write(net);
		w.close();
		return out.toString();
	}
	public void close() {
		out.println("</BIF>");
		out.close();
	}
	void element(String name, Object o) {
		out.println("\t<" + name + ">" + o + "</" + name + ">");
	}
	public void write(BayesianNetwork net) throws FunctionException {
		out.println("<NETWORK>");
		element("NAME", net.getAttribute(BayesianNetwork.ATTRIB_NAME));
		out.println();
		
		out.println("<!-- Variables -->");
		int nVariables = net.getVariables().size();
		for (Variable variable : net.getVariables()) {
			out.println("<VARIABLE TYPE=\"nature\">");
			element("NAME", variable.getName());
			for (Object outcome : variable.getValues()) {
				element("OUTCOME", outcome);
			}
			for (String k : variable.getPropertyNames())
				element("PROPERTY", k + " = " + serializeAttributeValue(variable.getProperty(k)));
			
			out.println("</VARIABLE>");
			out.println();
		}
		
		for (Map.Entry<Variable, Function<Variable>> e : net.getDefinitions().entrySet()) {
			Variable variable = e.getKey();
			Function<Variable> d = e.getValue();
			out.println("<DEFINITION>");
			element("FOR", variable.getName());
			for (Variable p : d.getArgumentNames()) {
				if (p.equals(variable))
					continue;
				
				element("GIVEN", p);
			}
			
			Valuation<Variable> valuation = new FastFatValuation<Variable>(nVariables);
			List<Variable> vars = new ArrayList<Variable>(d.getArgumentNames());
			vars.remove(variable);
			List<Double> vs = new ArrayList<Double>();
			if (vars.isEmpty()) {
				int nValues = variable.getValues().size();
				for (int iValue = 0; iValue < nValues; iValue++) {
					valuation.put(variable, iValue);
					vs.add(d.eval(valuation));
				}
			} else {
				Collections.reverse(vars);
				VariableValuesEnumerator<Variable> en = new VariableValuesEnumerator<Variable>(valuation, vars);
				int nValues = variable.getValues().size();
				do {
					for (int iValue = 0; iValue < nValues; iValue++) {
						valuation.put(variable, iValue);
						vs.add(d.eval(valuation));
					}
				} while (en.next());
			}
			element("TABLE", StringUtils.implode(vs, " "));
			out.println("</DEFINITION>");
			out.println();
		}
		out.println("</NETWORK>");
	}
	private String serializeAttributeValue(Object value) {
		if (value == null)
			return null;
		Class<?> c = value.getClass();
		if (c == Point.class) {
			Point p = (Point)value;
			return "(" + p.x + ", " + p.y + ")";
		}
			
		return value.toString();
	}
}
