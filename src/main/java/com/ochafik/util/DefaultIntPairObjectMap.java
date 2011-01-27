package com.ochafik.util;

import com.ochafik.util.IntPairSet.IntPairOutput;

import gnu.trove.TLongHashSet;
import gnu.trove.TLongIterator;
import gnu.trove.TLongObjectHashMap;
import gnu.trove.TLongObjectIterator;

/**
 * Set of edges (can be either oriented or non oriented).
 *
 * BitSet is not useable, as it would grow to crazy sizes.
 * The set of edges is sparse and indices of vertices may be as big as wished by the user (up to Integer.MAX_VALUE - 1).
 *
 * Benefit of GNU Trove's TLongHashSet over HashSet is :
 * - if initialCapacity is set, takes less than half the memory and is 5.7 times faster (add) and 3 times faster (contains)
 * - if initialCapacity is not set, takes -40% memory and is 4 to 6 times faster (add) and 3.7 to 8 times faster (contains)
 */
public class DefaultIntPairObjectMap<V> implements IntPairObjectMap<V> {
	private final boolean ordered;
	private final TLongObjectHashMap<V> map; // 19 bytes per element if preallocated, 29 if not preallocated
	
	public DefaultIntPairObjectMap(boolean ordered) {
		this.ordered = ordered;
		map = new TLongObjectHashMap<V>();
	}
	
	public DefaultIntPairObjectMap(boolean ordered, int initialCapacity) {
		this.ordered = ordered;
		map = new TLongObjectHashMap<V>(initialCapacity);
	}
	
	/* (non-Javadoc)
	 * @see ochafik.util.IntPairObjectMapInterface#ensureCapacity(int)
	 */
	public void ensureCapacity(int capacity) {
		map.ensureCapacity(capacity);
	}
	
	/* (non-Javadoc)
	 * @see ochafik.util.IntPairObjectMapInterface#export(ochafik.util.IntPairObjectMap.IntPairObjectOutput)
	 */
	public void export(IntPairObjectOutput<V> out) {
		for (TLongObjectIterator<V> it = map.iterator(); it.hasNext();) {
			it.advance();
			long id = it.key();
			V v = it.value();
			out.output(getX(id), getY(id), v);
		}
	}

	/* (non-Javadoc)
	 * @see ochafik.util.IntPairObjectMapInterface#export(ochafik.util.IntPairSet.IntPairOutput)
	 */
	public void export(IntPairOutput out) {
		for (TLongObjectIterator<V> it = map.iterator(); it.hasNext();) {
			it.advance();
			long id = it.key();
			out.output(getX(id), getY(id));
		}
	}

	
	protected static final int getX(long id) {
		return (int)(id >> 32);
	}

	protected static final int getY(long id) {
		return (int) (id & 0x00000000ffffffffL);
	}

	protected final long getId(int x, int y) {
		if (!ordered && x > y) {
			int t = y;
			y = x;
			x = t;
		}
		return (((long)x) << 32) | (long)y;
	}
	
	/* (non-Javadoc)
	 * @see ochafik.util.IntPairObjectMapInterface#set(int, int, V)
	 */
	public V set(int x, int y, V v) {
		return map.put(getId(x, y), v);
	}
	
	/* (non-Javadoc)
	 * @see ochafik.util.IntPairObjectMapInterface#contains(int, int)
	 */
	public boolean contains(int x, int y) {
		return map.contains(getId(x, y));
	}
	
	/* (non-Javadoc)
	 * @see ochafik.util.IntPairObjectMapInterface#get(int, int)
	 */
	public V get(int x, int y) {
		return map.get(getId(x, y));
	}
	
	/* (non-Javadoc)
	 * @see ochafik.util.IntPairObjectMapInterface#remove(int, int)
	 */
	public V remove(int x, int y) {
		return map.remove(getId(x, y));
	}
	
	/* (non-Javadoc)
	 * @see ochafik.util.IntPairObjectMapInterface#size()
	 */
	public int size() {
		return map.size();
	}
	
	public String toString() {
		return map.toString();
	}

	/* (non-Javadoc)
	 * @see ochafik.util.IntPairObjectMapInterface#isOrdered()
	 */
	public boolean isOrdered() {
		return this.ordered;
	}
}

