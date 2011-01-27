package com.ochafik.util;

public class DynamicArray<T> {
	private T[] array;
	
	public DynamicArray(int size) {
		array = (T[]) new Object[size];
	}
	
	
	public void enlarge(int minSize) {
		if (minSize <= array.length) return;
		setSize(minSize);
	}
	public void setSize(int size) {
		if (size == array.length) return;
		
		T[] newArray = (T[])new Object[size];
		int oldSize = array.length;
		System.arraycopy(array, 0, newArray, 0, oldSize < size ? oldSize : size);
		array = newArray;
	}
	
	public int getSize() {
		return array.length;
	}
	
	public void set(int pos, T value) {
		array[pos] = value;
	}
	
	public T get(int pos) {
		return array[pos];
	}
}
