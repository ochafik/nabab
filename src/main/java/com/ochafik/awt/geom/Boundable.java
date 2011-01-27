package com.ochafik.awt.geom;

import java.awt.geom.Point2D;
import java.awt.geom.Rectangle2D;

public interface Boundable {
	public Rectangle2D getBoundingBox();
	public Point2D getInterestPoint();
	public boolean contains(double x, double y);
}
