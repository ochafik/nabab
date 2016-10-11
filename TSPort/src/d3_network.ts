import * as d3 from 'd3';
import * as Immutable from 'immutable';
import {Network} from './network';
import {Variable} from './variable';
import {Edge} from './edge';

export function drawNetwork(net: Network) {
  // See http://bl.ocks.org/sathomas/11550728

  var width = '100%',
      height = '100%';
      
  let variables = net.likelihoods.keySeq().toArray();
  let nodesMap = Immutable.Map<Variable, d3.layout.force.Node>();
  variables.forEach((v, i) => {
    nodesMap = nodesMap.set(v, {
      // id: i,
      x: v.position!.x,
      y: v.position!.y,
    });
  });
  let nodes = nodesMap.valueSeq().toArray();
  let links: d3.layout.force.Link<d3.layout.force.Node>[] =
      Immutable.Seq.of(...variables).flatMap((v: Variable) =>
          Immutable.Seq.of(...net.likelihoods.get(v).dependencies).map((d: Variable) =>
              ({
                source: nodesMap.get(d),
                target: nodesMap.get(v)
              }))).toArray();

  d3.select('body').selectAll('svg').remove();

  var svg = d3.select('body').append('svg')
      .attr('width', width)
      .attr('height', height);

  svg.selectAll('.link')
      .data(links)
      // .data(net.graph.getIncomingEdges().toArray())
      .enter().append('line')
      .attr('class', 'link')
      // .attr('x1', (d: Edge<{}, Variable>) => d.from.position!.x)
      // .attr('y1', (d: Edge<{}, Variable>) => d.from.position!.y)
      // .attr('x2', (d: Edge<{}, Variable>) => d.to.position!.x)
      // .attr('y2', (d: Edge<{}, Variable>) => d.to.position!.y);
      .attr('x1', d => d.source.x!)
      .attr('y1', d => d.source.y!)
      .attr('x2', d => d.target.x!)
      .attr('y2', d => d.target.y!);

  const node = svg.selectAll('.node')
      .data(variables)
      .enter().append('circle')
      .attr('class', 'node')
      .attr('r', 20)
      .attr('cx', (v: Variable) => v.position!.x)
      .attr('cy', (v: Variable) => v.position!.y)

  node.append('title')
      .text((v: Variable) => net.likelihoods.get(v).toString())

  svg.selectAll('.label')
      .data(variables)
      .enter().append('svg:text')
      .attr('x', (v: Variable) => v.position!.x)
      .attr('y', (v: Variable) => v.position!.y)
      .attr('class', 'id')
      .text(v => v.name)
}