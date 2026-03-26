import * as d3 from 'd3';
import * as Immutable from 'immutable';
import {Network} from './network';
import {Variable} from './variable';
import {Edge} from './graph/edge';
import {mapFromKeyValues} from './collections';

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

  var defs = svg.append("defs")

  defs.append("marker")
        .attr("id", "arrow")
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 5)
        .attr("refY", 0)
        .attr("markerWidth", 4)
        .attr("markerHeight", 4)
        .attr("orient", "auto")
        .append("path")
            .attr("class","arrowHead")
            .attr("d", "M0,-5L10,0L0,5");

// .arrow{
// 		stroke-width:5;
// 		stroke:#000;
// 		stroke-dasharray:5, 5;
// 	}

  const radialGradient = defs.append("radialGradient")
      .attr("id", "radial-gradient");

  radialGradient.append("stop")
      .attr("offset", "10%")
      .attr("stop-color", "gold");

  radialGradient.append("stop")
      .attr("offset", "95%")
      .attr("stop-color", "gray");

  svg.selectAll('.link')
      .data(links)
      .enter().append('line')
      .attr('class', 'link')
      .attr('x1', d => d.source.x!)
      .attr('y1', d => d.source.y!)
      .attr('x2', d => d.target.x!)
      .attr('y2', d => d.target.y!)
      .attr("marker-end", "url(#arrow)")
      .style("stroke", "black")
      .style("stroke-width", "1px");

  const node = svg.selectAll('.node')
      .data(variables)
      .enter().append('ellipse')
      .attr('id', (v: Variable) => `var-box-${v.name}`)
      .attr('class', 'node')
      .attr('cx', (v: Variable) => v.position!.x)
      .attr('cy', (v: Variable) => v.position!.y)
      .style("opacity", 0.6)
      .style("fill", "url(#radial-gradient)");

  svg.selectAll('.label')
      .data(variables)
      .enter().append('svg:text')
      .attr('id', (v: Variable) => `var-label-${v.name}`)
      .attr('class', 'id')
      .attr('x', v => v.position!.x)
      .attr('y', v => v.position!.y)
      .attr('alignment-baseline', 'central' )
      .style('text-anchor', 'middle')
      .style('font', '9px sans-serif')
      .style('font-weight', 'bold')
      .style('pointer-events', 'none')
      .text(v => v.name);

  const labelBBoxes: Immutable.Map<Variable, SVGRect> = mapFromKeyValues(variables.map(v =>
     [v, (svg.select(`#var-label-${v.name}`).node() as SVGSVGElement).getBBox()] as [Variable, SVGRect]));

  const margin = 7;
  node
      .attr('x', v => v.position!.x)
      .attr('y', v => v.position!.y)
      .attr('rx', v => labelBBoxes.get(v)!.width / 2 + margin)
      .attr('ry', v => labelBBoxes.get(v)!.height / 2 + margin);

  node.append('title')
      .text((v: Variable) => net.likelihoods.get(v).toString())
}