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

package com.ochafik.swing.event;

import java.awt.Component;
import java.awt.Container;
import java.awt.event.ComponentListener;
import java.awt.event.ContainerAdapter;
import java.awt.event.ContainerListener;
import java.awt.event.KeyListener;
import java.awt.event.MouseListener;
import java.awt.event.MouseMotionListener;
import java.util.ArrayList;
import java.util.List;

import javax.swing.JComponent;

import com.ochafik.util.listenable.CollectionEvent;
import com.ochafik.util.listenable.CollectionListener;
import com.ochafik.util.listenable.DefaultListenableCollection;
import com.ochafik.util.listenable.ListenableCollection;


public class RecursiveListenersSupport {
	ListenableCollection<JComponent> rootComponents = new DefaultListenableCollection<JComponent>(new ArrayList<JComponent>());
	
	List<ComponentListener> componentListeners = new ArrayList<ComponentListener>();
	List<MouseListener> mouseListeners = new ArrayList<MouseListener>();
	List<KeyListener> keyListeners = new ArrayList<KeyListener>();
	List<MouseMotionListener> mouseMotionListeners = new ArrayList<MouseMotionListener>();
	
	public RecursiveListenersSupport() {
		rootComponents.addCollectionListener(new CollectionListener<JComponent>() {
			public void collectionChanged(CollectionEvent<JComponent> e) {
				switch (e.getType()) {
				case ADDED:
					for (JComponent c : e.getElements()) installListeners(c);
					break;
				case REMOVED:
					for (JComponent c : e.getElements()) uninstallListeners(c);
					break;
				case UPDATED:
					for (JComponent c : e.getElements()) reinstallListeners(c);
					break;
				}
			}
		});
	}
	public ListenableCollection<JComponent> getRootComponents() {
		return rootComponents;
	}
	public void addComponentListener(ComponentListener listener) {
		componentListeners.add(listener);
		for (JComponent component : rootComponents) reinstallListeners(component);
	}
	public void removeComponentListener(ComponentListener listener) {
		componentListeners.remove(listener);
		for (JComponent component : rootComponents) reinstallListeners(component);
	}
	public void addKeyListener(KeyListener listener) {
		keyListeners.add(listener);
		for (JComponent component : rootComponents) reinstallListeners(component);
	}
	public void removeKeyListener(KeyListener listener) {
		keyListeners.remove(listener);
		for (JComponent component : rootComponents) reinstallListeners(component);
	}
	public void addMouseListener(MouseListener listener) {
		mouseListeners.add(listener);
		for (JComponent component : rootComponents) reinstallListeners(component);
	}
	public void removeMouseListener(MouseListener listener) {
		mouseListeners.remove(listener);
		for (JComponent component : rootComponents) reinstallListeners(component);
	}
	public void addMouseMotionListener(MouseMotionListener listener) {
		mouseMotionListeners.add(listener);
		for (JComponent component : rootComponents) reinstallListeners(component);
	}
	public void removeMouseMotionListener(MouseMotionListener listener) {
		mouseMotionListeners.remove(listener);
		for (JComponent component : rootComponents) reinstallListeners(component);
	}
	ContainerListener containerListener = new ContainerAdapter() {
		public void componentAdded(java.awt.event.ContainerEvent e) {
			installListeners(e.getChild());
		};
		public void componentRemoved(java.awt.event.ContainerEvent e) {
			uninstallListeners(e.getChild());
		};
	};
	void reinstallListeners(Component component) {
		uninstallListeners(component);
		installListeners(component);
	}
	void installListeners(Component component) {
		for (ComponentListener listener : componentListeners) component.addComponentListener(listener);
		for (KeyListener listener : keyListeners) component.addKeyListener(listener);
		for (MouseListener listener : mouseListeners) component.addMouseListener(listener);
		for (MouseMotionListener listener : mouseMotionListeners) component.addMouseMotionListener(listener);
		if (component instanceof Container) {
			Container container = (Container)component;
			container.addContainerListener(containerListener);
			for (int iComp = container.getComponentCount(); iComp-- != 0;) {
				installListeners(container.getComponent(iComp));
			}
		}
	}
	void uninstallListeners(Component component) {
		for (ComponentListener listener : componentListeners) component.removeComponentListener(listener);
		for (KeyListener listener : keyListeners) component.removeKeyListener(listener);
		for (MouseListener listener : mouseListeners) component.removeMouseListener(listener);
		for (MouseMotionListener listener : mouseMotionListeners) component.removeMouseMotionListener(listener);
		if (component instanceof Container) {
			Container container = (Container)component;
			container.removeContainerListener(containerListener);
			for (int iComp = container.getComponentCount(); iComp-- != 0;) {
				uninstallListeners(container.getComponent(iComp));
			}
		}
	}
}
