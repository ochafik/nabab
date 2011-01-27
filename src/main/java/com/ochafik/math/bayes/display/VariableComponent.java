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

/**
 * 
 */
package com.ochafik.math.bayes.display;

import java.awt.BorderLayout;
import java.awt.Component;
import java.awt.Cursor;
import java.awt.Dimension;
import java.awt.Point;
import java.awt.event.ComponentAdapter;
import java.awt.event.ComponentEvent;
import java.awt.event.ContainerAdapter;
import java.awt.event.ContainerEvent;
import java.awt.event.MouseAdapter;
import java.awt.event.MouseEvent;
import java.awt.event.MouseListener;
import java.beans.PropertyChangeEvent;
import java.beans.PropertyChangeListener;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.util.Map;
import java.util.TreeMap;

import javax.swing.BorderFactory;
import javax.swing.JLabel;
import javax.swing.JPanel;
import javax.swing.JProgressBar;
import javax.swing.SwingUtilities;

import com.ochafik.awt.TableLayout;
import com.ochafik.math.bayes.BayesianNetwork;
import com.ochafik.math.bayes.BayesianNetworkUtils;
import com.ochafik.math.functions.Function;
import com.ochafik.math.functions.FunctionException;
import com.ochafik.math.functions.Variable;
import com.ochafik.swing.candy.HeadedPanel;
import com.ochafik.swing.event.AggregatingRecursiveMouseListener;

@SuppressWarnings("serial")
public class VariableComponent extends HeadedPanel {
	/**
	 * 
	 */
	private final BayesianNetworkDisplay display;
	public final Variable variable;
	final JLabel headLabel = new JLabel("", JLabel.CENTER);
	final JPanel valuesPanel;
	final JLabel[] valueNameLabels, percentageLabels;
	final JProgressBar[] valueBars;
	
	final JPanel contentPanel = new JPanel(new BorderLayout());
	final JLabel valuesNotAvailable = new JLabel("<in progress>", JLabel.CENTER), errorLabel = new JLabel("<error>", JLabel.CENTER);
	
	static interface VariableValueBound {
		int getValueIndex();
		Variable getVariable();
	};
	
	static class VariableValueBoundJLabel extends JLabel implements VariableValueBound {
		int valueIndex;
		Variable variable;
		
		public VariableValueBoundJLabel(String text, int alignment, Variable variable, int valueIndex) {
			super(text, alignment);
			this.valueIndex = valueIndex;
			this.variable = variable;
		}
		public int getValueIndex() {
			return valueIndex;
		}
		public Variable getVariable() {
			return variable;
		}
		
	};
	
	static class VariableValueBoundJProgressBar extends JProgressBar implements VariableValueBound {
		int valueIndex;
		Variable variable;
		
		public VariableValueBoundJProgressBar(int min, int max, Variable variable, int valueIndex) {
			super(min, max);
			this.valueIndex = valueIndex;
			this.variable = variable;
		}
		public int getValueIndex() {
			return valueIndex;
		}
		public Variable getVariable() {
			return variable;
		}
		
	};
	
	/*
	@Override
	public Point getLocation() {
		updatePosition();
		return hardPosition;
	}*/
	
	Point hardPosition;
	public void updatePosition() {
		Point p = (Point)variable.getProperty(BayesianNetwork.ATTRIB_POSITION);
		if (p == null)
			p = new Point(0, 0);
		
		int x = p.x, y = p.y;
		x -= getWidth() / 2;
		y -= getHeight() / 2;
		Dimension pref = getPreferredSize();
		setBounds(x, y, pref.width, pref.height);
		//setLocation(hardPosition = new Point(x, y));
	}
	
