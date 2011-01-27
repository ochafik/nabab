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
import java.awt.Container;
import java.awt.Dimension;
import java.awt.Graphics;
import java.awt.Graphics2D;
import java.awt.Point;
import java.awt.Rectangle;
import java.awt.RenderingHints;
import java.awt.event.ComponentAdapter;
import java.awt.event.ComponentEvent;
import java.awt.event.ComponentListener;
import java.awt.geom.GeneralPath;
import java.awt.geom.Point2D;
import java.awt.geom.Rectangle2D;
import java.beans.PropertyChangeEvent;
import java.beans.PropertyChangeListener;

import javax.swing.JComponent;
import javax.swing.SwingUtilities;

import com.ochafik.swing.vector.PositionUtils;
import com.ochafik.util.listenable.Pair;

public class LinkComponent extends JComponent {
	VariableComponent from, to;
	boolean oriented;	
	
	public LinkComponent(VariableComponent from, VariableComponent to, boolean oriented) {
		this.from = from;
		this.to = to;
		this.oriented = oriented;
		setOpaque(false);
		
		ComponentListener listener = new ComponentListener() {
			@Override
			public void componentMoved(ComponentEvent e) {
				if (e.getSource() != LinkComponent.this)
					updateBounds();
			}
			@Override
			public void componentResized(ComponentEvent e) {
				updateBounds();
			}
			@Override
			public void componentShown(ComponentEvent e) {
				updateBounds();
			}
			@Override
			public void componentHidden(ComponentEvent e) {}
		};
		
		PropertyChangeListener propertyChangeListener = new PropertyChangeListener() {
			@Override
			public void propertyChange(PropertyChangeEvent evt) {
				updateBounds();
				
			}
		};
		updateBounds();
		to.addComponentListener(listener);
		from.addComponentListener(listener);
		addComponentListener(listener);
	}
	
	@Override
	public Dimension getPreferredSize() {
		return getBounds().getSize();
	}
	
	/*
	@Override
	public Point getLocation() {
		Rectangle r = getBounds();
		return new Point(r.x, r.y);
	}
	@Override
	public Rectangle getBounds() {
		updateBounds();
		return super.getBounds();
	}
	*/
	
	protected void updateBounds() {
		cachedCoordinates = null;
		cachedArrowHat = null;
		
//		Rectangle2D r = new Rectangle(0, 0, 0, 0);
//		r.add(to.getBounds());
//		r.add(from.getBounds());
//		setBounds(r.getBounds());
		
		
//		Container parent = getParent();
//		if (parent == null) {
//			return;
//		}
		
		Point2D cf = new Point2D.Double(from.getBounds().getCenterX(), from.getBounds().getCenterY());
		Point2D ct = new Point2D.Double(to.getBounds().getCenterX(), to.getBounds().getCenterY());
		
		int d = 3;
		Rectangle2D r = new Rectangle2D.Double(
			Math.min(cf.getX(), ct.getX()) - d,
			Math.min(cf.getY(), ct.getY()) - d,
			Math.abs(cf.getX() - ct.getX()) + 2 * d,
			Math.abs(cf.getY() - ct.getY()) + 2 * d
		);
		//
//		Rectangle2D r = 
//			SwingUtilities.convertRectangle(to, to.getBounds(), parent).createUnion(
//				SwingUtilities.convertRectangle(from, from.getBounds(), parent)
//			)
//		;
		
//		Rectangle2D r = new Rectangle(0, 0, 0, 0);
//		r.add(to.getBounds());
//		r.add(from.getBounds());
//		//r.add(SwingUtilities.convertRectangle(to, to.getBounds(), parent));
//		//r.add(SwingUtilities.convertRectangle(from, from.getBounds(), parent));
//		
////		System.out.println("to = " + to.getBounds() + ", from = " + from.getBounds() + ", bounds = " + r);
//		if (getParent() != null) {
//			getParent().remove(this);
//			getParent().add(this, new Integer(BayesianNetworkDisplay.LINKS_DEPTH));
//		}
		setBounds(r.getBounds());
		//repaint();
	}
	Point2D.Float toFloat(Point2D p) {
		if (p instanceof Point2D.Float) return (Point2D.Float)p;
		return new Point2D.Float((float)p.getX(), (float)p.getY());
	}
	Pair<Point, Point> cachedCoordinates;
	GeneralPath cachedArrowHat;
	
