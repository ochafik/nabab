import {Heap} from './collections/heap';
import {DirectedGraph, Edge, buildJunctionTree} from './graph';
import * as Immutable from 'immutable';
import {parseXmlBif} from './xmlbif_parser';
import {getUrl} from './request';
import {Network} from './network';
import {drawNetwork} from './d3_network';

function isLessThan<T>(a: T, b: T) {
  return a.toString() < b.toString();
}
// function testCliques() {
//   let A = "A";
//   let B = "B";
//   let C = "C";
//   let D = "D";
//   let graph = DirectedGraph.empty<string, {}>().add({
//     vertices: [A, B, C, D],
//     edges: [
//       new Edge({from: A, to: B}),
//       new Edge({from: A, to: C}),
//       new Edge({from: C, to: D}),
//       new Edge({from: A, to: D}),
//     ]
//   });
//   let junctionGraph = buildJunctionGraph(graph, isLessThan);
//   console.log(`JUNCTION GRAPH: ${junctionGraph}`);
// }

// testCliques();

function openNetworkFromString(src: string) {
  const net = parseXmlBif(src);
  console.log(net.toString());
  const junctionTree = buildJunctionTree(net.graph, isLessThan).toString();
  console.log(junctionTree);
  drawNetwork(net);
}

document.body.onpaste = (e) =>
    e.clipboardData.items[0].getAsString(openNetworkFromString);

getUrl('src/example.xmlbif').then(openNetworkFromString);
