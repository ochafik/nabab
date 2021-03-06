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

import java.util.Iterator;

public class IntVector implements IntArray {
	private int[] array;
	private int nextPosition;
	
	public IntVector() {
		// it would be silly to create a zero-sized array by default, wouldn't it ?
		this(1);
	}
	public IntVector(int initialCapacity) {
		array = new int[initialCapacity];
	}
	
	public void add(int v) {
		pushBack(v);
	}
	
	public int back() {
		return array[nextPosition - 1];
	}
	
	public void ensureCapacity(int minCapacity) {
		if (array.length >= minCapacity) return;
		
		// Use same growth policy as C++ STL's default vector implementation
		setArraySize(minCapacity < 7 ? minCapacity : (int)(minCapacity * 1.6));
	}
	
	protected void setArraySize(int size) {
	if (array.length == size) return;
		
		int[] newArray = new int[size];
		System.arraycopy(array, 0, newArray, 0, Math.min(size, array.length));
		array = newArray;
	}

	public void resize(int size) {
		setArraySize(size);
		nextPosition = size;
	}
	
	public void pushBack(int v) {
		if (nextPosition >= array.length) {
			ensureCapacity(array.length + 1);
		}
		array[nextPosition++] = v;
	}
	public void insert(int offset, int value) {
		if (offset > nextPosition) {
			// case of offset < 0 tested below when accessing array[offset]
            throw new ArrayIndexOutOfBoundsException(offset);
        }
		
		if (offset == nextPosition) {
            add(value);
            return;
        }
        ensureCapacity(nextPosition + 1);
        
        System.arraycopy(array, offset, array, offset + 1, nextPosition - offset);
        array[offset] = value;
        nextPosition++;
    }
	public void remove(int offset) {
		if (offset < 0 || offset >= nextPosition) {
            throw new ArrayIndexOutOfBoundsException(offset);
        }
		
		nextPosition--;
		
        if (offset != nextPosition) {
            System.arraycopy(array, offset + 1, array, offset, nextPosition - offset);
        }
        
    }
	
	public int popBack() {
		return array[--nextPosition];
	}
	
	public int size() {
		return nextPosition;
	}
	
	public int get(int pos) {
		if (pos >= nextPosition) throw new ArrayIndexOutOfBoundsException(pos);
		return array[pos];
	}
	
	public int[] getBackingArray() {
		return array;
	}
	
	public void set(int pos, int value) {
		if (pos >= nextPosition) throw new ArrayIndexOutOfBoundsException(pos);
		array[pos] = value;
	}
	@Override
	public String toString() {
		return IntArrayUtils.toString(this);
	}
	public int[] toArray() {
		int len = size();
		int[] newArray = new int[len];
		System.arraycopy(array, 0, newArray, 0, len);
		return newArray;
	}
	public boolean isEmpty() {
		return nextPosition == 0;
	}
	public void clear() {
		nextPosition = 0;
	}
	public void fill(int v) {
		for (int i = nextPosition; i-- != 0;) array[i] = v;
	}
	public void addAll(IntArray other) {
		int len = other.size();
		ensureCapacity(size() + len);
		int[] a = other.getBackingArray();
		if (a != null) {
			System.arraycopy(a, 0, array, nextPosition, len);
		} else {
			int n = nextPosition;
			for (int i = 0; i < len; i++) {
				array[n + i] = other.get(i);
			}
		}
		nextPosition += len;
	}
	public Iterator<Integer> iterator() {
		return IntArrayUtils.iterator(this);
	}
}
