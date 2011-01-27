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

package com.ochafik.swing;

import java.awt.CardLayout;
import java.awt.Component;
import java.awt.Container;
import java.awt.Cursor;
import java.awt.Insets;
import java.awt.LayoutManager;
import java.awt.Point;
import java.awt.Rectangle;
import java.awt.Window;
import java.awt.event.MouseAdapter;
import java.awt.event.MouseEvent;

import javax.swing.BorderFactory;
import javax.swing.JComponent;
import javax.swing.JPanel;
import javax.swing.JPopupMenu;
import javax.swing.JScrollPane;
import javax.swing.JTabbedPane;
import javax.swing.JTextArea;
import javax.swing.JViewport;
import javax.swing.SwingUtilities;
import javax.swing.UIManager;
import javax.swing.border.Border;
import javax.swing.event.MouseInputAdapter;

/**
 @author <a href="mailto:ochafik@voila.fr">Olivier Chafik</a>
 @version 1.0
 */
public class SwingUtils {
	public static final Component getLabelComponent(String text) {
		return getLabelComponent(text,10,80);
	}
	public static final void addPopup(final Component c,final JPopupMenu m) {
		c.addMouseListener(new MouseAdapter() {public void mousePressed(MouseEvent e) {
			if (e.isPopupTrigger()) m.show(c,e.getX(),e.getY());
		}});
	}
	public static final void shortenHorizontalInsets(JComponent c) {
		Insets i=c.getInsets();
		int top=i.top,bottom=i.bottom,
		left=i.left,right=i.right;
		int min=top>bottom ? bottom : top;
		if (left>min) i.left=min;
		if (right>min) i.right=min;
		//c.setInsets(i);
	}
	public static final Component getLabelComponent(String text,int rows,int cols) {
		JTextArea txt = new JTextArea(text,10,80);
		//txt.setColumns(80);
		txt.setWrapStyleWord(true);
		txt.setLineWrap(true);
		txt.setOpaque(false);
		txt.setEditable(false);
		//txt.setEnabled(false);
		//txt.setFont(FontLoaderUtils.getOrLoadACompatibleFont(text,txt.getFont()));//UIManager.getFont("Label.font")));
		return new JScrollPane(txt);
	}
	public static final void ensureIsVisible(Component c) {
		Container p=c.getParent();
		while (p!=null) {
			//System.out.println(p);
			if (p instanceof JTabbedPane) {
				((JTabbedPane)p).setSelectedComponent(c);
				ensureIsVisible(p);
			} else {
				
				LayoutManager man=p.getLayout();
				if (man instanceof CardLayout) {
					//System.out.print("### CARDLAYOUT ");
					if (!c.isVisible()) {
						boolean trouve=false;
						for (int i=0,len=p.getComponentCount();i<len;i++) {
							if (p.getComponent(i)==c) {
								trouve=true;
								//System.out.println(i);
								// ainsi on connait l'index de la carte. on va donc partir de la premiere et faire des "next(p)" le nombre de fois qu'il faut.
								CardLayout cl=(CardLayout)man;
								cl.first(p);
								for (int j=0;j<i;j++) {
									cl.next(p);
								}
								break;
							}
						}
						//System.out.print(" "+trouve);
					} //else System.out.print(" VISIBLE");// sinon la carte est deja affichEe !!!
					//System.out.println();
				}
				if (p instanceof Window) {
					((Window)p).setVisible(true);
					break;
				}
				c=p;
				p=p.getParent();
			}
		}
	}
	public static MouseEvent adaptEventToDescendent(MouseEvent e, JComponent descendentTarget) {
		Point trans = new Point();
		Component source = e.getComponent();
		
		Component current = descendentTarget;
		while (current != source) {
			Rectangle b = current.getBounds();
			trans.x += b.x;
			trans.y += b.y;
			current = current.getParent();
		}
		Point point = e.getPoint();
		
		return new MouseEvent(
				descendentTarget,
				e.getID(),
				e.getWhen(),
				e.getModifiers(),
				point.x + trans.x,
				point.y + trans.y,
				e.getClickCount(),
				e.isPopupTrigger(),
				e.getButton()
		);
	}
	public static MouseEvent convertMouseEvent(MouseEvent e, Component newSource, Point newPoint) {
		return new MouseEvent(
				newSource,
				e.getID(),
				e.getWhen(),
				e.getModifiersEx(),
				newPoint.x,
				newPoint.y,
				e.getClickCount(),
				e.isPopupTrigger(),
				e.getButton()
		);
	}
	public static void swingDispatch(MouseEvent e, Component component) {
		swingDispatch(e, e.getPoint(), component);
	}
	
	public static void swingDispatch(MouseEvent e, Point point, final Component component) {
		synchronized (component.getTreeLock()) {
			if (component instanceof Container) {
				Container container = (Container)component;
				for (int i = container.getComponentCount(); i-- != 0;) {
					Component child = container.getComponent(i);
					Rectangle r = child.getBounds();
					if (r.contains(point)) {
						swingDispatch(e, new Point(point.x - r.x, point.y - r.y), child);
						return;
					}
				}
			}
		}
		final MouseEvent adapted = convertMouseEvent(e, component, point);
		SwingUtilities.invokeLater(new Runnable() { public void run() {
			component.dispatchEvent(adapted);
		}});
	}
	public static void addMiddleButtonDragSupport(Component targetComponent) {
		MouseInputAdapter mia = new MouseInputAdapter() {
			int m_XDifference, m_YDifference;
			boolean m_dragging = false;
			
			public void mouseDragged(MouseEvent e) {
				if (!m_dragging) return;
				
				Component target = e.getComponent();
				Container c = target.getParent();
				if (c instanceof JViewport) {
					JViewport jv = (JViewport) c;
					Point p = jv.getViewPosition();
					int newX = p.x - (e.getX() - m_XDifference);
					int newY = p.y - (e.getY() - m_YDifference);
					
					int maxX = target.getWidth() - jv.getWidth();
					int maxY = target.getHeight() - jv.getHeight();
					if (newX < 0)
						newX = 0;
					if (newX > maxX)
						newX = maxX;
					if (newY < 0)
						newY = 0;
					if (newY > maxY)
						newY = maxY;
					
					jv.setViewPosition(new Point(newX, newY));
				}
			}
			Cursor oldCursor;
			public void mousePressed(MouseEvent e) {
				if (SwingUtilities.isMiddleMouseButton(e)) {
					m_dragging = true;
					oldCursor = e.getComponent().getCursor();
					e.getComponent().setCursor(Cursor.getPredefinedCursor(Cursor.MOVE_CURSOR));
					m_XDifference = e.getX();
					m_YDifference = e.getY();
				}
			}
			
			public void mouseReleased(MouseEvent e) {
				if (m_dragging) {
					e.getComponent().setCursor(oldCursor);
					m_dragging = false;
				}
			}        
		};
		targetComponent.addMouseMotionListener(mia);
		targetComponent.addMouseListener(mia);
	}
	public static Border getNativeLoweredBorder() {
		Border border = UIManager.getBorder("InsetBorder.aquaVariant");
		if (border == null)
			border = BorderFactory.createLoweredBevelBorder();
		return border;
	}
}
