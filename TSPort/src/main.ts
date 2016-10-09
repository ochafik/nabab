import {DirectedGraph} from './graph';
import {Edge} from './edge';
import {buildJunctionGraph} from './junction';
import * as Immutable from 'immutable';

function testCliques() {
  let A = "A"; 
  let B = "B"; 
  let C = "C"; 
  let D = "D";
  function isLessThan<T>(a: T, b: T) {
    return a.toString() < b.toString();
  }
  let graph = new DirectedGraph<string, {}>().add({
    vertices: [A, B, C, D],
    edges: [
      new Edge({from: A, to: B}),
      new Edge({from: A, to: C}),
      new Edge({from: C, to: D}),
      new Edge({from: A, to: D}),
    ]
  }); 
  let junctionGraph = buildJunctionGraph(graph, isLessThan);
  console.log(`JUNCTION GRAPH: ${junctionGraph}`);
}

testCliques();

// function bootstrap(div: HTMLElement) {
//   let set = Immutable.Set.of(1, 2, 3).intersect(Immutable.Set.of(2));

//   div.innerHTML = 'Hello: ' + set;
// }
// bootstrap(document.getElementById('nabab')!);
// // setTimeout(() => , 0);