	public VariableComponent(BayesianNetworkDisplay display, Variable variable) {
		super();
		setOpaque(false);
		
		this.display = display;
		if (display == null) 
			throw new NullPointerException("Null display !");
		if (variable == null) 
			throw new NullPointerException("Null variable !");
		this.variable = variable;
		
		addComponentListener(new ComponentAdapter() {
			@Override
			public void componentShown(ComponentEvent e) {
				updatePosition();
			}
			@Override
			public void componentResized(ComponentEvent e) {
				//updatePosition();
			}
		});
		variable.addAttributeChangeListener(BayesianNetwork.ATTRIB_POSITION, new PropertyChangeListener() {
			@Override
			public void propertyChange(PropertyChangeEvent evt) {
				updatePosition();
			}
		});
		
		updatePosition();
		
		headLabel.setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
		valuesNotAvailable.setCursor(Cursor.getPredefinedCursor(Cursor.WAIT_CURSOR));
		valuesNotAvailable.setOpaque(false);
		
		int nValues = variable.getValues().size();
		
		valuesPanel = new JPanel(new TableLayout(this.display.isShowPercents() ? 3 : 2, nValues));
		valuesPanel.setOpaque(false);
		
		valueBars = new JProgressBar[nValues];
		valueNameLabels = new JLabel[nValues];
		percentageLabels = new JLabel[nValues];
		
		setHead(headLabel);
		
		headLabel.setOpaque(false);
		contentPanel.setOpaque(false);
		setContent(contentPanel);
		
		initGUIListeners();
		
		for (int iValue = 0; iValue < nValues; iValue++) {
			valueBars[iValue] = new VariableValueBoundJProgressBar(0, 1000, variable, iValue);
			valueNameLabels[iValue] = new VariableValueBoundJLabel("", JLabel.RIGHT, variable, iValue);
			percentageLabels[iValue] = new VariableValueBoundJLabel("", JLabel.RIGHT, variable, iValue);
			
			valueBars[iValue].setOpaque(false);
			valueNameLabels[iValue].setOpaque(false);
			percentageLabels[iValue].setOpaque(false);
			
			valueNameLabels[iValue].setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
			valueNameLabels[iValue].setBorder(BorderFactory.createEmptyBorder(0,0,0,2));
			valuesPanel.add(valueNameLabels[iValue], "E");
			
			valueBars[iValue].setUI(BayesianNetworkDisplay.getValueBarUI());
			valueBars[iValue].setBorder(BorderFactory.createEmptyBorder(2, 3, 2, 2));
			valuesPanel.add(valueBars[iValue], "W");
			
			if (this.display.isShowPercents()) {
				percentageLabels[iValue].setBorder(BorderFactory.createEmptyBorder(0,2,0,2));
				valuesPanel.add(percentageLabels[iValue], "W");
			}
		}
		updateVariableDisplay();
	}

	public Variable getVariable() {
		return variable;
	}
	static VariableComponent getVariableComponent(MouseEvent e) {
		return getVariableComponent(e.getComponent());
	}
	static VariableComponent getVariableComponent(Component c) {
		VariableComponent vc = (VariableComponent)(c instanceof VariableComponent ? c : SwingUtilities.getAncestorOfClass(VariableComponent.class, c));
		//if (vc == null)
		//	throw new NullPointerException("Unable to trace variable component from event !");
		return vc;
	}
	static MouseListener 
		headClickMouseAdapter = new MouseAdapter() {
			@Override
			public void mouseClicked(MouseEvent e) {
				VariableComponent vc = getVariableComponent(e);
				if (vc != null) {
					Variable v = vc.variable;
				
					//if (!(e.isControlDown()|| e.isMetaDown()))
					//	vc.display.selectedVariables.clear();
					
					if (!vc.display.getSelectedVariables().add(v))
						vc.display.getSelectedVariables().remove(v);
		
					if (!vc.display.getStickyDisplayVariables().add(v))
						vc.display.getStickyDisplayVariables().remove(v);
				}
			}
		};
	
