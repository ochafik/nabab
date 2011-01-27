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

package com.ochafik.awt.geom;
import java.awt.Shape;
import java.awt.geom.AffineTransform;
import java.awt.geom.GeneralPath;
import java.awt.geom.Point2D;
import java.awt.geom.Rectangle2D;
import java.util.Collection;
import java.util.SortedSet;
import java.util.TreeSet;


public class RelationShapesBuilder {
	final static double twoPI = 2.0 * Math.PI;
	
	final static double distorsionFactor = 0.6;
	final static double reverseDeltaAttenuation = 0.0;
	final static double relativeDistanceOfBezierControlPoints = 0.3;
	
	
	
	private static class AnglePoint<T> implements Comparable<AnglePoint<T>> {
		public T destination;
		public double angleFromSource,cDestX,cDestY,dX,dY;
		
		//public double angleOffsetFromStartAngle;
		
		public int compareTo(AnglePoint o) {
			double d =  angleFromSource - o.angleFromSource;
			if (d > 0) {
				return 1;
			} else {
				return d == 0.0 ? 0 : -1;
			}
		}
	};
	public static final GeneralPath createUnitHat() {
		return createUnitHat(0.3f,0.4f);
	}
	public static final GeneralPath createUnitHat(float invagination, float width) {
		
		GeneralPath arrow = new GeneralPath();
		arrow.moveTo(0,0);
		arrow.lineTo(-invagination, width / 2);
		arrow.lineTo(1, 0);
		arrow.lineTo(-invagination, -width / 2);
		arrow.lineTo(0, 0);
		return arrow;
	}
	public static final GeneralPath createArrowHat(Point2D destination, double theta, float length, float width, float invaginationLength) {
		GeneralPath arrow = createUnitHat(invaginationLength/length, width);
		
		AffineTransform transform = AffineTransform.getTranslateInstance(-destination.getX()-1, -destination.getY());
		transform.concatenate(AffineTransform.getRotateInstance(theta));
		transform.concatenate(AffineTransform.getTranslateInstance(destination.getX(), destination.getY()));
		arrow.transform(transform);
		return arrow;
	}
	
	private static <T> double[] findIdealAnglesOffset(SortedSet<AnglePoint<T>> destinations) {
		
		double minDeltaSum = -1.0;
		int iMinDeltaSum = -1;
		int nDestinations = destinations.size();
		AnglePoint[] destinationsArray = destinations.toArray(new AnglePoint[0]);
		
		final double twoPiByN = 2.0 * Math.PI / (double)nDestinations;
		
		for (int iCandidateDestinations = nDestinations; iCandidateDestinations--!=0;) {
			double idealAnglesOffset = destinationsArray[iCandidateDestinations].angleFromSource;
			
			double deltaSum = 0.0;
			int iDestination = 0;
			for (AnglePoint<T> ap : destinations) {

				final double angleOffsetFromStartAngle = twoPiByN * (double)(iDestination-iCandidateDestinations);
				
				double idealAngleFromSource = idealAnglesOffset + angleOffsetFromStartAngle;//twoPiByN * (double)iDestination;
				final double deltaAngleFromSource = idealAngleFromSource - ap.angleFromSource;
				deltaSum += Math.abs(deltaAngleFromSource);
				iDestination ++;
			}
			if (minDeltaSum < 0.0 || deltaSum < minDeltaSum) {
				minDeltaSum = deltaSum;
				iMinDeltaSum = iCandidateDestinations;
			}
		}
		return new double[] {destinationsArray[iMinDeltaSum].angleFromSource, iMinDeltaSum};
	}
	
