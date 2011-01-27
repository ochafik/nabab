/*
 * Copyright (C) 2011 by Olivier Chafik (http://ochafik.com)
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

package com.ochafik.util;


import java.util.Iterator;

import gnu.trove.TIntArrayList;

public class IntArrayUtils {
	//public static final IntArray EMPTY_ARRAY = wrap(new int[0]);
	public static final SortedIntArray EMPTY_ARRAY = new SortedIntArray() {
		public int get(int pos) {
			throw new ArrayIndexOutOfBoundsException();
		}
		public int[] getBackingArray() {return null;}
		public int size() {return 0;}
		public int[] toArray() {return new int[0];}
		public String toString() {
			return IntArrayUtils.toString(this);
		}
		public Iterator<Integer> iterator() {
			return IntArrayUtils.iterator(this);
		}
	};
	
	private static class WrappedPrimitiveIntArray implements WritableIntArray {
		private final int[] array;
		public WrappedPrimitiveIntArray(int[] array) {
			this.array = array;
		}
		public void set(int pos, int value) {
			array[pos] = value;
		}
		
		public final int get(int pos) {
			return array[pos];
		}
		public final int size() {
			return array.length;
		}
		public final int[] toArray() {
			return array;
		}
		public int[] getBackingArray() {
			return array;
		}
		public String toString() {
			return IntArrayUtils.toString(this);
		}
		public Iterator<Integer> iterator() {
			return IntArrayUtils.iterator(this);
		}
	}
	
	public static final String toString(IntArray array) {
		StringBuffer b = new StringBuffer("{");
		for (int i = 0, len = array.size(); i < len; i++) {
			if (i != 0) b.append(", ");
			b.append(array.get(i));
		}
		b.append("}");
		return b.toString();
	}
	private static final class SingletonIntArray implements SortedIntArray {
		int value;
		public SingletonIntArray(int value) {
			this.value = value;
		}
		public int get(int pos) {
			if (pos != 0) throw new ArrayIndexOutOfBoundsException(pos);
			return value;
		}
		public int size() {
			return 1;
		}
		public int[] toArray() {
			return new int[]{value};
		}
		public void set(int pos, int value) {
			if (pos != 0) throw new ArrayIndexOutOfBoundsException(pos);
			this.value = value;
		}
		public int[] getBackingArray() {
			return null;
		}
		public String toString() {
			return "{"+value+"}";
		}
		public Iterator<Integer> iterator() {
			return IntArrayUtils.iterator(this);
		}
	}
	private static class WrappedTIntArrayList implements IntArray {
		final TIntArrayList array;
		public WrappedTIntArrayList(TIntArrayList array) {
			this.array = array;
		}
		public void set(int pos, int value) {
			array.set(pos, value);
		}
		
		public final int get(int pos) {
			return array.get(pos);
		}
		public final int size() {
			return array.size();
		}
		public final int[] toArray() {
			return array.toNativeArray();
		}
		public final int[] getBackingArray() {
			return null;
		}
		
		public String toString() {
			return IntArrayUtils.toString(this);
		}
		public Iterator<Integer> iterator() {
			return IntArrayUtils.iterator(this);
		}
	}
	
	public static WritableIntArray wrap(int[] array) {
		return new WrappedPrimitiveIntArray(array);
	}
	public static IntArray wrap(int v) {
		return new SingletonIntArray(v);
	}
	
	
	public static IntArray wrap(TIntArrayList keys) {
		return new WrappedTIntArrayList(keys);
	}
	public static SortedIntArray wrapSorted(TIntArrayList keys) {
		class WrappedSortedTIntArrayList extends WrappedTIntArrayList implements SortedIntArray {
			public WrappedSortedTIntArrayList(TIntArrayList keys) { super(keys); }
		};
		return new WrappedSortedTIntArrayList(keys);
	}
	public static IntArray copy(IntArray a) {
		int[] r = new int[a.size()];
		for (int i = a.size(); i-- != 0;) {
			r[i] = a.get(i);
		}
		return wrap(r);
	}
	public static SortedIntArray wrapSorted(int[] is) {
		class WrappedSortedPrimitiveIntArray extends WrappedPrimitiveIntArray implements SortedIntArray {
			public WrappedSortedPrimitiveIntArray(int[] is) { super(is); }
		};
		return new WrappedSortedPrimitiveIntArray(is);
	}
	
	static class WrappedPrimitiveWithOffset implements IntArray {
		final int[] res;
		final int offset, length;
		public WrappedPrimitiveWithOffset(int[] res, int offset, int length) {
			this.res = res;
			this.offset = offset;
			this.length = length;
		}
		public int get(int pos) {
			if (pos >= length) throw new ArrayIndexOutOfBoundsException(pos);
			pos += offset;
			return res[pos];
		}
		public int[] getBackingArray() {
			return (offset == 0 && res.length == length) ? res : null;
		}
		public int size() {
			return length;
		}
		public int[] toArray() {
			int r[] = new int[length];
			for (int i = length; i-- != 0;) r[i] = get(i);
			return r;
		}
		public String toString() {
			return IntArrayUtils.toString(this);
		}
		public Iterator<Integer> iterator() {
			return IntArrayUtils.iterator(this);
		}
	}
	public static IntArray wrap(int[] res, int offset, int length) {
		return new WrappedPrimitiveWithOffset(res, offset, length);
	}
	public static SortedIntArray wrapSorted(int[] res, int offset, int length) {
		class SortedWrappedPrimitiveWithOffset extends WrappedPrimitiveWithOffset implements SortedIntArray {
			public SortedWrappedPrimitiveWithOffset(int[] res, int offset, int length) {
				super(res, offset, length);
			}
		}
		return new SortedWrappedPrimitiveWithOffset(res, offset, length);
	}
	
	public static int[] toArray(IntArray a) {
        int[] aa = new int[a.size()];
        for (int i = aa.length; i-- != 0;) {
            aa[i] = a.get(i);
        }
        return aa;
    }
	
	private static int compare(int[] a1, int[] a2, int len) {
		for (int i = len; i-- != 0;) {
			int d = a1[i] - a2[i];
			if (d != 0) return d < 0 ? -1 : 1;
		}
		return 0;
	}
		
	public static final int compare(SortedIntArray ia1, IntArray ia2) {
		int len = ia1.size();
		if (len != ia2.size()) return len < ia2.size() ? -1 : 1;
		
		int[] a1 = ia1.getBackingArray(), a2 = ia2.getBackingArray();
		if (a1 != null && a2 != null) {
			for (int i = len; i-- != 0;) {
				int d = a1[i] - a2[i];
				if (d != 0) return d < 0 ? -1 : 1;
			}
			return 0;
			//return compare(a1, a2, len);
		}
		
		for (int i = len; i-- != 0;) {
			int v1 = ia1.get(i), v2 = ia2.get(i);
			if (v1 != v2) 
				return v1 < v2 ? -1 : 1;
			//int d = ia1.get(i) - ia2.get(i);
			//if (d != 0) return d < 0 ? -1 : 1;
		}
		return 0;
	}
	public static Iterator<Integer> iterator(final IntArray array) {
		return new Iterator<Integer>() {
			int nextIndex = 0;
			public boolean hasNext() {
				return nextIndex < array.size();
			}

			public Integer next() {
				return array.get(nextIndex++);
			}

			public void remove() {
				throw new UnsupportedOperationException();
			}
			
		};
	}
	
}