	Point computeCenter(JComponent c) {
		Rectangle r =
			c.getBounds();
			//SwingUtilities.convertRectangle(c, c.getBounds(), this);
		return new Point((int)r.getCenterX(), (int)r.getCenterY());
	}
	
	@Override
	protected void paintComponent(Graphics g) {
		Graphics2D g2d = (Graphics2D)g;
		
		//g.setColor(Color.black);
		//g.drawRect(0, 0, getWidth() - 1, getHeight() - 1);
		
		g2d.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
		g2d.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
		g2d.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
		
//		Rectangle boundsFrom = SwingUtilities.convertRectangle(from, from.getBounds(), this);
//		Rectangle boundsTo = SwingUtilities.convertRectangle(to, to.getBounds(), this);
		Rectangle boundsFrom = from.getBounds();
		Rectangle boundsTo = to.getBounds();

		Point centerFrom = new Point((int)boundsFrom.getCenterX(), (int)boundsFrom.getCenterY());
		//Point centerTo = new Point((int)boundsTo.getCenterX(), (int)boundsTo.getCenterY());
		
		Point 
			destination = PositionUtils.getExternalAnchor(boundsTo, centerFrom), 
			source = centerFrom;	

		Point location = getLocation();
		destination.translate(-location.x, -location.y);
		source.translate(-location.x, -location.y);
		
		//Point destination = centerTo, position = centerFrom;
		//Point destination = PositionUtils.getExternalAnchor(SwingUtilities.convertRectangle(to, to.getBounds(), this), centerFrom), position = centerFrom;
		
//		Rectangle boundsFrom = from.getBounds();
//		Point centerFrom = new Point((int)boundsFrom.getCenterX(), (int)boundsFrom.getCenterY());
//		Point destination = PositionUtils.getExternalAnchor(to.getBounds(), centerFrom), position = centerFrom;	
//		centerFrom = SwingUtilities.convertPoint(from, centerFrom, this);
//		destination = SwingUtilities.convertPoint(to, destination, this);
		
//		System.out.println("bounds = " + getBounds() + ", centerFrom = " + centerFrom + ", destination = " + destination);
		
		
		float destX = destination.x, destY = destination.y, srcX = source.x, srcY = source.y;
		if (oriented) {
			boolean drawn = false;
			if (cachedArrowHat != null) {
				if (cachedCoordinates.getFirst().equals(source) && cachedCoordinates.getSecond().equals(destination)) {
					g2d.fill(cachedArrowHat);
					drawn = true;
				}
			}
			if (!drawn) {
				float angle = (float)Math.atan2(destY - srcY, destX - srcX);
				//float deltaAngle = (float)(11.3 * Math.PI/12.0);
				float deltaAngle = (float)(10.8 * Math.PI/12.0);
				float arrowLength = 10;
				
				GeneralPath path = new GeneralPath();
				path.moveTo(destX, destY);
				path.lineTo((float)(destX+arrowLength*Math.cos(angle+deltaAngle)), (float)(destY+arrowLength*Math.sin(angle+deltaAngle)));
				path.lineTo((float)(destX+arrowLength*Math.cos(angle-deltaAngle)), (float)(destY+arrowLength*Math.sin(angle-deltaAngle)));
				path.lineTo(destX, destY);
				
				g2d.fill(path);
				cachedArrowHat = path;
				cachedCoordinates = new Pair<Point, Point>(source, destination);
			}
		}
		g2d.drawLine((int)srcX, (int)srcY, (int)destX, (int)destY);
	}
}