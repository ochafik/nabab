package com.ochafik.util;

import gnu.trove.TLongHashSet;
import gnu.trove.TLongIterator;

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
public class IntPairSet {
	private final boolean ordered;
	private final TLongHashSet longsSet; // 19 bytes per element if preallocated, 29 if not preallocated
	
	public interface IntPairOutput {
		public void output(int x, int y);
	};

	public IntPairSet(boolean ordered) {
		this.ordered = ordered;
		longsSet = new TLongHashSet();
	}
	
	public IntPairSet(boolean ordered, int initialCapacity) {
		this.ordered = ordered;
		longsSet = new TLongHashSet(initialCapacity);
	}
	
	public void ensureCapacity(int capacity) {
		longsSet.ensureCapacity(capacity);
	}
	
	public void export(IntPairOutput out) {
		for (TLongIterator it = longsSet.iterator(); it.hasNext();) {
			long id = it.next();
			out.output(getX(id), getY(id));
		}
	}
	
	protected static final int getX(long id) {
		return (int)(id >>> 32);
	}

	protected static final int getY(long id) {
		return (int) (id & 0x00000000ffffffffL);
	}

	/**
	 * Ordering of [0, infinite] x [0, infinite] grid
	 */
	protected final long getId(int x, int y) {
		if (!ordered && x > y) {
			int t = y;
			y = x;
			x = t;
		}
		return (((long)x) << 32) | (long)y;
		/*
		// z = x + y
		// offset = z * (z + 1) / 2 + x
		long a = x + y;
		a *= (a + 1);
		a >>= 1; 
		return a + x;*/
	}
	
	public boolean add(int x, int y) {
		return longsSet.add(getId(x, y));
	}
	
	public boolean contains(int x, int y) {
		return longsSet.contains(getId(x, y));
	}
	
	public boolean remove(int x, int y) {
		return longsSet.remove(getId(x, y));
	}
	
	public int size() {
		return longsSet.size();
	}
	
	public String toString() {
		return longsSet.toString();
	}

	public boolean isOrdered() {
		return this.ordered;
	}
	
	/*
	public static void main(String[] args) {
		Random random = new Random(10);
		Runtime runtime = Runtime.getRuntime();
		
		int nEdges = 1000000;
		int[] vertices = new int[nEdges * 2];
		for (int i = nEdges; i-- != 0;) {
			int x = i << 1, y = x | 1;
			vertices[x] = random.nextInt();
			vertices[y] = random.nextInt();
		}

		IntPairSet edges = null;
		
		gc();
		
		long baseMem = runtime.totalMemory() - runtime.freeMemory();
		
		if (true) {		
			long initMem = runtime.totalMemory() - runtime.freeMemory();
			long initTime = System.currentTimeMillis();
			
			edges = new IntPairSet(false, nEdges);
			
			gc();
			
			long endMem = runtime.totalMemory() - runtime.freeMemory();
			long endTime = System.currentTimeMillis();
			
			System.out.println("INIT :");
			System.out.println("  Delta mem  = " + (endMem - initMem));
			System.out.println("  Delta time = " + (endTime - initTime));
			System.out.println();
		}
		
		gc();
		
		if (true) {		
			long initMem = runtime.totalMemory() - runtime.freeMemory();
			long initTime = System.currentTimeMillis();
			
			for (int i = nEdges; i-- != 0;) {
				int x = i << 1, y = x | 1;
				edges.add(vertices[x], vertices[y]);
			}
			
			gc();
			
			long endMem = runtime.totalMemory() - runtime.freeMemory();
			long endTime = System.currentTimeMillis();
			
			System.out.println("ADD :");
			System.out.println("  Delta mem  = " + (endMem - baseMem));
			System.out.println("  Delta time = " + (endTime - initTime));
			System.out.println("Element mem  = " + (endMem - baseMem) / nEdges);
			System.out.println();
		}
		
		gc();
		
		if (true) {		
			long initMem = runtime.totalMemory() - runtime.freeMemory();
			long initTime = System.currentTimeMillis();
			
			for (int i = nEdges; i-- != 0;) {
				int x = i << 1, y = x | 1;
				edges.contains(vertices[x], vertices[y]);
			}
			
			gc();
			
			long endMem = runtime.totalMemory() - runtime.freeMemory();
			long endTime = System.currentTimeMillis();
			
			System.out.println("CONTAINS :");
			System.out.println("  Delta mem  = " + (endMem - initMem));
			System.out.println("  Delta time = " + (endTime - initTime));
			System.out.println();
		}
		
		System.out.println("EDGES : "+edges.size());
		System.out.println(vertices[(int)(random.nextFloat() * (vertices.length - 1))]);
	}
	static void gc() {
		Runtime runtime = Runtime.getRuntime();
		
		runtime.gc();
		runtime.runFinalization();
		runtime.gc();
	}*/
}
