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

package com.ochafik.awt;

import java.awt.BorderLayout;
import java.awt.Button;
import java.awt.Canvas;
import java.awt.Color;
import java.awt.Component;
import java.awt.Container;
import java.awt.Font;
import java.awt.Frame;
import java.awt.GraphicsEnvironment;
import java.awt.Image;
import java.awt.Label;
import java.awt.Panel;
import java.awt.Point;
import java.awt.TextField;
import java.awt.Window;
import java.awt.event.ActionEvent;
import java.awt.event.ActionListener;
import java.awt.event.WindowAdapter;
import java.awt.event.WindowEvent;
import java.util.Enumeration;
import java.util.Vector;

import javax.swing.AbstractButton;
import javax.swing.JTextField;

import com.ochafik.awt.image.ImageComponent;
import com.ochafik.lang.Destroyable;

public class OldAWTUtils {
	public static void destroyDestroyable(Component c) {
		if (c instanceof Container) {
			Container ct=(Container)c;
			Component cc[]=ct.getComponents();
			for (int i=cc.length;i--!=0;) destroyDestroyable(cc[i]);
			ct.removeAll();
		}
		if (c instanceof Destroyable) {
			((Destroyable)c).destroyObject();
		}
	}
	public static final Font chooseFont(Component c,String title,String invite) {
		String names[]=GraphicsEnvironment.getLocalGraphicsEnvironment().getAvailableFontFamilyNames();
		int i=JDialogs.combo(null,title,invite,names,0);
		if (i<0) {
			return null;
		} else {
			return Font.getFont(names[i]);
		}
	}
	public static final void exitingFrame(Window f) {
		exitingFrame(f,null);
	}
	public static final void exitingFrame(Window f,Runnable r) {
		final Runnable run=r;
		f.addWindowListener(new WindowAdapter() {
			public void windowClosing(WindowEvent ev) {
				try {
					if (run!=null) run.run();
					try {
						System.exit(0);
					} catch (SecurityException ex) {
						Frame fr=(Frame)ev.getSource();
						fr.setVisible(false);
						destroyDestroyable(fr);
						System.gc();
						//throw ex;
					}
				} catch (RuntimeException ex) {
					//run n'a pas voulu enteriner la fermeture !
				}
			}});
	}
	public static final void hidingFrame(Window fr) {
		hidingFrame(fr,null);
	}
	public static final void hidingFrame(Window fr,Runnable r) {
		final Window f=fr;
		final Runnable run=r;
		f.addWindowListener(new WindowAdapter() {
			public void windowClosing(WindowEvent ev) {
				try {
					if (run!=null) run.run();
					f.setVisible(false);
				} catch (RuntimeException ex) {
					//run n'a pas voulu enteriner la fermeture !
				}
			}});
	}
	public static final void frameHider(Component c) {
		final Frame f=getTheFrame(c);
		ActionListener al=new ActionListener() {
			public void actionPerformed(ActionEvent evt) {
				f.setVisible(false);
			}
		};
		if (c instanceof Button) ((Button)c).addActionListener(al);
		else if (c instanceof TextField) ((TextField)c).addActionListener(al);
		else if (c instanceof AbstractButton) ((AbstractButton)c).addActionListener(al);
		else if (c instanceof JTextField) ((JTextField)c).addActionListener(al);
		//else if (c instanceof Timer) ((Timer)c).addActionListener(al);
		else throw new IllegalArgumentException("Ne connait pas .addActionListener(AL) pour "+c.getClass().getName());
	}
	public static final Frame newExitingFrame(String title,Component contained) {
		return newExitingFrame(title,contained,null);
	}
	public static final Frame newExitingFrame(String title,Component contained,Runnable run) {
		Frame f=new Frame(title);
		exitingFrame(f,run);
		/*f.addWindowListener(new WindowAdapter() {
			public void windowClosing(WindowEvent ev) {
				System.exit(0);
			}});*/
		if (contained!=null) {
			f.add(contained);
			f.pack();
			Placeur.dimensionnerAvecTitre(f);
			f.setVisible(true);
		}
		return f;
	}
	public static final Frame newHidingFrame(String title,Component contained) {
		final Frame f=new Frame(title);
		hidingFrame(f);
		/*f.addWindowListener(new WindowAdapter() {
			public void windowClosing(WindowEvent ev) {
				f.setVisible(false);
			}});*/
		f.add(contained);
		f.pack();
		Placeur.dimensionnerAvecTitre(f);
		f.setVisible(true);
		return f;
	}
	public static final void setBackgroundRecursif(Component o,Color c) {
		o.setBackground(c);
		if (o instanceof Container) {
			Component cc[]=((Container)o).getComponents();
			for (int i=0;i<cc.length;i++) setBackgroundRecursif(cc[i],c);
		}
	}
	public static final void setForegroundRecursif(Component o,Color c) {
		o.setForeground(c);
		if (o instanceof Container) {
			Component cc[]=((Container)o).getComponents();
			for (int i=0;i<cc.length;i++) setForegroundRecursif(cc[i],c);
		}
	}
	public static final Frame getTheFrame(Component c) {
		while (!(c instanceof Frame)&&c!=null) {
			c=c.getParent();
		}
		return (Frame)c;
	}
	public static final Point getAbsoluteLocation(Component c) {
		Point p;
		int x=0,y=0;
		p=c.getLocation();
		x+=p.x;
		y+=p.y;
		while ((c=c.getParent())!=null) {
			p=c.getLocation();
			x+=p.x;
			y+=p.y;
			if (c instanceof Frame) break;
		}
		return new Point(x,y);
	}
	public static final Panel newPanel(Object[][] content) {
		Panel p=new Panel();
		fillContainer(p,content);
		return p;
	}
	public static final Panel newPanelGeo(
		Component center,
		Component north,
		Component south,
		Component east,
		Component west) {
		Panel p=new Panel();
		fillContainerGeo(p,center,north,south,east,west);
		return p;
	}
	public static final void fillContainerGeo(Container c, 
		Component center,
		Component north,
		Component south,
		Component east,
		Component west) {
		c.setLayout(new BorderLayout());
		if (center!=null) c.add("Center",center);
		if (north!=null) c.add("North",north);
		if (south!=null) c.add("South",south);
		if (east!=null) c.add("East",east);
		if (west!=null) c.add("West",west);
	}
	public static final Buttons fillContainer(Container c, Object[][] content/*, ButtonsListener bl*/) {
		Buttons buttons=null;
		int h=content.length,
			w=content[0].length;
		//c.setLayout(new NewTableLayout(w,h));
		//c.setLayout(new TableLayout(w,h));
		c.setLayout(new OldTableLayout(w,h));
		for (int y=0; y<h; y++) {
			for (int x=0;x<w;x++) {
				Object ob=content[y][x];
				String s=null;
				Component comp;
				Object oComp=null;
				if (ob instanceof Object[][]) {
					oComp=ob;
				} else if (ob instanceof Object[]) {
					Object[] oba=(Object[])ob;
					s=oba.length>1 ? (String)oba[1] : null;
					oComp=oba[0];
				} else oComp=ob;

				if (oComp==null) comp=new Canvas();
				else if (oComp instanceof Object[][]) {
					Panel p=new Panel();
					Buttons tmp=fillContainer(p,(Object[][])oComp);
					if (tmp!=null) buttons=tmp;
					comp=p; 
				} else if (oComp instanceof Component) comp=(Component)oComp;
				else if (oComp instanceof String[]) comp=new Buttons((String[])oComp);
				else if (oComp instanceof String) {
					String stl=(String)oComp;
					if (stl.indexOf("\n")>=0) comp=new TextLabels(stl);
					else comp=new Label(stl);
				} else if (oComp instanceof Image) {
					comp=new ImageComponent((Image)oComp);
				} else comp=new TextLabels(oComp.toString());

				//si aucun Buttons specifie, le deviner au cas ou...
				if (comp instanceof Buttons) buttons=(Buttons)comp;
				if (s==null) c.add(comp);
				else  c.add(comp,s);
			}
		}
		return buttons;
	}
	public static final Panel horizontalLayout(Vector v) {
		int len=v.size();
		Panel p=new Panel(new OldTableLayout(len,1));
		for (Enumeration e=v.elements();e.hasMoreElements();) {
			p.add((Component)(e.nextElement()));
		}
		return p;
	}
}