	public static <T extends Boundable> Shape createArrowsFromSingleSource(Boundable source, Collection<T> destinations) {
		int nDestinations = destinations.size();
		if (nDestinations == 0) return null;
		if (source == null) {
			source = destinations.iterator().next();
		}
		nDestinations -= (destinations.contains(source) ? 1 : 0);
		if (nDestinations == 0) return null;//new ArrayList<Shape>(0);
		
		//final Rectangle2D sourceBox = source.getBoundingBox();
		final Point2D sourcePoint = source.getInterestPoint();
		final double cSrcX = sourcePoint.getX(), cSrcY = sourcePoint.getY();
		
		//double idealAnglesOffset = 0.0;
		final double twoPiByN = 2.0 * Math.PI / (double)nDestinations;
		
		final GeneralPath path =new GeneralPath();
		
		SortedSet<AnglePoint<T>> sortedDestinations = new TreeSet<AnglePoint<T>>();
		
		double minAngle = 0.0, maxAngle = 0.0;
		int iDestination = 0;
		for (T destination : destinations) {
			if (source != destination) {
				//final Rectangle2D destinationBox = destinations.get(iDestination).getBoundingBox();
				final Point2D destinationPoint = destination.getInterestPoint();
				final double cDestX = destinationPoint.getX(), cDestY = destinationPoint.getY(); 
				//centers[iDestination] = new Point2D.Double(cDestX,cDestY);
				
				final double dX = cDestX - cSrcX, dY = cDestY - cSrcY;
				double angleFromSource = Math.atan2(dY,dX);
				if (angleFromSource < 0) angleFromSource += twoPI;
				
				AnglePoint<T> anglePoint = new AnglePoint<T>();
				anglePoint.angleFromSource = angleFromSource;
				anglePoint.cDestX = cDestX;
				anglePoint.cDestY = cDestY;
				anglePoint.dX = dX;
				anglePoint.dY = dY;
				anglePoint.destination = destination;
				
				sortedDestinations.add(anglePoint);
				
				iDestination++;
			}
		}
		double[] idealAnglesOffsetAndIdealDestination = findIdealAnglesOffset(sortedDestinations);
		double idealAnglesOffset = idealAnglesOffsetAndIdealDestination[0];
		int iIdealDestination = (int)idealAnglesOffsetAndIdealDestination[1];
		iDestination = 0;
		for (AnglePoint<T> ap : sortedDestinations) {
			//if (iDestination == 0) {
		//		idealAnglesOffset = ap.angleFromSource;
			//}
			
			final double angleOffsetFromStartAngle = twoPiByN * (double)iDestination;
			
			final double idealAngleFromSource = idealAnglesOffset + twoPiByN * (double)(iDestination-iIdealDestination);
			final double deltaAngleFromSource = idealAngleFromSource - ap.angleFromSource;
			final double finalAngleFromSource = ap.angleFromSource + distorsionFactor * deltaAngleFromSource;
			
			final double angleFromDestination = Math.atan2(-ap.dY,-ap.dX) + twoPI; // TODO compute from angleFromSource to speed up
			//final double idealAngleFromDestination = angleFromDestination; /// TODO see if it is ok graphically...
			final double deltaAngleFromDestination = -deltaAngleFromSource * reverseDeltaAttenuation;//idealAngleFromDestination - angleFromDestination;
			final double finalAngleFromDestination = angleFromDestination + distorsionFactor * deltaAngleFromDestination;
			
			double distance = Math.sqrt(ap.dX * ap.dX + ap.dY * ap.dY);
			double b1X = cSrcX + distance * relativeDistanceOfBezierControlPoints * Math.cos(finalAngleFromSource);
			double b1Y = cSrcY + distance * relativeDistanceOfBezierControlPoints * Math.sin(finalAngleFromSource);
			
			double b2X = ap.cDestX + distance * relativeDistanceOfBezierControlPoints * Math.cos(finalAngleFromDestination);
			double b2Y = ap.cDestY + distance * relativeDistanceOfBezierControlPoints * Math.sin(finalAngleFromDestination);
			
			path.moveTo((float)cSrcX, (float)cSrcY);
			path.curveTo((float)b1X, (float)b1Y, (float)b2X, (float)b2Y, (float)ap.cDestX, (float)ap.cDestY);
			
			iDestination++;
		}
		
		return path;
	}
	
