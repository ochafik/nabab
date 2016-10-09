import {DirectedGraph} from './graph';
import {Edge} from './edge';
import {buildJunctionGraph} from './junction';
import Immutable = require('immutable');

function testCliques() {
  // type edge
  let A = Symbol("A"); 
  let B = Symbol("B"); 
  let C = Symbol("C"); 
  let D = Symbol("D");
  let graph = new DirectedGraph<symbol, {}>().add({
    vertices: [A, B, C, D],
    edges: [
      new Edge({from: A, to: B}),
      new Edge({from: A, to: B}),
      new Edge({from: A, to: C}),
      new Edge({from: C, to: D}),
      new Edge({from: A, to: D}),
    ]
  }); 
  let junctionGraph = buildJunctionGraph(graph, (a, b) => a.toString() < b.toString());
  console.log(`JUNCTION GRAPH: ${junctionGraph}`);
}

testCliques();

// function bootstrap(div: HTMLElement) {
//   let set = Immutable.Set.of(1, 2, 3).intersect(Immutable.Set.of(2));

//   div.innerHTML = 'Hello: ' + set;
// }
// bootstrap(document.getElementById('nabab')!);
// // setTimeout(() => , 0);
