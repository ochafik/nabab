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

package com.ochafik.awt;
import java.awt.Component;
import java.awt.Container;
import java.awt.Dialog;
import java.awt.Dimension;
import java.awt.Frame;
import java.awt.Rectangle;
import java.awt.Toolkit;
import java.awt.Window;

@SuppressWarnings("unchecked")
public class Placeur 
{
	public static final void centrer(Window g, Window f) {
		Rectangle rg=g.getBounds(null);
		int largG=rg.width,hautG=rg.height;
		int l=largG,h=hautG,x,y;
		Dimension ecr=Toolkit.getDefaultToolkit().getScreenSize(); 
		int largE=ecr.width,hautE=ecr.height;
		if (f!=null&&f.isVisible()) {
			Rectangle rf=f.getBounds(null);
			x=rf.x+rf.width/2-largG/2;
			y=rf.y+rf.height/2-hautG/2;
		} else {
			x=largE/2-largG/2;
			y=hautE/2-hautG/2;
		}
		x=x+l>=largE ? largE-l : x;
		y=y+h>=hautE ? hautE-h : y;
		x=x<0 ? 0 : x;
		y=y<0 ? 0 : y;
		g.setBounds(new Rectangle(x,y,l,h));
	}
	public static final void placePercents(Window f,int x, int y, int l, int h) {
		Rectangle rf=f.getBounds(null);
		int largF=rf.width,hautF=rf.height;
		Dimension ecr=Toolkit.getDefaultToolkit().getScreenSize();
		int largE=ecr.width,hautE=ecr.height;
		
		f.setBounds(new Rectangle((x*largE)/100,(y*hautE)/100,l>=0 ? (l*largE)/100 : largF,h>=0 ? (h*hautE)/100 : hautF));
	}
	public static final int N=0,S=1,E=2,W=3,NE=4,SE=5,SW=6,NW=7,
				EN=8,ES=9,WN=10,WS=11,C=12;
	public static final void placeOrient(Window f,int o) {
		Rectangle rf=f.getBounds(null);
		int largF=rf.width,hautF=rf.height;
		Dimension ecr=Toolkit.getDefaultToolkit().getScreenSize();
		int largE=ecr.width,hautE=ecr.height;
		int x=rf.x,y=rf.y;
		switch (o) {
			case N:
				y=0;
				x=(largE-largF)/2;
				break;
			case S:
				y=hautE-hautF;
				x=(largE-largF)/2;
				break;
			case E:
				x=largE-largF;
				y=(hautE-hautF)/2;
				break;
			case W:	
				x=0;
				y=(hautE-hautF)/2;
				break;
			case NW:
				x=0;
				y=0;
				break;
			case NE:
				x=largE-largF;
				y=0;
			case SW:
				y=hautE-hautF;
				x=0;
				break;
			case SE:
				x=largE-largF;
				y=hautE-hautF;
				break;
			case C:
				x=(largE-largF)/2;
				x=(largE-largF)/2;
				break;
		}
		f.setBounds(new Rectangle(x,y,largF,hautF));
	}
	public static final void placePercents(Window f,int x, int y) {
		Rectangle rf=f.getBounds(null);
		int largF=rf.width,hautF=rf.height;
		Dimension ecr=Toolkit.getDefaultToolkit().getScreenSize();
		int largE=ecr.width,hautE=ecr.height;
		
		f.setBounds(new Rectangle((x*largE)/100,(y*hautE)/100,largF,hautF));
	}
	
	public static final void dimensionnerAvecTitre(Frame f) {
		Rectangle rf=f.getBounds();
		int largF=rf.width,hautF=rf.height;
		Dimension ecr=Toolkit.getDefaultToolkit().getScreenSize();
		int largE=ecr.width,hautE=ecr.height;
		
		String t=f.getTitle();
		t=t==null ? "" : t;
		int l=f.getFontMetrics(f.getFont()).stringWidth(t);
		l=l>0 ? l+60 : 0;
		largF=l<largF ? largF : (l>largE ? largE : l);
		f.setBounds(new Rectangle(rf.x,rf.y,largF,hautF));
	}
	public static final void dimensionnerAvecTitre(Dialog f) {
		Rectangle rf=f.getBounds();
		int largF=rf.width,hautF=rf.height;
		Dimension ecr=Toolkit.getDefaultToolkit().getScreenSize();
		int largE=ecr.width,hautE=ecr.height;
		
		String t=f.getTitle();
		t=t==null ? "" : t;
		int l=f.getFontMetrics(f.getFont()).stringWidth(t);
		l=l>0 ? l+60 : 0;
		largF=l<largF ? largF : (l>largE ? largE : l);
		f.setBounds(new Rectangle(rf.x,rf.y,largF,hautF));
	}
	public static final Component getComponentOfClass(Class cl,Component clue) {
		return getComponentOfClassAux(cl,clue,true);
	}
	public static final int dimensionTitre(Frame f) {
		//String s=f.getTitle();
		//Font f=f.getFont();
		return 200;

	}
	private static final Component getComponentOfClassAux(Class cl,Component clue,boolean allowup) {
		if (clue==null) return null;
		if (clue.getClass()==cl) return clue;
		Component r;
		if (clue instanceof Container) {
			Component cp[]=((Container)clue).getComponents();
			for (int i=0; i<cp.length; i++) {
				if (cp[i].getClass()==cl) return cp[i];
				else {
					if (cp[i] instanceof Container) {
						if ((r=getComponentOfClassAux(cl,cp[i],false))!=null) 
							return r;
					}
				}
			}
		} else if (allowup) return getComponentOfClassAux(cl,clue.getParent(),true);
		return null;
	}
	 public static final Window getTheWindow(Component c) {
		while (!(c instanceof Window)&&c!=null) {
			c=c.getParent();
		}
		return (Window)c;
	}
	public static final void placerSous(Window g, Window f) {
		if (f==null) return;
		Rectangle rf=f.getBounds(null),rg=g.getBounds(null);

		g.setBounds(new Rectangle(rg.x,
					rf.y+rf.height,
					rg.width,
					rg.height));
	}
	//Pas encore opErationnel...
	public static final void placeNextOrient(Window g, Window ref, int o) {
		if (ref==null) return;
		Rectangle rf=ref.getBounds(null),rg=g.getBounds(null);
      		
		g.setBounds(new Rectangle(rg.x,
					rf.y+rf.height,
					rg.width,
					rg.height));
	}
	/*public static final void storeWindowsBounds(Component parent,OutputStream out) throws IOException {
		(new ObjectOutputStream(out)).writeObject(getWindowsBounds(getTheWindow(parent)));
	}
	public static final void loadWindowsBounds(Component parent,InputStream in) throws Exception {
		setWindowsBounds(getTheWindow(parent),(Chaine)(new ObjectInputStream(in)).readObject());
	}*/
	/*private static final Chaine getWindowsBounds(Window w) {
		Chaine c=new Chaine(null);
		c.addLast(w.getBounds());
		Window[] r=w.getOwnedWindows();
		for (int i=0; i<r.length;i++) {
			c.addLast(getWindowsBounds(r[i]));
		}
		return c;
	}*/
	/*private static final void setWindowsBounds(Window w,Chaine c) {
		c.resetToFirst();
		w.setBounds((Rectangle)c.getNext());
		Window[] sw=w.getOwnedWindows();
		for (int i=0; i<sw.length&&i<c.length()-1;i++) {
			setWindowsBounds(sw[i],(Chaine)c.getNext());
		}
	}*/
}
