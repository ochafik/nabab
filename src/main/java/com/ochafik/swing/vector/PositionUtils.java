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

package com.ochafik.swing.vector;

import java.awt.Dimension;
import java.awt.Point;
import java.awt.Rectangle;
import java.awt.geom.Point2D;

public class PositionUtils {
	public static Point getExternalAnchor(Rectangle rectangle, Point directionPoint) {
		// Center alignment for now
		double w = rectangle.width, h = rectangle.height;
		double cx = (int)rectangle.getCenterX(), cy = (int)rectangle.getCenterY();
	
		double dx = directionPoint.x - cx, dy = directionPoint.y - cy;
		
		if (dy == 0) {
			return new Point((int)(cx + w / (dx > 0 ? 2 : -2)), (int)(cy));
		}
		double dr = Math.abs(dx / dy), r = w / h;
		if (dr > r) {
			// direction is "more horizontal" than bounds : intersect with left or right side
			return new Point((int)(cx + w / (dx > 0 ? 2 : -2)), (int)(cy + (dy > 0 ? 1 : -1) * w / (2 * dr)));
		} else {
			return new Point((int)(cx + (dx > 0 ? 1 : -1) * dr * h / 2), (int)(cy + h / (dy > 0 ? 2 : -2)));
		}
	}
}
