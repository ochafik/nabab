export {MultiMap, MultiMapBuilder} from './multimap';
export {Heap} from './heap';

import * as Immutable from 'immutable';

export function mapFromKeyValues<K, V>(kvs: [K, V][]): Immutable.Map<K, V> {
  let map = Immutable.Map<K, V>();
  kvs.forEach(([k, v]) => map = map.set(k, v));
  return map;
}