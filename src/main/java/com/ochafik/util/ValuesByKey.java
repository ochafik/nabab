package com.ochafik.util;

import java.util.Arrays;
import java.util.Collection;
import java.util.Collections;
import java.util.Map;
import java.util.Set;
import java.util.SortedMap;
import java.util.SortedSet;
import java.util.TreeMap;
import java.util.TreeSet;

public class ValuesByKey<K extends Comparable<? super K>, V extends Comparable<? super V>> {
	Map<K,Set<V>> valuesMap = new TreeMap<K, Set<V>>();
	Map<V,Set<K>> keysMap = new TreeMap<V, Set<K>>();
	
	public int size() {
		return keysMap.size();
	}
	public Set<K> keySet() {
		return Collections.unmodifiableSet(valuesMap.keySet());
	}
	public Set<V> valueSet() {
		return Collections.unmodifiableSet(keysMap.keySet());
	}
	public boolean isEmpty() {
		return valuesMap.isEmpty();
	}
	public void add(V value, Collection<K> keys) {
		Set<K> existingKeys = keysMap.get(value);
		if (existingKeys == null) {
			keysMap.put(value, new TreeSet<K>(keys));
		} else {
			existingKeys.addAll(keys);
		}
		
		for (K key : keys) {
			Set<V> values = valuesMap.get(key);
			if (values == null) {
				values = new TreeSet<V>();
				valuesMap.put(key, values);
			}
			values.add(value);
		}
	}
	@SuppressWarnings("unchecked")
	public void add(V value, K key) {
		add(value, (Collection)Arrays.asList(new Object[] {key}));
	}
	
	public Collection<K> remove(V value) {
		Collection<K> keys = keysMap.remove(value);
		if (keys == null) return null;
		
		for (K key : keys) {
			removeValues(value, key);
		}
		return keys;
	}
	public void remove(V value, K key) {
		Set<K> keys = keysMap.get(value);
		if (keys != null) {
			keys.remove(key);
			if (keys.isEmpty()) {
				keysMap.remove(value);
			}
		}
		removeValues(value, key);
	}
	protected void removeValues(V value, K key) {
		Set<V> values = valuesMap.get(key);
		if (values != null) {
			values.remove(value);
			if (values.isEmpty()) {
				valuesMap.remove(key);
			}
		}
	}
	Set<V> emptySet = new EmptySet<V>();
	public Set<V> get(K key) {
		Set<V> values = valuesMap.get(key);
		if (values != null) {
			return Collections.unmodifiableSet(values);
		} else {
			return emptySet;
		}
	}
}
