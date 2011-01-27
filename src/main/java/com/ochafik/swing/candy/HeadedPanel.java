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

package com.ochafik.swing.candy;

import java.awt.BorderLayout;
import java.awt.Color;
import java.awt.Component;
import java.awt.event.MouseAdapter;
import java.awt.event.MouseEvent;

import javax.swing.Box;
import javax.swing.JComponent;
import javax.swing.JFrame;
import javax.swing.JLabel;
import javax.swing.JPanel;

import com.ochafik.swing.event.RecursiveListenersSupport;


public class HeadedPanel extends JPanel {
	JComponent head, content;
	RoundCorneredColoredPanel headContainer, contentContainer;
	Color headColor, contentColor;
	boolean showHead = true, showContent = true;
	
	RecursiveListenersSupport recursiveListenersManager = new RecursiveListenersSupport();
	
	public HeadedPanel() {
		this(null, null);
	}
	
	public HeadedPanel(JComponent head) {
		this(head, null);
	}
	public HeadedPanel(JComponent head, JComponent content) {
		super(new BorderLayout());
		setHead(head);
		setContent(content);
		setOpaque(false);
	}
	
	public boolean isInHead(Component c) {
		return headContainer == null ? false : headContainer.isAncestorOf(c);
	}
	public boolean isInContent(Component c) {
		return contentContainer == null ? false : contentContainer.isAncestorOf(c);
	}
	
	/*@Override
	protected void paintChildren(Graphics g) {
		super.paintChildren(g);
		
		if (isShowContent() && isShowHead() && headContainer != null && contentContainer != null) {
			Graphics2D g2d = (Graphics2D)g;
			Dimension d = getSize();
			int cornerSize = 15;
			Insets i = getInsets();
			int x = i.left, y = i.top, h = d.height - i.top - i.bottom, w = d.width - i.left - i.right;
			GradientPaint vPaint = new GradientPaint(x,y,contentColor,x,y+h,headColor);
			g2d.setPaint(vPaint);
			g2d.drawRoundRect(x,y,w,h,cornerSize,cornerSize);
		}
	}*/
	
	public void setColors(Color headColor, Color contentColor) {
		this.headColor = headColor ;
		this.contentColor = contentColor;
		
		if (headContainer != null) {
			headContainer.setBackground(headColor);
		}
		if (contentContainer != null) {
			contentContainer.setBackground(contentColor);
		}
	}
	public void setContent(JComponent content) {
		if (this.contentContainer != null) {
			recursiveListenersManager.getRootComponents().remove(contentContainer);
			//uninstallListeners(contentContainer);
			contentContainer.removeAll();
			if (content != null) {
				contentContainer.add("Center", content);
				recursiveListenersManager.getRootComponents().add(contentContainer);
				//installListeners(contentContainer);
			} else {
				remove(contentContainer);
				contentContainer = null;
			}
		} else {
			if (content != null) {
				contentContainer = new RoundCorneredColoredPanel();
				contentContainer.setBackground(contentColor);
				contentContainer.add("Center", content);
				//installListeners(contentContainer);
				recursiveListenersManager.getRootComponents().add(contentContainer);
				if (showContent) add("Center", contentContainer);
			}
		}
		this.content = content;
		update();
	}
	public void setShowContent(boolean showContent) {
		this.showContent = showContent;
		update();
		
		if (contentContainer != null) {
			if (showContent) {
				add("Center", contentContainer);
			} else {
				remove(contentContainer);
			}
			revalidate();
		}
	}
	public void setShowHead(boolean showHead) {
		this.showHead = showHead;
		update();
		
		if (headContainer != null) {
			if (showHead) {
				add("North", headContainer);
			} else {
				remove(headContainer);
			}
			revalidate();
		} 
	}
	public JComponent getHead() {
		return headContainer.getComponentCount() == 1 ? (JComponent)headContainer.getComponent(0) : null;
	}
	public JComponent getContent() {
		return contentContainer.getComponentCount() == 1 ? (JComponent)contentContainer.getComponent(0) : null;
	}
	public void setHead(JComponent head) {
		if (this.headContainer != null) {
			//uninstallListeners(headContainer);
			recursiveListenersManager.getRootComponents().remove(headContainer);
			headContainer.removeAll();
			if (head != null) {
				headContainer.add("Center", head);
				//installListeners(headContainer);
				recursiveListenersManager.getRootComponents().add(headContainer);
			} else {
				remove(headContainer);
			}
		} else {
			if (head != null) {
				headContainer = new RoundCorneredColoredPanel();
				headContainer.setBackground(headColor);
				headContainer.add("Center", head);
				//installListeners(headContainer);
				recursiveListenersManager.getRootComponents().add(headContainer);
				if (showHead) add("North", headContainer);
			}
		}
		this.head = head;
		update();
	}
	protected void update() {
		if (contentContainer != null) {
			contentContainer.setCorners(head == null || !showHead ? RoundCorneredColoredPanel.ALL_CORNERS : RoundCorneredColoredPanel.SOUTH_CORNERS);
		}
	
		if (headContainer != null) {
			headContainer.setCorners(content == null || !showContent ? RoundCorneredColoredPanel.ALL_CORNERS : RoundCorneredColoredPanel.NORTH_CORNERS);
		}
	}
	public static void main(String[] args) {
		JFrame f = new JFrame("test");
		Box b = Box.createHorizontalBox();
		
		HeadedPanel hp;
		
		hp = new HeadedPanel(new JLabel("Variable 1"), new JLabel("This is\nSome content..."));
		hp.setColors(new Color(200,100,100), new Color(200,150,150));
		b.add(addToggleBehaviour(hp));
		
		hp = new HeadedPanel(new JLabel("Head"), null);
		hp.setColors(new Color(100,200,100), new Color(150,200,150));
		b.add(addToggleBehaviour(hp));
		
		hp = new HeadedPanel(null, new JLabel("This is\nSome content..."));
		hp.setColors(new Color(100,100,200), new Color(150,150,200));
		b.add(addToggleBehaviour(hp));
		
		b.add(Box.createHorizontalGlue());
		f.getContentPane().add("North",b);
		f.getContentPane().add("Center",new JLabel());
		f.pack();
		f.setVisible(true);
	}
	public boolean isShowContent() {
		return showContent;
	}
	public boolean isShowHead() {
		return showHead;
	}
	static HeadedPanel addToggleBehaviour(final HeadedPanel p) {
		p.getRecursiveListenersManager().addMouseListener(new MouseAdapter() {
			@Override
			public void mouseClicked(MouseEvent e) {
				p.setShowContent(!p.isShowContent());
			}
		});
		return p;
	}
	public RecursiveListenersSupport getRecursiveListenersManager() {
		return recursiveListenersManager;
	}
}
