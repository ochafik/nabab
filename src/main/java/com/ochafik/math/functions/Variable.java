package com.ochafik.math.functions;

import java.awt.geom.Point2D;
import java.beans.PropertyChangeListener;
import java.util.List;
import java.util.Set;

/**
 * Discreete variable with a finite amount of states.
 * @author ochafik
 */
public interface Variable extends Comparable<Variable> {
	//List<Value> getValues();
	public String getName();
	
	public Object getProperty(String key);
	public Set<String> getPropertyNames();
	//public Map<String, Object> getProperties
	public void setProperty(String key, Object value);
	public void addAttributeChangeListener(String name, PropertyChangeListener listener);
	public void removePropertyChangeListener(String name, PropertyChangeListener listener);
	
	//public int getValueCount();
	public List<Object> getValues();
	//public Object getValue(int iValue);
	public int getId();
}
