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
