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

package com.ochafik.math.bayes.display;

import java.awt.Color;
import java.awt.Component;
import java.awt.GridBagConstraints;
import java.awt.GridBagLayout;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

import javax.swing.BorderFactory;
import javax.swing.JLabel;
import javax.swing.JPanel;
import javax.swing.JTextField;
import javax.swing.border.Border;

import com.ochafik.math.functions.FastFatValuation;
import com.ochafik.math.functions.Function;
import com.ochafik.math.functions.Functions;
import com.ochafik.math.functions.Valuation;
import com.ochafik.math.functions.Variable;


@SuppressWarnings("serial")
public class AdvancedVariableTableEditor<N extends Variable> extends JPanel {
	Function<N> table;
	N variable;
	Map<N,Set<Integer>> collapsedValues = new HashMap<N, Set<Integer>>();
	Map<N, VariableColorScheme> colorSchemes = new HashMap<N, VariableColorScheme>();
	
	GridBagConstraints gridBagConstraints = new GridBagConstraints();
	GridBagLayout gridBagLayout;
	GridBagConstraints constraints(int x, int y, int w, int h, int fill, int anchor) {
		gridBagConstraints.gridx = x;
		gridBagConstraints.gridy = y;
		gridBagConstraints.gridheight = h;
		gridBagConstraints.gridwidth = w;
		gridBagConstraints.fill = fill;
		gridBagConstraints.anchor = anchor;
		return gridBagConstraints;
	}
	public AdvancedVariableTableEditor() {
		super();
		setLayout(gridBagLayout = new GridBagLayout());
	}
	public void setColorSchemes(Map<N, VariableColorScheme> colorSchemes) {
		this.colorSchemes = colorSchemes;
	}
	
	@Override
	public void add(Component c, Object constr) {
		gridBagLayout.setConstraints(c, (GridBagConstraints)constr);
		super.add(c,constr);
	}
	
	public boolean isCollapsed(N v, int value) {
		Set<Integer> s = collapsedValues.get(v);
		return s != null && s.contains(value);
	}
	public void setCollapsed(N v, int value, boolean c) {
		Set<Integer> s = collapsedValues.get(v);
		if (s == null) {
			if (!c) return;
			s = new TreeSet<Integer>();
			collapsedValues.put(v, s);
		}
		if (c) {
			if (s.add(value)) {
				revalidate();
			}
		} else {
			if (s.remove(value)) {
				revalidate();
			}
		}
		
	}
	static final int d = 3;
	static Border border = BorderFactory.createCompoundBorder(BorderFactory.createEtchedBorder(), BorderFactory.createEmptyBorder(d,d,d,d));
	
