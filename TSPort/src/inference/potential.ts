import * as Immutable from 'immutable';

export abstract class Potential<V> {
  static of<V>(variable: V): Potential<V> {
    return new VariablePotential<V>(variable);
  }
  static multiply<V>(operands: ReadonlyArray<Potential<V>>) {
    return new ProductPotential<V>(operands);
  }
  static unit<V>() {
    return new UnitPotential<V>();
  }
  multiplyWith(other: Potential<V>): Potential<V> {
    if (other instanceof ProductPotential) {
      return other.multiplyWith(this);
    }
    return new ProductPotential<V>([this, other]);
  }
}

class UnitPotential<V> extends Potential<V> {
  constructor() {
    super();
  }
  multiplyWith(other: Potential<V>): Potential<V> {
    return other;
  }
}
class VariablePotential<V> extends Potential<V> {
  constructor(readonly variable: V) {
    super();
  }
}
class MarginalizedPotential<V> extends Potential<V> {
  constructor(
      readonly original: Potential<V>,
      readonly marginalizedVariables: Immutable.Set<V>) {
    super();
  }
}
class ProductPotential<V> extends Potential<V> {
  constructor(readonly operands: ReadonlyArray<Potential<V>>) {
    super();
  }
  multiplyWith(other: Potential<V>): Potential<V> {
    return new ProductPotential<V>(this.operands.concat(other));
  }
}

class Distribution<T> {

}