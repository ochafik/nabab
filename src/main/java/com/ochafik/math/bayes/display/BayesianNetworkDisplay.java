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

package com.ochafik.math.bayes.display;

import java.awt.Color;
import java.awt.Component;
import java.awt.Container;
import java.awt.Dimension;
import java.awt.GradientPaint;
import java.awt.Graphics2D;
import java.awt.Paint;
import java.awt.Point;
import java.awt.Rectangle;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

import javax.swing.JComponent;
import javax.swing.JLayeredPane;
import javax.swing.plaf.ProgressBarUI;

import org.jdesktop.swingx.JXPanel;
import org.jdesktop.swingx.painter.CompoundPainter;
import org.jdesktop.swingx.painter.GlossPainter;
import org.jdesktop.swingx.painter.MattePainter;
import org.jdesktop.swingx.painter.Painter;
import org.jdesktop.swingx.painter.PinstripePainter;

import com.ochafik.lang.Destroyable;
import com.ochafik.math.bayes.BayesianNetworkHub;
import com.ochafik.math.functions.Variable;
import com.ochafik.math.graph.Graph;
import com.ochafik.swing.ui.SimplisticProgressBarUI;
import com.ochafik.util.listenable.CollectionEvent;
import com.ochafik.util.listenable.CollectionListener;
import com.ochafik.util.listenable.DefaultListenableMap;
import com.ochafik.util.listenable.ListenableCollections;
import com.ochafik.util.listenable.ListenableMap;
import com.ochafik.util.listenable.ListenableSet;

/*
include com/ochafik/math/bayes/*.xml
*/

public class BayesianNetworkDisplay implements Destroyable {
	final BayesianNetworkHub hub;
	final JLayeredPane vectorDisplay;
	static final int VARIABLES_DEPTH = 2, LINKS_DEPTH = 1, BACKGROUND_DEPTH = 0;
	
	private static ProgressBarUI valueBarUI = new SimplisticProgressBarUI(new Dimension(20,5));
	private boolean showPercents = true;
	
	Map<Variable, Set<LinkComponent>> linkComponents = new TreeMap<Variable, Set<LinkComponent>>();
	private Map<Variable, VariableComponent> variableComponents = new TreeMap<Variable, VariableComponent>();
	private ListenableMap<Variable, VariableColorScheme> colorSchemes = new DefaultListenableMap<Variable, VariableColorScheme>(new TreeMap<Variable, VariableColorScheme>());
	
	private ListenableSet<Variable> 
		stickyDisplayVariables = ListenableCollections.listenableSet(new HashSet<Variable>()), 
		selectedVariables = ListenableCollections.listenableSet(new HashSet<Variable>()), 
		mouseFocusedVariables = ListenableCollections.listenableSet(new HashSet<Variable>());
	
	static Color alpha(Color c, float a) {
		return new Color(c.getRed() / 255f, c.getGreen() / 255f, c.getBlue() / 255f, a);
	}
	public BayesianNetworkDisplay(BayesianNetworkHub hub) {//, LockableUI lockableUI) {
		this.hub = hub;
		
		final JXPanel backPaint = new JXPanel();
		
//		MattePainter mp = new MattePainter(alpha(Color.blue.brighter(), 0.5f));
//		GlossPainter gp = new GlossPainter(alpha(Color.white, 0.3f), GlossPainter.GlossPosition.TOP);
//		PinstripePainter pp = new PinstripePainter(alpha(Color.gray, 0.2f), 45d);
		Painter<JComponent> grap = new Painter<JComponent>() {
			@Override
			public void paint(Graphics2D g2d, JComponent component, int width, int height) {
				Paint paint = new GradientPaint(1,0, component.getBackground().brighter(), 1, height-1, component.getBackground().darker());
				g2d.setPaint(paint );
				g2d.fillRect(0, 0, width, height);
			}
			
		};
		backPaint.setBackgroundPainter(grap);
		//backPaint.setBackgroundPainter(new CompoundPainter(grap, mp, pp, gp));
		
		vectorDisplay = new JLayeredPane();
		vectorDisplay.setLayout(new LaxistLayout() {
			@Override
			public boolean useToComputeSize(Component component) {
				return (component instanceof VariableComponent);
			}
			@Override
			public Rectangle computeBounds(Container parent, Component component) {
				if (component == backPaint) {
					Dimension s = parent.getSize();
					return new Rectangle(0, 0, s.width, s.height);
				}
				return null;
			}
		});
		vectorDisplay.add(backPaint, new Integer(0));
		
		
		initNetListeners();
		initControlListeners();
	}
	void initNetListeners() {
		
		hub.addListener(BayesianNetworkHub.ListenerType.DEFINED_VARIABLES_LISTENER, new CollectionListener<Variable>() {
			public void collectionChanged(CollectionEvent<Variable> e) {
				switch (e.getType()) {
				case ADDED:
					for (Variable variable : e.getElements())
						addComponents(variable);
					break;
				case REMOVED:
					for (Variable variable : e.getElements())
						removeComponents(variable);
					break;
				case UPDATED:
					for (Variable variable : e.getElements()) {
						removeComponents(variable);
						addComponents(variable);
					}
					break;
				}
				
				switch (e.getType()) {
				case ADDED:
				case REMOVED:
					reassignColorSchemes();
				}
			}
			
		});
		
		hub.addListener(BayesianNetworkHub.ListenerType.UNIVERSAL_LISTENER, new CollectionListener<Variable>() {
			@Override
			public void collectionChanged(CollectionEvent<Variable> e) {
				for (Variable v : e.getElements()) {
					VariableComponent c = variableComponents.get(v);
					if (c == null)
						continue;
					
					c.updateVariableDisplay();
				}
			}
		});
	}
	