	static AggregatingRecursiveMouseListener variableValuesMouseAggregator = new AggregatingRecursiveMouseListener(VariableValueBound.class);
	static AggregatingRecursiveMouseListener mouseOverAggregator = new AggregatingRecursiveMouseListener(VariableComponent.class);
	static {
		
		MouseAdapter rootAdapter = new MouseAdapter() {
			@Override
			public void mouseEntered(MouseEvent e) {
				VariableComponent vc = getVariableComponent(e);
				if (vc != null) {
					if (!vc.display.getMouseFocusedVariables().contains(vc.variable))
						vc.display.getMouseFocusedVariables().add(vc.variable);
				}
					
			}
			@Override
			public void mouseExited(MouseEvent e) {
				VariableComponent vc = getVariableComponent(e);
				if (vc != null)
					vc.display.getMouseFocusedVariables().remove(vc.variable);
			}
			Point startMousePoint, startPosition;
			@Override
			public void mousePressed(MouseEvent e) {
				VariableComponent vc = getVariableComponent(e);
				if (vc == null)
					return;
				
				startMousePoint = SwingUtilities.convertPoint(e.getComponent(), e.getPoint(), e.getComponent().getParent());
				startPosition = (Point)vc.variable.getProperty(BayesianNetwork.ATTRIB_POSITION);
			}
			@Override
			public void mouseDragged(MouseEvent e) {
				VariableComponent vc = getVariableComponent(e);
				if (vc == null || startMousePoint == null || startPosition == null) {
					assert false;
					return;
				}
				Point p = SwingUtilities.convertPoint(e.getComponent(), e.getPoint(), e.getComponent().getParent());
				p.translate(startPosition.x - startMousePoint.x, startPosition.y - startMousePoint.y);
				vc.variable.setProperty(BayesianNetwork.ATTRIB_POSITION, p);
			}
			@Override
			public void mouseReleased(MouseEvent e) {
				startMousePoint = null;
				startPosition = null;
			}
		};
		mouseOverAggregator.getMouseListeners().add(rootAdapter);
		mouseOverAggregator.getMouseMotionListeners().add(rootAdapter);
		variableValuesMouseAggregator.getMouseListeners().add(new MouseAdapter() {
			@Override
			public void mouseClicked(MouseEvent e) {
				final VariableComponent variableComponent = getVariableComponent(e.getComponent());
				final BayesianNetwork net = variableComponent.display.getHub().getBayesianNet();
				
				VariableValueBound swingComponent = (VariableValueBound)e.getComponent();
				Variable v = swingComponent.getVariable();
				
				//if (e.isShiftDown() || e.getClickCount() > 1) {
				//	net.getObservations().remove(v);
				//} else {
					int valueIndex = swingComponent.getValueIndex();
					
					Map<Integer, Float> observation = net.getObservations().get(v);
					Float presentVal = observation == null ? null : observation.get(valueIndex);
					if (presentVal != null && presentVal == 1) {
						net.getObservations().remove(v);
					} else {
						observation = new TreeMap<Integer, Float>();
						for (int iValue = v.getValues().size(); iValue-- != 0;) {
							observation.put(iValue, (float)(iValue == valueIndex ? 1 : 0));
						}
						net.getObservations().put(v, observation);
					}
				//}
				//variableComponent.display.setLocked(true);
				//new Thread() { public void run() {
					try {
						net.infer();
					} catch (FunctionException e1) {
						// TODO Auto-generated catch block
						e1.printStackTrace();
					} finally {
				//		variableComponent.display.setLocked(false);
					}
				//}}.start();
			}
		});
	}
	private void initGUIListeners() {
		AggregatingRecursiveMouseListener headMouseAggregator = new AggregatingRecursiveMouseListener(getHead());
		headMouseAggregator.getMouseListeners().add(headClickMouseAdapter);
		
		getRecursiveListenersManager().addMouseListener(headMouseAggregator);
		getRecursiveListenersManager().addMouseListener(mouseOverAggregator);
		getRecursiveListenersManager().addMouseMotionListener(mouseOverAggregator);
		getRecursiveListenersManager().addMouseListener(variableValuesMouseAggregator);
	}
	public void updateVariableDisplay() {
		updateColors();
		boolean sticky = display.isSticky(variable);
		boolean smallSize = !display.isMouseFocused(variable) && !sticky;
		
		headLabel.setText("<html><body>"+(smallSize ? "<font size='-2'>" : "")+(sticky ? "<b>" : "")+variable.getName()+(sticky ? "</b>" : "")+(smallSize ? "</font>" : ""));
		
		BayesianNetwork network = display.getHub().getBayesianNet();
		Function<Variable> f = network.getInferences().get(variable);
		//Map<Integer, Float> o = display.getHub().getBayesianNet().getObservations().get(variable);
		headLabel.setToolTipText(f == null ? null : "<html><body>"+f.toString().replace("/", "/<br>").replace("[", "").replace("]", "")+"</body></html>");
		
		contentPanel.removeAll();

		//System.out.println("Eval for " + variable + " = "+f);
		if (f != null) {
			try { 
				double[] probabilities = BayesianNetworkUtils.getProbabilities(variable, f, BayesianNetworkUtils.getKnownValues(network));
				Map<Integer, Float> observations = network.getObservations().get(variable);
				
				StringBuffer buf = new StringBuffer("<html><body><font size = '-2'><i>");
				for (int iValue = variable.getValues().size(); iValue-- != 0;) {
					double value = probabilities[iValue];
					String tooltip = variable.getValues().get(iValue)+" : "+(((int)(value * 10000000))/100000d) + " %";
					//String tooltip = variable.getValue(iValue)+" : "+(value * 100)+ " %";
					
					boolean observedValue = observations != null && observations.get(iValue) != null;
					String stylePrefix = "<html><body><font size='-2'>" + (observedValue ? "<i><b>" : ""), 
							styleSuffix = (observedValue ? "</b></i>" : "") + "</font></body></html>";
					
					if (observedValue) {
						tooltip = "Observed : "+tooltip;
					}
					Runtime r = Runtime.getRuntime();
					//System.out.println("maxMemory = "+r.maxMemory()+", totalMemory = " + r.totalMemory() + ", freeMemory = " + r.freeMemory()); 
					
					valueNameLabels[iValue].setText(stylePrefix + variable.getValues().get(iValue) + styleSuffix);
					if (display.isShowPercents()) {
						double vv = value * 100;
						String valueTxt;
						if (vv < 0.1 && vv != 0) {
							valueTxt = "< 0.1 %";
						} else if (vv > 99.9 && vv != 100.0) {
							valueTxt = "> 99.9 %";
						} else {
							valueTxt = "" + (int)(Math.round(vv * 10) / 10);
							//valueTxt = "" + (int)Math.round(vv);
						}
						percentageLabels[iValue].setText(stylePrefix + valueTxt + styleSuffix);
						percentageLabels[iValue].setToolTipText(tooltip);
					}

					valueNameLabels[iValue].setToolTipText(tooltip);
					
					valueBars[iValue].setToolTipText(tooltip);
					valueBars[iValue].setValue((int)Math.round(value * 1000));
					
					if (iValue != 0) {
						buf.append("<br>");
					}
					buf.append(tooltip);
				}
				contentPanel.add("Center", valuesPanel);
			} catch (FunctionException ex) {
				contentPanel.add("Center", errorLabel);
				StringWriter sw = new StringWriter();
				ex.printStackTrace(new PrintWriter(sw));
				errorLabel.setToolTipText(sw.toString());
				System.err.println("Exception during evaluation of variable " + variable.getName());
				ex.printStackTrace();
			}
		} else {
			contentPanel.add("Center", valuesNotAvailable);
		}
		setShowContent(!smallSize);
		revalidate();
	}
	public void updateColors() {
		VariableColorScheme cs = display.getColorSchemes().get(variable);
		if (cs == null)
			return;
		for (int iValue = variable.getValues().size(); iValue-- != 0;) {
			valueBars[iValue].setForeground(cs.getMainColor());
		}
		
		setColors(cs.getMainColor(), cs.getSecondaryColor());
	}
}