	public void setVariableTable(N variable, Function<N> table) {
		removeAll();
		this.variable = variable;
		this.table = table;
		
		if (variable == null || table == null)
			return;
		
		List<N> parameters = new ArrayList<N>(table.getArgumentNames());
		parameters.remove(variable);
		
		int iRow = 0;
		int varValuesHeadersXOffset;
		int valsCount = variable.getValues().size();
		int valuesYOffset;
		int valuesXOffset;
		
		int nColumns;
		
		class Lab extends JLabel {
			
			public Lab(String text, Color color) {
				this(text, LEFT, color);
			}
			public Lab(String text, int ori, Color color) {
				super(text, ori);

				if (color != null) 
					setBackground(color);
				setBorder(border);
				setOpaque(true);
			}
		};
		
		for (N p : parameters) {
			VariableColorScheme scheme = colorSchemes.get(p);
			add(new Lab(p.getName(), JLabel.RIGHT, scheme == null ? null : scheme.getMainColor()), constraints(0, iRow++, 2, 1, GridBagConstraints.BOTH, GridBagConstraints.CENTER));
		}
		valuesYOffset = iRow;

		int nParams = parameters.size();
		int[] weight = new int[nParams];
		int nextWeight = 1;
		for (int iParam = nParams; iParam-- != 0;) {
			N p = parameters.get(iParam);
			weight[iParam] = nextWeight;
			nextWeight *= p.getValues().size();
		}
		nColumns = nextWeight;
		
		int paramHeadersYOffset = 2;
		int nRepets = 1;
		
		for (int iParamRow = 0; iParamRow < nParams; iParamRow++) {
			N p = parameters.get(iParamRow);
			int nVals = p.getValues().size();
			VariableColorScheme scheme = colorSchemes.get(p);
			
			int yOffset = paramHeadersYOffset; 
			for (int iRepet = 0; iRepet < nRepets; iRepet++) {
				for (int iVal = 0; iVal < nVals; iVal++) {
					//Lab lab = new Lab(p.getValues().get(iVal).toString(), JLabel.CENTER, scheme == null ? null : scheme.getSecondaryColor());
					Lab lab = new Lab("<html><body><i>"+p.getValues().get(iVal)+"</i>", JLabel.CENTER, scheme == null ? null : scheme.getSecondaryColor());
					lab.setToolTipText(p.getName()+" = "+p.getValues().get(iVal));
					add(lab, constraints(yOffset, iParamRow, weight[iParamRow], 1, GridBagConstraints.BOTH, GridBagConstraints.CENTER));
					yOffset += weight[iParamRow];
				}
			}
			
			nRepets *= nVals;
		}
		
		// put variable name on the left of its values
		VariableColorScheme scheme = colorSchemes.get(variable);
		add(new Lab("<html><body><b>"+variable.getName()+"</b>", scheme == null ? null : scheme.getMainColor()), constraints(0, iRow, 1, valsCount, GridBagConstraints.BOTH, GridBagConstraints.CENTER));
		varValuesHeadersXOffset = 1;
		
		// Variable values header
		for (int iVal = 0; iVal < valsCount; iVal++) {
			add(new Lab("<html><body><i>"+variable.getValues().get(iVal)+"</i>", JLabel.CENTER, scheme == null ? null : scheme.getSecondaryColor()), constraints(varValuesHeadersXOffset, valuesYOffset + iVal, 1, 1, GridBagConstraints.BOTH, GridBagConstraints.CENTER));
		}
		valuesXOffset = varValuesHeadersXOffset + 1;
		
		int[] deltas = new int[parameters.size()];
		int currentDelta = 1;
		for (int iParam = deltas.length; iParam-- != 0;) {
			deltas[iParam] = currentDelta;
			currentDelta *= parameters.get(iParam).getValues().size();
		}
		//int nParams = parameters.size();
		//Valuation<N> values = new DefaultValuation<N>(parameters.size() + 100);
		Valuation<N> values = new FastFatValuation<N>(parameters.size() + 100);
		//Map<N, Integer> values = new TreeMap<N, Integer>();
		for (int iColumn = nColumns; iColumn-- != 0;) {
			int offset = iColumn;
			
			for (int iParam = 0; iParam < nParams; iParam ++) {
				N parameter = parameters.get(iParam);
				int delta = deltas[iParam];
				int iVal = offset / delta;
				offset -= iVal * delta;
				values.put(parameter, iVal);
			}
			for (int iVal = valsCount; iVal-- != 0;) {
				values.put(variable, iVal);
				double value = -1;
				try {
					value = table.eval(values);
				} catch (Exception e) {
					System.err.println("Error while filling table for "+variable+" with "+values);
					e.printStackTrace();
				}
				
				JTextField tf = new JTextField(value+"", 3);
				//tf.setBorder(BorderFactory.createCompoundBorder(BorderFactory.createEtchedBorder(), tf.getBorder()));
				///int size = 2;
				//tf.setBorder(BorderFactory.createCompoundBorder(BorderFactory.createEmptyBorder(size,size,size,size), tf.getBorder()));
				tf.setBorder(BorderFactory.createEtchedBorder());
				add(tf, constraints(valuesXOffset + iColumn, valuesYOffset + iVal, 1, 1, GridBagConstraints.BOTH, GridBagConstraints.CENTER));
			}
		}
		//revalidate();
		//getParent().repaint();
	}
}
