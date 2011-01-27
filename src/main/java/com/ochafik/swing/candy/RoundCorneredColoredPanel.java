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
import java.awt.Dimension;
import java.awt.GradientPaint;
import java.awt.Graphics;
import java.awt.Graphics2D;
import java.awt.LayoutManager;
import java.awt.Paint;
import java.awt.Shape;

import javax.swing.BorderFactory;
import javax.swing.JPanel;

import com.ochafik.util.listenable.Pair;


public class RoundCorneredColoredPanel extends JPanel {
	public static final int 
		NORTH_WEST_CORNER = 1,
		NORTH_EAST_CORNER = 2,
		SOUTH_WEST_CORNER = 4,
		SOUTH_EAST_CORNER = 8,
		
		NORTH_CORNERS = NORTH_EAST_CORNER | NORTH_WEST_CORNER,
		SOUTH_CORNERS = SOUTH_EAST_CORNER | SOUTH_WEST_CORNER,
		ALL_CORNERS = NORTH_CORNERS | SOUTH_CORNERS;
	
	static boolean bCyclicGradients = false;
	static boolean useGradients;
	static {
		useGradients = System.getProperty("ochafik.swing.ui.useGradients", "true").equals("true");
	};
	public static final int DEFAULT_CORNERSIZE = 15;
	public int corners, cornerSize;
	
	public RoundCorneredColoredPanel() {
		this(new BorderLayout(), ALL_CORNERS, DEFAULT_CORNERSIZE);
	}
	public RoundCorneredColoredPanel(LayoutManager lm, int corners, int cornerSize) {
		super(lm);
		setOpaque(false);
		setCorners(corners);
		setCornerSize(cornerSize);
	}
	public void setCorners(int configuration) {
		this.corners = configuration;
		if (isVisible()) repaint();
	}
	public void setCornerSize(int cornerSize) {
		this.cornerSize = cornerSize;
		int vInset = cornerSize / 6, hInset = cornerSize / 3;
		setBorder(BorderFactory.createEmptyBorder(vInset, hInset, vInset, hInset));
		if (isVisible()) repaint();
	}

	static float trim(float f) {
		if (f < 0) return 0;
		if (f > 1) return 1;
		return f;
 	}
	static Pair<Color,Color> darkerBrighter(Color color, float deltaS, float deltaB) {
		float[] hsb = Color.RGBtoHSB(color.getRed(), color.getGreen(), color.getBlue(), null);
		return new Pair<Color,Color>(
			Color.getHSBColor(hsb[0], trim(hsb[1]-deltaS), trim(hsb[2]-deltaB)),
			Color.getHSBColor(hsb[0], trim(hsb[1]+deltaS), trim(hsb[2]+deltaB))
		);
	}
	static Pair<Color,Color> darkerBrighter(Color color) {
		return darkerBrighter(color, 0, 0.1f);
	}
	static Pair<Color,Color> darkerBrighter2(Color color) {
		return darkerBrighter(color, 0, 0.2f);
	}
	GradientPaint cachedPaint, cachedPaint2;
	Color cachedBaseColor;
	int cachedHeight;
	
	@Override
	public void paintComponent(Graphics g) {
		Graphics2D g2d = (Graphics2D)g;
		Dimension d = getSize();
		/*
		g2d.setColor(getBackground());
		g2d.fillRect(0,0,d.width,d.height);
		//g2d.fillRoundRect(0,0,d.width - 1,d.height - 1, cornerSize, cornerSize);
		//g2d.fillRoundRect(0,0,d.width - 1,d.height - 1, cornerSize, cornerSize);
		g2d.fillRoundRect(0,0,d.width - 1,d.height - 1, 0, 0);
		//g2d.drawRect(d.width / 2,0,d.width,d.height/2);
		if (true) return;
		*/
		int x = 0, y = 0, w = d.width, h = d.height;
		
		Paint oldPaint = null;
		Color color = getBackground();
		if (useGradients) {
			if (cachedBaseColor == null || !cachedBaseColor.equals(color) || cachedHeight != h) {
				Pair<Color,Color> bottomTopColor = darkerBrighter(cachedBaseColor = color);
				cachedHeight = h;
				cachedPaint = new GradientPaint(x,y, bottomTopColor.getSecond(), x, y+h, bottomTopColor.getFirst(), bCyclicGradients);
				
				Pair<Color,Color> bottomTopColor2 = darkerBrighter2(color);
				switch (corners) {
				case ALL_CORNERS:
					break;
				case NORTH_CORNERS:
					bottomTopColor2.setFirst(bottomTopColor.getFirst());
					break;
				case SOUTH_CORNERS:
					bottomTopColor2.setSecond(bottomTopColor.getSecond());
					break;
				default:
					throw new UnsupportedOperationException();
				}
				cachedPaint2 = new GradientPaint(x,y, bottomTopColor2.getSecond(), x, y+h, bottomTopColor2.getFirst(), bCyclicGradients);
			}
			oldPaint = g2d.getPaint();
			g2d.setPaint(cachedPaint);
		} else {
			g2d.setColor(color);
		}
		//g.fillRoundRect(x, y, w-1, h, cornerSize, cornerSize);
		Shape oldClip;
		
		int arc = cornerSize / 2;
		switch (corners) {
		case ALL_CORNERS:
			g.fillRoundRect(x, y, w-1, h-1, cornerSize, cornerSize);
			
			if (useGradients) {
				g2d.setPaint(cachedPaint2);
				g.drawRoundRect(x, y, w-1, h-1, cornerSize, cornerSize);
			}
			break;
		case NORTH_CORNERS:
			oldClip = g2d.getClip();
			g2d.clipRect(0, 0, w, h);
			g.fillRoundRect(x, y, w-1, h+arc-1, cornerSize, cornerSize);
			if (useGradients) {
				g2d.setPaint(cachedPaint2);
				g.drawRoundRect(x, y, w-1, h+arc-1, cornerSize, cornerSize);
			}
			g2d.setClip(oldClip);
			break;
		case SOUTH_CORNERS:
			oldClip = g2d.getClip();
			g2d.clipRect(0, 0, w, h);
			g.fillRoundRect(x, y - arc, w-1, h+arc-1, cornerSize, cornerSize);
			if (useGradients) {
				g2d.setPaint(cachedPaint2);
				g.drawRoundRect(x, y - arc, w-1, h+arc-1, cornerSize, cornerSize);
			}
			g2d.setClip(oldClip);
			break;
		default:
			throw new UnsupportedOperationException();
		}
		
		if (useGradients) g2d.setPaint(oldPaint);
		
	}
}
