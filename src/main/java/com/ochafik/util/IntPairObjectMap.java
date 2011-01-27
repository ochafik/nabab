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