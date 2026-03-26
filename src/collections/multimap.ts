import * as Immutable from 'immutable';

export class MultiMap<K, V> {
  constructor(public readonly map = Immutable.Map<K, Immutable.Set<V>>()) {}
  
  *getAllValues(): IterableIterator<V> {
    const it = this.map.values();
    let res: IteratorResult<Immutable.Set<V>>;
    while (!(res = it.next()).done) {
      yield *res.value.toArray();
    }
  }
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
    return new MultiMap<K, V>(map);
  }
  mapValues(f: (value: V) => V): MultiMap<K, V> {
    return new MultiMap<K, V>(this.map.map(values => values!.map(f).toSet()).toMap());
  }
  static builder<K, V>(): MultiMapBuilder<K, V> {
    return new MultiMapBuilder<K, V>();
  }
  static build<K, V>(f: (builder: MultiMapBuilder<K, V>) => void): MultiMap<K, V> {
    const builder = MultiMap.builder<K, V>();
    f(builder);
    return builder.build(); 
  }
}

export class MultiMapBuilder<K, V> {
  constructor(public readonly map = Immutable.Map<K, Immutable.Set<V>>()) {}
  
  add(key: K, value: V): void {
    let set = this.map.get(key);
    if (set == null) this.map.set(key, set = Immutable.Set<V>().asMutable());
    set.add(value);
  }
  remove(key: K, value: V): void {
    let set = this.map.get(key);
    if (set != null) set.remove(value);
  }
  build(): MultiMap<K, V> {
    return new MultiMap<K, V>(this.map.map((v: Immutable.Set<V>) => v.toSet()).toMap());
  }
}
