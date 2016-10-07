///<reference path='../node_modules/immutable/dist/immutable.d.ts'/>
// import Immutable = require('immutable');

import {DefaultGraph, DefaultEdge, makeEdge} from './graph';
import {growCliques} from './cliques';
import {moralize} from './moralization';

function testCliques() {
  // type edge
  let graph = new DefaultGraph<symbol, DefaultEdge<{}, symbol>>(); 
  let A = Symbol("A"); 
  let B = Symbol("B"); 
  let C = Symbol("C"); 
  let D = Symbol("D");
  graph = graph.add({
    vertices: [A, B, C, D],
    edges: [
      makeEdge(A, B),
      makeEdge(A, C),
      makeEdge(C, D),
      makeEdge(A, D),
    ]
  });
  console.log(`GRAPH: ${graph}`);

  let moralized = moralize(graph);
  console.log(`MORAL GRAPH: ${moralized}`);

  let cliques = growCliques(moralized);
  console.log(`CLIQUES: ${cliques}`);
}

testCliques();

// function bootstrap(div: HTMLElement) {
//   let set = Immutable.Set.of(1, 2, 3).intersect(Immutable.Set.of(2));

//   div.innerHTML = 'Hello: ' + set;
// }
// bootstrap(document.getElementById('nabab')!);
// // setTimeout(() => , 0);
