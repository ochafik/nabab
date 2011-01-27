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