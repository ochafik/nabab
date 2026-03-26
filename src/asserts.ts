import * as Immutable from 'immutable';

export let assertsEnabled = true;

export function assert(condition: (boolean | (() => boolean)), message?: (string | (() => string))): void {
  if (!assertsEnabled) return;

  if (typeof condition !== 'boolean') condition = condition();
  if (!condition) {
    if (typeof message === 'function') message = message();
    throw new Error('Assert failed!' + (message == null ? '' : ': ' + message));
  }
}

class BaseSubject<T> {
  constructor(protected target: T) {}

}
class SetSubject<T> extends BaseSubject<Immutable.Set<T>> {
  constructor(target: Immutable.Set<T>) {
    super(target);
  }
  contains(...values: T[]): void {
    if (!assertsEnabled) return;

    const missing = values.filter(v => !this.target.contains(v));
    assert(values.length == 0 || missing.length == 0,
        () => `Set ${this.target} does not contain values ${missing.map(m => m.toString)}`);
  }
  isSuperset(subSet: Immutable.Set<T>): void {
    if (!assertsEnabled) return;

    assert(this.target.isSuperset(subSet),
        () => `Set ${this.target} is not a superset of ${subSet.toString()} (misses values: ${subSet.subtract(this.target).toString()})`);
  }
  isSubset(superSet: Immutable.Set<T>): void {
    if (!assertsEnabled) return;

    assert(this.target.isSubset(superSet),
        () => `Set ${this.target} is not a subset of ${superSet.toString()} (extra values: ${this.target.subtract(superSet).toString()})`);
  }
}

type AssertThat = {
  <T>(set: Immutable.Set<T>): SetSubject<T>;
  <T>(obj: T): BaseSubject<T>;
};

export const assertThat: AssertThat = function<T>(subject: T): BaseSubject<T> {
  if (subject instanceof Set) {
    return new SetSubject<any>(subject as any as Immutable.Set<any>) as any;
  }
  return new BaseSubject(subject);
} as AssertThat;
