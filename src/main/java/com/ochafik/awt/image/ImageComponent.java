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

package com.ochafik.awt.image;
import java.awt.Canvas;
import java.awt.Dimension;
import java.awt.Graphics;
import java.awt.Image;
public class ImageComponent extends Canvas {
	public void update(Graphics g) {
		paint(g);
	}
	public void paint(Graphics g) {
		g.drawImage(image,0,0,l,h,null);
		g.dispose();
	}
	public ImageComponent() {}
	public ImageComponent(Image im) {
		setImage(im);
	}
	public Dimension getPreferredSize() {return new Dimension(l,h);}
	public Dimension getMinimumSize() {return new Dimension(l,h);}
	protected int l,h;
	protected Image image;
	public void setImage(Image im) {
		setImage(im,true);
	}
	public void setImage(Image im,boolean checkSize) {
		image=im;
		if (checkSize) {
			int newL=im.getWidth(this);
			int newH=im.getHeight(this);
			
			if (newH!=h||newL!=l) {
				l=newL;
				h=newH;
				setSize(l,h);
			}
		}
		repaint();
	}
	public Image getImage() {return image;}
	public void destroyMe() {image=null;}
}