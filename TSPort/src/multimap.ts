import Immutable = require('immutable');

export class MultiMap<K, V> {
  constructor(public map = Immutable.Map<K, Immutable.Set<V>>()) {}
  
  toString() {
    return this.map.toString();
  }
  equals(o: any) {
    return o instanceof MultiMap && o.map.equals(this.map);
  }
  hashCode() {
    return this.map.hashCode();
  }
  get(key: K): Immutable.Set<V> {
    return this.map.get(key);
  }
  add(key: K, value: V): MultiMap<K, V> {
    return new MultiMap<K, V>(this.map.set(key, this.map.get(key, Immutable.Set<V>()).add(value)));
  }
  remove(key: K, value: V): MultiMap<K, V> {
    return new MultiMap<K, V>(this.map.set(key, this.map.get(key, Immutable.Set<V>()).remove(value)));
  }
  merge(other: MultiMap<K, V>): MultiMap<K, V> {
    let map = this.map;
    other.map.forEach((values: Immutable.Set<V>, key: K) => {
      map = map.set(key, map.get(key, Immutable.Set<V>()).union(values));
    })
    return new MultiMap(map);
  }
}
