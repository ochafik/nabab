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

package com.ochafik.swing.event;

import java.awt.Component;
import java.awt.Point;
import java.awt.event.MouseEvent;
import java.awt.event.MouseListener;
import java.awt.event.MouseMotionListener;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import javax.swing.JComponent;
import javax.swing.SwingUtilities;

public class AggregatingRecursiveMouseListener implements MouseListener, MouseMotionListener {
	private List<MouseListener> mouseListeners = new ArrayList<MouseListener>();
	private List<MouseMotionListener> mouseMotionListeners = new ArrayList<MouseMotionListener>();
	private final JComponent aggregationRoot;
	private final Class<?> aggregationRootClass;
	
	private boolean scheduled = false;
	private MouseEvent lastEvent;
	
	//Map<JComponent, MouseEvent> lastEvent;
	
	public AggregatingRecursiveMouseListener(JComponent root) {
		aggregationRoot = root;
		aggregationRootClass = null;
	}
	public AggregatingRecursiveMouseListener(Class<?> rootClass) {
		aggregationRoot = null;
		aggregationRootClass = rootClass;
	}
	public List<MouseListener> getMouseListeners() {
		return mouseListeners;
	}
	public List<MouseMotionListener> getMouseMotionListeners() {
		return mouseMotionListeners;
	}
	
	protected MouseEvent convertToRootEvent(MouseEvent e) {
		Component c = e.getComponent();
		Component root = aggregationRoot;
		if (root == null)
			root = aggregationRootClass.isInstance(c) ? c : SwingUtilities.getAncestorOfClass(aggregationRootClass, c);
		
		Point point = SwingUtilities.convertPoint(c, e.getPoint(), root);
		return new MouseEvent(root, e.getID(), e.getWhen(), e.getModifiers(), point.x, point.y, e.getClickCount(), e.isPopupTrigger(), e.getButton());
	}

	protected boolean isInDescendentOfRoot(MouseEvent e) {
		Component c = e.getComponent();
		if (aggregationRoot == null) {
			return 
				aggregationRootClass.isInstance(c) ||
				SwingUtilities.getAncestorOfClass(aggregationRootClass, e.getComponent()) != null;
		} else {
			return 
				c == aggregationRoot ||
				aggregationRoot.isAncestorOf(e.getComponent());
		}
	}
	public void mouseEntered(MouseEvent e) {
		if (!isInDescendentOfRoot(e)) 
			return;
		lastEvent = e;
		schedule();
	}
	public void mouseExited(MouseEvent e) {
		if (!isInDescendentOfRoot(e)) 
			return;
		lastEvent = e;
		schedule();
	}
	void schedule() {
		if (scheduled) 
			return;
		
		scheduled = true;
		SwingUtilities.invokeLater(new Runnable() {
			public void run() {
				scheduled = false;
				
				if (lastEvent == null) 
					return;
				
				MouseEvent e = convertToRootEvent(lastEvent);
				switch (e.getID()) {
				case MouseEvent.MOUSE_ENTERED:
					for (MouseListener listener : mouseListeners) 
						listener.mouseEntered(e);
					break;
				case MouseEvent.MOUSE_EXITED:
					for (MouseListener listener : mouseListeners) 
						listener.mouseExited(e);
					break;
				case MouseEvent.MOUSE_DRAGGED:
					for (MouseMotionListener listener : mouseMotionListeners) 
						listener.mouseDragged(e);
					break;
				case MouseEvent.MOUSE_MOVED:
					for (MouseMotionListener listener : mouseMotionListeners) 
						listener.mouseMoved(e);
					break;
				}
			}
		});
	}

	public void mousePressed(MouseEvent e) {
		if (!isInDescendentOfRoot(e)) 
			return;
		e = convertToRootEvent(e);
		for (MouseListener listener : mouseListeners) 
			listener.mousePressed(e);
	}
	public void mouseReleased(MouseEvent e) {
		if (!isInDescendentOfRoot(e)) 
			return;
		e = convertToRootEvent(e);
		for (MouseListener listener : mouseListeners) 
			listener.mouseReleased(e);
	}

	public void mouseClicked(MouseEvent e) {
		if (!isInDescendentOfRoot(e)) 
			return;
		e = convertToRootEvent(e);
		for (MouseListener listener : mouseListeners) 
			listener.mouseClicked(e);
	}
	
	public void mouseDragged(MouseEvent e) {
		if (!isInDescendentOfRoot(e)) 
			return;
		e = convertToRootEvent(e);
		for (MouseMotionListener listener : mouseMotionListeners) 
			listener.mouseDragged(e);
	}

	public void mouseMoved(MouseEvent e) {
		if (!isInDescendentOfRoot(e)) 
			return;
		e = convertToRootEvent(e);
		for (MouseMotionListener listener : mouseMotionListeners) 
			listener.mouseMoved(e);
	}
}
