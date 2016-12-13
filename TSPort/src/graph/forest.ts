import * as Immutable from 'immutable';

export type Tree<V> = Immutable.Set<V>;
export class Forest<V> {
  private constructor(
    public trees: Immutable.Set<Tree<V>>,
    private treeByVertex: Immutable.Map<V, Tree<V>>) {}

  toString() {
    return `Forest: ${this.trees}`;
  }
  get size(): number {
    return this.trees.size;
  }

  static plant<V>(vertices: Immutable.Set<V>): Forest<V> {
    const treeByVertexBuilder = Immutable.Map<V, Tree<V>>().asMutable();
    const trees = vertices.map((v: V) => {
      const tree = Immutable.Set.of(v);
      treeByVertexBuilder.set(v, tree);
      return tree;
    }).toSet();
    return new Forest<V>(trees, treeByVertexBuilder.toMap());
  }

  getTree(vertex: V): Tree<V> {
    return this.treeByVertex.get(vertex);
  }

  merge(a: Tree<V>, b: Tree<V>) {
    const merged = a.union(b);
    let treeByVertexBuilder = this.treeByVertex.asMutable();
    merged.forEach((v: V) => treeByVertexBuilder.set(v, merged));
    return new Forest(
        this.trees.asMutable().remove(a).remove(b).add(merged).toSet(),
        treeByVertexBuilder.toMap());
  }
}
