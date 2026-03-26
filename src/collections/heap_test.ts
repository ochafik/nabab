
function testHeap() {
  var h = Heap.fromArray([4, 1, -1, 3, 6, 0], (a, b) => a < b);
  while (h != null) {
    let [v, rest] = h.remove();
    console.log(v);
    h = rest;
  }
}

testHeap();
