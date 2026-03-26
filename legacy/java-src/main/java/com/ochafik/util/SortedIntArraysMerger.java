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

package com.ochafik.util;

public final class SortedIntArraysMerger {
	private final IntArray[] arrays;
	private final Source[] validSources;
	private int nValidSources;
	private int next;
	private boolean hasNext;
	
	private final static class Source {
		private final IntArray array;
		private int offset = 0;
		int nextValue;
		
		public Source(IntArray array) {
			this.array = array;
			nextValue = array.get(0);
		}
		/**
		 * @return true if there remains a value
		 */
		public boolean consumeNextValue() {
			offset++;
			if (offset < array.size()) {
				nextValue = array.get(offset);
				return true;
			}
			return false;
		}
	}
	
	public boolean hasNext() {
		return hasNext;
	}
	
	public int next() {
		assert hasNext;
		
		int oldNext = next;
		boolean hasNext = false;
		int next = 0;
		
		int nValidSources = this.nValidSources;
		Source[] validSources = this.validSources;
		
		for (int iSource = nValidSources; iSource-- != 0;) {
			final Source source = validSources[iSource];
			int val = source.nextValue;
			if (val == oldNext) {
				// consume old next value in this source
				if (++source.offset < source.array.size()) {
					val = source.nextValue = source.array.get(source.offset);
				} else {
					// exhausted this source
					nValidSources--;
					if (iSource < nValidSources) {
						validSources[iSource] = validSources[nValidSources];
					}
					continue;
				}
				//val = source.nextValue;
			}
			if (!hasNext || val < next) {
				next = val;
				hasNext = true;
			}
		}
		this.nValidSources = nValidSources;
		this.next = next;
		this.hasNext = hasNext;
		return oldNext;
	}
	
	public SortedIntArraysMerger(IntArray[] arrays) {
		this.arrays = arrays;
		validSources = new Source[arrays.length];
		//init();
		for (int iArray = 0, len = arrays.length; iArray < len; iArray++) {
			IntArray array = arrays[iArray];
			if (array.size() > 0) {
				int val = array.get(0);
				if (!hasNext || val < next) {
					next = val;
					hasNext = true;
				}
				validSources[nValidSources++] = new Source(array);
			}
		}
	}
	public void init() {
		for (int iArray = 0, len = arrays.length; iArray < len; iArray++) {
			IntArray array = arrays[iArray];
			if (array.size() > 0) {
				int val = array.get(0);
				if (!hasNext || val < next) {
					next = val;
					hasNext = true;
				}
				validSources[nValidSources++] = new Source(array);
			}
		}
	}
	
	public void reset() {
		hasNext = false;
		nValidSources = 0;
		init();
	}
	public int size() {
		reset();
		
		int size = 0;
		while (hasNext()) {
			next();
			size++;
		}
		return size;
	}
	public SortedIntArray toIntArray() {
		int maxLength = 0;
		for (IntArray a : arrays) maxLength += a.size();
		final int[] res = new int[maxLength];
		
		reset();
		int size = 0;
		while (hasNext()) {
			res[size++] = next();
		}
		return IntArrayUtils.wrapSorted(res);
	}
	public int[] toArray() {
		reset();
		
		int maxLength = 0;
		for (int iArray = arrays.length; iArray-- != 0;) {
			maxLength += arrays[iArray].size();
		}
		int[] res = new int[maxLength];
		int length = 0;
		
		while (hasNext()) {
			res[length++] = next();
		}
		if (length == res.length) return res;
		
		int[] ret = new int[length];
		System.arraycopy(res, 0, ret, 0, length);
		return ret;
	}
	public static void main(String[] args) {
		IntArray[] arrays = new IntArray[] {
				IntArrayUtils.wrap(new int[] { 0, 1, 3, 5, 9, 10 }),
				IntArrayUtils.wrap(new int[] { 0, 2, 3, 6, 9, 11 }),
				IntArrayUtils.wrap(new int[] { -4, 2, 4, 6, 10, 14 })
		};
		
		System.out.println(merge(arrays));
		SortedIntArraysMerger union = new SortedIntArraysMerger(arrays);
		try {
			for (;union.hasNext();) {
				System.out.print(union.next()+", ");
			}
		} finally {
			System.out.println();
		}
	}
	
	/**
	 * 
	 * @param arrays will be modified (but its IntArray instances will not)
	 * @return
	 */
	public static SortedIntArray merge(IntArray[] _arrays) {
		IntArray[] arrays = new IntArray[_arrays.length];
		System.arraycopy(_arrays, 0, arrays, 0, arrays.length);
		
		int maxSize = 0;
		
		for (int iArray = 0, len = arrays.length; iArray < len; iArray++) {
			maxSize += arrays[iArray].size();
		}
		
		int res[] = new int[maxSize];
		int size = 0;
		
		int nRemainingSources = arrays.length;
		int offsets[] = new int[arrays.length];
		
		int oldNext = 0;
		int next = 0;
		boolean hasHadNext = false;
		while (nRemainingSources > 0) {
			boolean hasNext = false;
			
			for (int iSource = nRemainingSources; iSource-- != 0;) {
				IntArray array = arrays[iSource];
				int arrayLen = array.size();
				if (arrayLen == 0) {
					nRemainingSources--;
					if (iSource < nRemainingSources) {
						arrays[iSource] = arrays[nRemainingSources];
						offsets[iSource] = offsets[nRemainingSources];
					}
					continue;
				}
				
				int offset = offsets[iSource];
				int val = array.get(offset);
				if (hasHadNext && val == oldNext) {
					// consume old next value in this source
					offsets[iSource] = ++offset;
					if (offset == arrayLen) {
						// exhausted this source
						nRemainingSources--;
						if (iSource < nRemainingSources) {
							arrays[iSource] = arrays[nRemainingSources];
							offsets[iSource] = offsets[nRemainingSources];
						}
						continue;
					}
					val = array.get(offset);
				}
				if (!hasNext || val < next) {
					next = val;
					hasNext = true;
				}
			}
			assert hasNext == (nRemainingSources > 0);
			
			if (hasNext) {
				hasHadNext = hasNext;
				res[size++] = next;
			}
			oldNext = next; 
		}
		return IntArrayUtils.wrapSorted(res, 0, size);
	}
}
