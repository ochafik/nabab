///<reference path='../node_modules/immutable/dist/immutable.d.ts'/>

export class MultiMap<K, V> {
  constructor(private map = Immutable.Map<K, Immutable.Set<V>>()) {}
  
  get(key: K): Immutable.Set<V> {
    return this.map.get(key);
  }
  add(key: K, value: V): MultiMap<K, V> {
    return new MultiMap<K, V>(this.map.set(key, this.map.get(key, Immutable.Set<V>()).add(value)));
  }
  remove(key: K, value: V): MultiMap<K, V> {
    return new MultiMap<K, V>(this.map.set(key, this.map.get(key, Immutable.Set<V>()).remove(value)));
  }
}
