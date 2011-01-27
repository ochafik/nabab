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

package com.ochafik.math.graph.view;

import java.awt.Dimension;
import java.awt.Graphics;
import java.awt.event.ComponentAdapter;
import java.awt.event.ComponentEvent;
import java.awt.event.MouseAdapter;
import java.awt.event.MouseEvent;
import java.awt.geom.Rectangle2D;
import java.util.List;

import javax.swing.JComponent;

import com.ochafik.math.bayes.BayesianNetworkHub;
import com.ochafik.math.graph.Graph;


public class GraphicComponent<N extends Comparable<N>> extends JComponent {
	private static final long serialVersionUID = 9180376937219029560L;
	
	Graphic<N> graphic;
	public GraphicComponent(Graph<N> graph, List<Graph<N>> costGraphs) {
		if (graph == null || costGraphs == null)
			throw new IllegalArgumentException("Null graphs !");
		
		graphic = new Graphic<N>(graph, costGraphs);
		addComponentListener(new ComponentAdapter() {
			@Override
			public void componentResized(ComponentEvent e) {
				Dimension size = getSize();
				graphic.setBounds(new Rectangle2D.Float(inset,inset,size.width-2*inset,size.height-2*inset));
				graphic.computePositions(200,5f*graphic.getGraph().getNodeList().size());
				repaint();
			}
		});
		addMouseListener(new MouseAdapter() {
			@Override
			public void mouseClicked(MouseEvent e) {
				if (e.getClickCount() > 1 && e.getButton() == MouseEvent.BUTTON1) {
					new Thread() { public void run() {
						graphic.init();
						repaint();
					}}.start();
				} else {
					graphic.computePositions(30, 5f*graphic.getGraph().getNodeList().size());
					repaint();
				}
			}
		});
	}

	int inset = 20;
	public void paintComponent(Graphics g) {
		Dimension size = getSize();
		graphic.setBounds(new Rectangle2D.Float(inset,inset,size.width-2*inset,size.height-2*inset));
		graphic.draw(g);
	}
	public Graphic<N> getGraphic() {
		return graphic;
	}
}
