package com.ochafik.util;

import java.util.ArrayList;
import java.util.BitSet;
import java.util.Collection;

import com.ochafik.util.listenable.Filter;

public class CollectionsUtils {
	
	public static <T, U extends T> Collection<U> filter(Collection<U> col, Filter<T> filter) {
		ArrayList<U> ret = new ArrayList<U>(col.size());
		for (U t : col)
			if (filter.accept(t))
				ret.add(t);
		return ret;
 	}
	public static final <T> ArrayList<T> asArrayList(Collection<T> col) {
		ArrayList<T> list = new ArrayList<T>(col.size());
		list.addAll(col);
		return list;
	}

	public static ArrayList<Integer> asArrayList(IntArray nodes) {
		int len = nodes.size();
		ArrayList<Integer> list = new ArrayList<Integer>(len);
		for (int i = 0; i < len; i++) {
			list.add(nodes.get(i));
		}
		return list;
	}
}
