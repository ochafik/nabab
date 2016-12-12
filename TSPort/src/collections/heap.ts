export type IsLessThan<T> = (a: T, b: T) => boolean;

export class Heap<T> {
  public readonly size: number;
  public readonly height: number;

  constructor(
      readonly isLessThan: IsLessThan<T>,
      readonly value: T,
      readonly left?: Heap<T>,
      readonly right?: Heap<T>) {
    var size = 1;
    if (left) size += left.size;
    if (right) size += right.size;
    this.size = size;

    this.height = 1 + Math.max(left ? left.height : 0, right ? right.height : 0);
  }

  public static fromArray<T>(values: T[], isLessThan: IsLessThan<T>): Heap<T> | undefined {
    if (values.length == 0) return undefined;

    // TODO(ochafik): Correct heapify support for linear building time.
    const [first, ...rest] = values;
    var heap = new Heap(isLessThan, first);
    for (const value of rest) {
      heap = heap.add(value);
    }
    return heap;
  }

  private makeLeaf(value: T): Heap<T> {
    return this.makeHeap(value);
  }

  private makeHeap(value: T, left?: Heap<T>, right?: Heap<T>): Heap<T> {
    return new Heap(this.isLessThan, value, left, right);
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

  private floatLeft(value: T, left?: Heap<T>, right?: Heap<T>): Heap<T> {
    return left ? this.makeHeap(left.value, this.makeHeap(value, left.left, left.right), right) : this.makeHeap(value, left, right);
  }
  private floatRight(value: T, left?: Heap<T>, right?: Heap<T>): Heap<T> {
    return right ? this.makeHeap(right.value, left, this.makeHeap(value, right.left, right.right)) : this.makeHeap(value, left, right);
  }

  private mergeChildren(left?: Heap<T>, right?: Heap<T>): Heap<T> | undefined {
    if (!left) return right;
    if (!right) return left;

    if (left.size < Math.pow(2, left.height) - 1) {
      return this.floatLeft(left.value, this.mergeChildren(left.left, left.right), right)
    } else if (right.size < Math.pow(2, right.height) - 1) {
      return this.floatRight(right.value, left, this.mergeChildren(right.left, right.right))
    } else if (right.height < left.height) {
      return this.floatLeft(left.value, this.mergeChildren(left.left, left.right), right)
    } else {
      return this.floatRight(right.value, left, this.mergeChildren(right.left, right.right))
    }
  }

  public remove(): [T, Heap<T> | undefined] {
    const h = this.mergeChildren(this.left, this.right);
    return [this.value, h && h.bubbleDown(h.value, h.left, h.right)];
  }

  private bubbleUp(value: T, left?: Heap<T>, right?: Heap<T>): Heap<T> {
    if (left && this.isLessThan(left.value, value)) {
      return this.makeHeap(left.value, this.makeHeap(value, left.left, left.right), right)
    } else if (right && this.isLessThan(right.value, value)) {
      return this.makeHeap(right.value, left, this.makeHeap(value, right.left, right.right))
    } else {
      return this.makeHeap(value, left, right)
    }
  }

  private bubbleDown(value: T, left?: Heap<T>, right?: Heap<T>): Heap<T> {
    if (left && right && this.isLessThan(right.value, left.value) && this.isLessThan(right.value, value)) {
      return this.makeHeap(right.value, left, this.bubbleDown(value, right.left, right.right));
    } else if (left && this.isLessThan(left.value, value)) {
      return this.makeHeap(left.value, this.bubbleDown(value, left.left, left.right), right);
    } else {
      return this.makeHeap(value, left, right);
    }
  }
}
