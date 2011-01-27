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

import java.awt.Component;
import java.awt.Container;
import java.awt.Dimension;
import java.awt.Insets;
import java.awt.LayoutManager2;
import java.awt.Rectangle;
import java.util.HashMap;
import java.util.Map;

import javax.swing.JComponent;

import com.ochafik.math.functions.Variable;

class LaxistLayout implements LayoutManager2 {

	public boolean useToComputeSize(Component component) {
		return true;
	}
	public Rectangle computeBounds(Container parent, Component component) {
		return null;
	}
	
	@Override
	public void addLayoutComponent(Component comp, Object constraints) {}

	@Override
	public float getLayoutAlignmentX(Container target) {
		return ((JComponent)target).getAlignmentX();
	}

	@Override
	public float getLayoutAlignmentY(Container target) {
		return ((JComponent)target).getAlignmentY();
	}

	@Override
	public void invalidateLayout(Container target) {
		target.layout();
	}

	@Override
	public Dimension maximumLayoutSize(Container target) {
		return new Dimension(Integer.MAX_VALUE, Integer.MAX_VALUE);
	}

	@Override
	public void addLayoutComponent(String name, Component comp) {}

	@Override
	public void layoutContainer(Container parent) {
		for (Component c : parent.getComponents()) {
			Rectangle bounds = computeBounds(parent, c);
			if (bounds != null)
				c.setBounds(bounds);
			else if (!c.getSize().equals(c.getPreferredSize()))
				c.setSize(c.getPreferredSize());
			
//			if (bounds == null) {
//				c.getLocation();
//				c.setSize(c.getPreferredSize());
//			} else {
//				c.setBounds(bounds);
//			}
		}
	}

	@Override
	public Dimension minimumLayoutSize(Container parent) {
		return new Dimension(0, 0);
	}

	@Override
	public Dimension preferredLayoutSize(Container parent) {
		Insets i = ((JComponent)parent).getInsets();
		//Rectangle r = new Rectangle(0, 0, i.left + i.right, i.top + i.bottom);
		Rectangle r = new Rectangle(0, 0, 0, 0);
		for (Component c : parent.getComponents()) {
			// force recomputation of location
			if (!useToComputeSize(c))
				continue;
			
			//System.out.println("+ " + c.getBounds());
			//c.getLocation();
			r.add(new Rectangle(c.getLocation(), c.getPreferredSize()));//c.getBounds());
		}
//		/System.out.println("= " + r); 
		return r.getSize();
	}

	@Override
	public void removeLayoutComponent(Component comp) {}
	
}