	public static <T extends Boundable> Shape createArrowsToSingleDestination(Boundable source, Collection<T> destinations, double arrowHatLength) {
		int nDestinations = destinations.size();
		if (nDestinations == 0) return null;
		if (source == null) {
			source = destinations.iterator().next();
		}
		nDestinations -= (destinations.contains(source) ? 1 : 0);
		if (nDestinations == 0) return null;//new ArrayList<Shape>(0);
		
		//final Rectangle2D sourceBox = source.getBoundingBox();
		final Point2D sourcePoint = source.getInterestPoint();
		double cSrcX = sourcePoint.getX(), cSrcY = sourcePoint.getY();
		
		//double idealAnglesOffset = 0.0;
		final double twoPiByN = 2.0 * Math.PI / (double)nDestinations;
		
		final GeneralPath path =new GeneralPath();
		
		SortedSet<AnglePoint<T>> sortedDestinations = new TreeSet<AnglePoint<T>>();
		
		//double minAngle = 0.0, maxAngle = 0.0;
		int iDestination = 0;
		for (T destination : destinations) {
			if (source != destination) {
				//final Rectangle2D destinationBox = destinations.get(iDestination).getBoundingBox();
				final Point2D destinationPoint = destination.getInterestPoint();
				final double cDestX = destinationPoint.getX(), cDestY = destinationPoint.getY(); 
				//centers[iDestination] = new Point2D.Double(cDestX,cDestY);
				
				final double dX = cDestX - cSrcX, dY = cDestY - cSrcY;
				double angleFromSource = Math.atan2(dY,dX);
				if (angleFromSource < 0) angleFromSource += twoPI;
				
				AnglePoint<T> anglePoint = new AnglePoint<T>();
				anglePoint.angleFromSource = angleFromSource;
				anglePoint.cDestX = cDestX;
				anglePoint.cDestY = cDestY;
				anglePoint.dX = dX;
				anglePoint.dY = dY;
				anglePoint.destination = destination;
				
				sortedDestinations.add(anglePoint);
				
				iDestination++;
			}
		}
		double[] idealAnglesOffsetAndIdealDestination = findIdealAnglesOffset(sortedDestinations);
		double idealAnglesOffset = idealAnglesOffsetAndIdealDestination[0];
		int iIdealDestination = (int)idealAnglesOffsetAndIdealDestination[1];
		iDestination = 0;
		for (AnglePoint<T> ap : sortedDestinations) {
			//if (iDestination == 0) {
		//		idealAnglesOffset = ap.angleFromSource;
			//}
			
			//final double angleOffsetFromStartAngle = twoPiByN * (double)iDestination;
			
			final double idealAngleFromSource = idealAnglesOffset + twoPiByN * (double)(iDestination-iIdealDestination);
			final double deltaAngleFromSource = idealAngleFromSource - ap.angleFromSource;
			final double finalAngleFromSource = ap.angleFromSource + distorsionFactor * deltaAngleFromSource;
			
			final double angleFromDestination = Math.atan2(-ap.dY,-ap.dX) + twoPI; // TODO compute from angleFromSource to speed up
			//final double idealAngleFromDestination = angleFromDestination; /// TODO see if it is ok graphically...
			final double deltaAngleFromDestination = -deltaAngleFromSource * reverseDeltaAttenuation;//idealAngleFromDestination - angleFromDestination;
			final double finalAngleFromDestination = angleFromDestination + distorsionFactor * deltaAngleFromDestination;
			
			double sourceDirectionX = Math.cos(finalAngleFromSource), sourceDirectionY = Math.sin(finalAngleFromSource);
			double destinationDirectionX = Math.cos(finalAngleFromDestination), destinationDirectionY = Math.sin(finalAngleFromDestination);
			if (arrowHatLength > 0) {
				double distFromSource = 0;//getDistanceOfClosestOutsidePoint(source, finalAngleFromSource, arrowHatLength/3);
				double arrX = cSrcX + distFromSource * sourceDirectionX, arrY = cSrcY + distFromSource * sourceDirectionY;
				// Draw an arrow
				//GeneralPath arrow = createArrowHat(new Point2D.Double(arrX, arrY), finalAngleFromSource, (float)arrowHatLength, (float)arrowHatLength/3,(float)arrowHatLength/4);
				//path.append(arrow, false);
				
				cSrcX += arrowHatLength * sourceDirectionX;
				cSrcY += arrowHatLength * sourceDirectionY;
			}
			double distance = Math.sqrt(ap.dX * ap.dX + ap.dY * ap.dY);
			double b1X = cSrcX + distance * relativeDistanceOfBezierControlPoints * sourceDirectionX;
			double b1Y = cSrcY + distance * relativeDistanceOfBezierControlPoints * sourceDirectionY;
			
			double distFromDestination = 0;//getDistanceOfClosestOutsidePoint(ap.destination, finalAngleFromDestination, arrowHatLength/3);
			
			double b2X = ap.cDestX + distFromDestination * destinationDirectionX + distance * relativeDistanceOfBezierControlPoints * destinationDirectionX;
			double b2Y = ap.cDestY + distFromDestination * destinationDirectionY + distance * relativeDistanceOfBezierControlPoints * destinationDirectionY;
			
			path.moveTo((float)cSrcX, (float)cSrcY);
			path.curveTo((float)b1X, (float)b1Y, (float)b2X, (float)b2Y, (float)ap.cDestX, (float)ap.cDestY);

			iDestination++;
		}
		
		return path;
	}
	final static double getDistanceOfClosestOutsidePoint(Boundable boundable, double angleFromInterestPoint, double tolerance) {
		//Point2D interestPoint = boundable.getInterestPoint();
		//double iX = interestPoint.getX(), iY = interestPoint.getY();
		//double dX = Math.cos(angleFromInterestPoint), dY = Math.sin(angleFromInterestPoint);
		
		Rectangle2D bb = boundable.getBoundingBox();
		double distance = Math.sqrt(bb.getWidth()*bb.getWidth() + bb.getHeight()*bb.getHeight())/4;
		/*
		double minDistance = 0;
		
		double x = 0, y = 0;
		do {
			double newDistance = (distance - minDistance)/2;
			x = iX + newDistance * dX; 
			y = iY + newDistance * dY;
			
			if (boundable.contains(x, y)) {
				minDistance = newDistance;
			} else {
				distance = newDistance;
			}
		} while ((distance - minDistance) > tolerance);*/
		return distance;
		
	}
}
