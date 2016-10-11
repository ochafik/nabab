import {DirectedGraph} from './graph';
import {Edge} from './edge';
import {buildJunctionGraph} from './junction';
import * as Immutable from 'immutable';
import {parseXmlBif} from './xmlbif_parser';
import {getUrl} from './request';

import {Network} from './network';

function isLessThan<T>(a: T, b: T) {
  return a.toString() < b.toString();
}
function testCliques() {
  let A = "A"; 
  let B = "B"; 
  let C = "C"; 
  let D = "D";
  let graph = DirectedGraph.empty<string, {}>().add({
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

document.body.onpaste = (e: ClipboardEvent) => {
  if (e.clipboardData.items.length == 0) return;
  e.clipboardData.items[0].getAsString((str: string) => {
    const net = parseXmlBif(str);
    console.log(net.toString());
  });
};

getUrl('src/example.xmlbif').then(src => {
  const net = parseXmlBif(src);
  console.log(net.toString());
  console.log(buildJunctionGraph(net.graph, isLessThan));
});

// // function bootstrap(div: HTMLElement) {
// //   let set = Immutable.Set.of(1, 2, 3).intersect(Immutable.Set.of(2));

// //   div.innerHTML = 'Hello: ' + set;
// // }
// // bootstrap(document.getElementById('nabab')!);
// // // setTimeout(() => , 0);