	void initControlListeners() {
		CollectionListener<Variable> variableCollectionsListener = new CollectionListener<Variable>() {
			public void collectionChanged(CollectionEvent<Variable> e) {
				if (e.getType() == CollectionEvent.EventType.REMOVED)
					return;
				
				for (Variable v : e.getElements()) {
					VariableComponent c = variableComponents.get(v);
					if (c == null)
						continue;
					
					c.updateVariableDisplay();
					if (e.getSource() == mouseFocusedVariables)
						vectorDisplay.moveToFront(c);
				}
			}
		};
		stickyDisplayVariables.addCollectionListener(variableCollectionsListener);
		selectedVariables.addCollectionListener(variableCollectionsListener);
		mouseFocusedVariables.addCollectionListener(variableCollectionsListener);
	}
	
	void removeComponents(Variable variable) {
		JComponent c = variableComponents.get(variable);
		if (c != null)
			vectorDisplay.remove(c);
		
		Set<LinkComponent> ks = linkComponents.get(variable);
		if (ks != null)
			for (JComponent link : ks)
				vectorDisplay.remove(link);
	}
	VariableComponent getVariableComponent(Variable variable) {
		VariableComponent c = variableComponents.get(variable);
		if (c == null) {
			variableComponents.put(variable, c = new VariableComponent(this, variable));
			vectorDisplay.add(c, new Integer(VARIABLES_DEPTH));
		}
		return c;
	}
	void addComponents(Variable variable) {
		VariableComponent c = getVariableComponent(variable);
		Set<LinkComponent> ks = linkComponents.get(variable);
		if (ks == null)
			linkComponents.put(variable, ks = new HashSet<LinkComponent>());
		
		for (Variable otherVariable : getHub().getBayesianNet().getDefinitions().get(variable).getArgumentNames()) {
			if (otherVariable == variable)
				continue;
			
			LinkComponent link = new LinkComponent(getVariableComponent(otherVariable), c, true);
			ks.add(link);
			vectorDisplay.add(link, new Integer(LINKS_DEPTH));
		}
	}
	
	protected void reassignColorSchemes() {
		Graph<Variable> graph = hub.getBayesianNet().getGraph();
		int iVar = 0, nVars = graph.getNodeList().size();
		for (final Variable v : graph.getNodeList()) {
			float r = (iVar++)/(float)nVars;
			Color 	mainColor = Color.getHSBColor(r, 0.45f, 0.75f),
					secColor  = Color.getHSBColor(r, 0.08f, 0.85f);
			
			colorSchemes.put(v, new VariableColorScheme(mainColor, secColor));
			getVariableComponent(v).updateColors();
		}
	}
	public ListenableMap<Variable, VariableColorScheme> getColorSchemes() {
		return colorSchemes;
	}
	public JComponent getVectorDisplay() {
		return vectorDisplay;
	}
	public ListenableSet<Variable> getStickyDisplayVariables() {
		return stickyDisplayVariables;
	}
	public ListenableSet<Variable> getSelectedVariables() {
		return selectedVariables;
	}
	public ListenableSet<Variable> getMouseFocusedVariables() {
		return mouseFocusedVariables;
	}
	public void destroyObject() {
		variableComponents.clear();
		colorSchemes.clear();
		stickyDisplayVariables.clear();
		selectedVariables.clear();
		mouseFocusedVariables.clear();
	}
	protected boolean isSticky(Variable v) {
		return stickyDisplayVariables.contains(v);
	}
	protected void setSticky(Variable v, boolean b) {
		if (b) stickyDisplayVariables.add(v);
		else stickyDisplayVariables.remove(v);
	}
	protected boolean isMouseFocused(Variable v) {
		return mouseFocusedVariables.contains(v);
	}
	protected void setMouseFocused(Variable v, boolean b) {
		if (b) mouseFocusedVariables.add(v);
		else mouseFocusedVariables.remove(v);
	}
	
	public BayesianNetworkHub getHub() {
		return hub;
	}
	public void setShowPercents(boolean showPercents) {
		this.showPercents = showPercents;
	}
	public boolean isShowPercents() {
		return showPercents;
	}
	public static ProgressBarUI getValueBarUI() {
		return valueBarUI;
	}
}
