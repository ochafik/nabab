type IsLessThan<T> = (a: T, b: T) => boolean;

class Heap<T> {
  private constructor(
    readonly isLessThan: IsLessThan<T>,
    readonly size: number,
    readonly value?: T,
    readonly left?: Heap<T>,
    readonly right?: Heap<T>) {}

  static empty<T>(isLessThan: IsLessThan<T>) {
    return new Heap<T>(isLessThan, 0);
  }

  private makeLeaf(value: T): Heap<T> {
    return new Heap(this.isLessThan, 1, value);
  }

  private addToHeap(value: T, heap?: Heap<T>): Heap<T> {
    return heap == null ? this.makeLeaf(value) : heap.add(value);
  }

  add(value: T): Heap<T> {
    if (this.size == 0) return this.makeLeaf(value);

    const left = this.left;
    const right = this.right;
    const leftSize = left == null ? 0 : left.size;
    const rightSize = right == null ? 0 : right.size;

    if (rightSize < leftSize) {
      return this.bubbleUp(this.value, left, this.addToHeap(value, right));
    } else {
      return this.bubbleUp(this.value, this.addToHeap(value, left), right);
    }
  }

  private bubbleUp<T>(root: T, left: Heap<T>, right: Heap<T>): Heap<T> {
    if (this.isLessThan(left.value, root)) {

    }
    // case (Branch(y, lt, rt, _, _), _) if (x > y) => 
    //   Heap.make(y, Heap.make(x, lt, rt), r)
    // case (_, Branch(z, lt, rt, _, _)) if (x > z) => 
    //   Heap.make(z, l, Heap.make(x, lt, rt))
    // case (_, _) => Heap.make(x, l, r)
  }

  }
}