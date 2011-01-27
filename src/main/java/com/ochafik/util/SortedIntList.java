package com.ochafik.util;

import java.util.Iterator;


public class SortedIntList implements SortedIntArray {
	public interface IntVisitor {
		public boolean visit(int i);
	}
	
	private final IntVector list;
	
	public SortedIntList() {
		list = new IntVector();
	}
	public SortedIntList(int capacity) {
		list = new IntVector(capacity);
	}
	
	public int[] getBackingArray() {
		return list.getBackingArray();
	}
	
	public SortedIntList clone() {
		int size = size();
		SortedIntList clone = new SortedIntList(size);
		for (int i = 0; i < size; i++) {
			clone.list.add(list.get(i));
		}
		return clone;
	}
	public void set(int pos, int value) {
		throw new UnsupportedOperationException();
	}
	public int add(int value) {
		int i = BinarySearchUtils.binarySearch(list.getBackingArray(), value, 0, size());
		if (i >= 0) {
			list.set(i,value);
		} else {
			list.insert(i = ((-i) - 1), value);
		}
		return i;
	}
	
	public int[] toArray() {
		return list.toArray();
	}
	public int get(int index) {
		return list.get(index);
	}
	
	public boolean removeValue(int value) {
		int i = BinarySearchUtils.binarySearch(list.getBackingArray(), value, 0, size());
		if (i >= 0) {
			list.remove(i);
			return true;
		} else {
			return false;
		}
	}
	
	public boolean contains(int value) {
		return BinarySearchUtils.binarySearch(list.getBackingArray(), value, 0, size()) >= 0;
	}
	
	public int indexOf(int value) {
		return BinarySearchUtils.binarySearch(list.getBackingArray(), value, 0, size());
	}
	
	public boolean isEmpty() {
		return list.isEmpty();
	}
	
	public void clear() {
		list.clear();
	}
	
	public int size() {
		return list.size();
	}
	
	public boolean visit(final IntVisitor visitor) {
		for (int i = 0, len = list.size(); i < len; i++) {
			if (!visitor.visit(list.get(i))) return false;
		}
		return true;
	}
	

	public String toString() {
		StringBuffer b = new StringBuffer("{");
		for (int i = 0, len = size(); i < len; i++) {
			if (i != 0) b.append(", ");
			b.append(get(i));
		}
		b.append("}");
		return b.toString();
	}
	public void ensureCapacity(int finalSize) {
		list.ensureCapacity(finalSize);
	}
	public void addAll(IntArray values) {
		for (int i = 0, len = values.size(); i < len; i++) add(values.get(i));
	}
	public void addAll(int[] values) {
		for (int i = 0, len = values.length; i < len; i++) add(values[i]);
	}
	public Iterator<Integer> iterator() {
		return IntArrayUtils.iterator(this);
	}
	
}
