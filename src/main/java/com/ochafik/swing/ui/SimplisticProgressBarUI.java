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

package com.ochafik.swing.ui;

import java.awt.Color;
import java.awt.Dimension;
import java.awt.GradientPaint;
import java.awt.Graphics;
import java.awt.Graphics2D;
import java.awt.Insets;
import java.awt.Paint;

import javax.swing.JComponent;
import javax.swing.JProgressBar;
import javax.swing.plaf.ProgressBarUI;

import com.ochafik.util.listenable.Pair;


public class SimplisticProgressBarUI extends ProgressBarUI {
	Dimension preferredSize;
	
	static boolean useGradients;
	static {
		useGradients = System.getProperty("ochafik.swing.ui.useGradients", "true").equals("true");
	};
	
	public SimplisticProgressBarUI(Dimension preferredSize) {
		this.preferredSize = preferredSize;
	}

	@Override
	public Dimension getPreferredSize(JComponent c) {
		Insets in = c.getInsets();
		return new Dimension(preferredSize.width + in.left + in.right, preferredSize.height + in.top + in.bottom);
	}
	
	@Override
	public void installUI(JComponent c) {
		c.setOpaque(false);
	}
	static Color brighter(Color color) {
		float[] hsb = Color.RGBtoHSB(color.getRed(), color.getGreen(), color.getBlue(), null);
		float deltaS = 0 , deltaB = 0.1f;//05f;
		return Color.getHSBColor(hsb[0], hsb[1]-deltaS, hsb[2]+deltaB);
	}
	static Pair<Color,Color> darkerBrighter(Color color) {
		float[] hsb = Color.RGBtoHSB(color.getRed(), color.getGreen(), color.getBlue(), null);
		float deltaS = 0 , deltaB = 0.1f;//05f;
		return new Pair<Color,Color>(Color.getHSBColor(hsb[0], hsb[1]+deltaS, hsb[2]-deltaB),Color.getHSBColor(hsb[0], hsb[1]-deltaS, hsb[2]+deltaB));
	}
	GradientPaint cachedPaint;
	Color cachedBaseColor;
	int cachedBarWidth;
	
	@Override
	public void paint(Graphics g, JComponent c) {
		Graphics2D g2d = (Graphics2D)g;
		
		JProgressBar bar = (JProgressBar)c;
		Dimension size = bar.getSize();
		Insets in = bar.getInsets();
		
		double p = bar.getPercentComplete();
		Color color = bar.getForeground();
		int x = in.left, y = in.top, w = size.width - in.left - in.right, h = size.height - in.top - in.bottom;
		
		int barWidth = p < 0.5 ? (int)Math.ceil((w-2) * p) : (int)((w-2) * p);
		Paint oldPaint = null;
		if (useGradients) {
			GradientPaint paint = cachedPaint;
			if (cachedBaseColor == null || !cachedBaseColor.equals(color) || cachedBarWidth != barWidth) {
				Pair<Color,Color> darkerBrighter = darkerBrighter(cachedBaseColor = color);
				cachedBarWidth = barWidth;
				paint = cachedPaint = new GradientPaint(x+1,y, darkerBrighter.getSecond(), x+barWidth, y, darkerBrighter.getFirst());
			}
			oldPaint = g2d.getPaint();
			g2d.setPaint(paint);
		} else {
			g2d.setColor(color);
		}
		g2d.fillRect(x+1, y, barWidth+1, h);
		
		if (useGradients) {
			g2d.setPaint(oldPaint);
			g2d.setColor(color);
		}
		
		g2d.setColor(color);
		g2d.drawRect(x, y, w, h);
		
	}
}
