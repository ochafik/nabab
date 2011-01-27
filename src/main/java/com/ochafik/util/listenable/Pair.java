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

package com.ochafik.util.listenable;

import java.util.Map;

public class Pair<U, V> implements Comparable<Pair<U, V>>, Map.Entry<U, V> {
	private U first;
	private V second;
	
	public Pair(U first, V second) {
		this.first = first;
		this.second = second;
	}
	
	public Pair() {}

	public U getFirst() {
		return first;
	}
	
	public V getSecond() {
		return second;
	}
	
	public void setFirst(U first) {
		this.first = first;
	}
	
	public void setSecond(V second) {
		this.second = second;
	}
	
	@SuppressWarnings("unchecked")
	public int compareTo(Pair<U, V> o) {
		Comparable<U> cu = (Comparable<U>)getFirst();
		if (cu == null) {
			if (first != null)
				return 1;
		} else {
			int d = cu.compareTo(o.getFirst());
			if (d != 0)
				return d;
		}
		
		Comparable<V> cv = (Comparable<V>)getSecond();
		if (cv == null)
			return second != null ? 1 : -1;
		return cv.compareTo(o.getSecond());
	}
	
	@Override
	public String toString() {
		return "Pair("+first+", "+second+")";
	}

	public U getKey() {
		return first;
	}

	public V getValue() {
		return second;
	}

	public V setValue(V value) {
		V oldValue = second;
		second = value;
		return oldValue;
	}

	@Override
	public int hashCode() {
		final int prime = 31;
		int result = 1;
		result = prime * result + ((first == null) ? 0 : first.hashCode());
		result = prime * result + ((second == null) ? 0 : second.hashCode());
		return result;
	}

	@Override
	public boolean equals(Object obj) {
		if (this == obj)
			return true;
		if (obj == null)
			return false;
		if (getClass() != obj.getClass())
			return false;
		final Pair<?, ?> other = (Pair<?, ?>) obj;
		if (first == null) {
			if (other.first != null)
				return false;
		} else if (!first.equals(other.first))
			return false;
		if (second == null) {
			if (other.second != null)
				return false;
		} else if (!second.equals(other.second))
			return false;
		return true;
	}

	public boolean isFull() {
		return getFirst() != null && getSecond() != null;
	}
	
	public boolean isEmpty() {
		return getFirst() == null && getSecond() == null;
	}
}
