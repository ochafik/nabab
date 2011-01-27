package com.ochafik.util;

import com.ochafik.util.IntPairSet.IntPairOutput;

public interface IntPairObjectMap<V> {

	public interface IntPairObjectOutput<V> {
		public void output(int x, int y, V value);
	}

	public abstract void ensureCapacity(int capacity);

	public abstract void export(IntPairObjectOutput<V> out);

	public abstract void export(IntPairOutput out);

	/**
	 * @return old value assigned to (x, y), or null if none was defined
	 */
	public abstract V set(int x, int y, V v);

	public abstract boolean contains(int x, int y);

	public abstract V get(int x, int y);

	public abstract V remove(int x, int y);

	public abstract int size();

	public abstract boolean isOrdered();

}