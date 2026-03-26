import { describe, it, expect } from 'vitest';
import { BayesianNetwork } from '../src/lib/network.js';
import { buildDirectedGraph, buildJunctionTree, moralize, triangulate, findMaximalCliques } from '../src/lib/graph.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { JSDOM } from 'jsdom';

const dogProblemXml = readFileSync(resolve(__dirname, '../src/example.xmlbif'), 'utf-8');
const domParser = {
  parseFromString: (s: string, t: string) => new JSDOM(s, { contentType: t }).window.document,
};

describe('Triangulation quality', () => {
  it('dog-problem produces 3 cliques (not 1 giant clique)', () => {
    const net = BayesianNetwork.fromXmlBif(dogProblemXml, domParser);
    const edges: Array<[any, any]> = [];
    for (const cpt of net.cpts) {
      for (const parent of cpt.parents) {
        edges.push([parent, cpt.variable]);
      }
    }
    const dag = buildDirectedGraph([...net.variables], edges);
    const moral = moralize(dag);
    const tri = triangulate(moral);
    const cliques = findMaximalCliques(tri);

    // Java produces 3 cliques. We should produce similar (not 1 giant clique).
    expect(cliques.length).toBeGreaterThanOrEqual(3);
    // No clique should contain all 5 variables
    expect(cliques.every(c => c.length < 5)).toBe(true);
    // Max clique size should be 3 (matching Java: max=3)
    const maxSize = Math.max(...cliques.map(c => c.length));
    expect(maxSize).toBeLessThanOrEqual(3);
  });

  it('junction tree has correct structure', () => {
    const net = BayesianNetwork.fromXmlBif(dogProblemXml, domParser);
    const edges: Array<[any, any]> = [];
    for (const cpt of net.cpts) {
      for (const parent of cpt.parents) {
        edges.push([parent, cpt.variable]);
      }
    }
    const dag = buildDirectedGraph([...net.variables], edges);
    const jt = buildJunctionTree(dag);

    // Tree property: edges = cliques - 1
    let totalEdges = 0;
    for (const ns of jt.neighbors.values()) totalEdges += ns.size;
    totalEdges /= 2;
    expect(totalEdges).toBe(jt.cliques.length - 1);

    // All variables should appear in at least one clique
    const allVars = new Set(jt.cliques.flat());
    for (const v of net.variables) {
      expect(allVars.has(v)).toBe(true);
    }
  });
});

describe('Soft/likelihood evidence', () => {
  it('soft evidence produces intermediate posteriors', () => {
    const net = BayesianNetwork.fromXmlBif(dogProblemXml, domParser);

    // Hard evidence: hear-bark=true
    const hardResult = net.infer(new Map([['hear-bark', 'true']]));
    const hardDogOut = hardResult.posteriors.get(net.getVariable('dog-out')!)!.get('true')!;

    // Soft evidence: 80% sure hear-bark is true
    const softEvidence = new Map([
      ['hear-bark', new Map([['true', 0.8], ['false', 0.2]])]
    ]);
    const softResult = net.infer(undefined, softEvidence);
    const softDogOut = softResult.posteriors.get(net.getVariable('dog-out')!)!.get('true')!;

    // Prior P(dog-out=true) ≈ 0.396
    const priorResult = net.infer();
    const priorDogOut = priorResult.posteriors.get(net.getVariable('dog-out')!)!.get('true')!;

    // Soft evidence should push dog-out between prior and hard evidence
    expect(softDogOut).toBeGreaterThan(priorDogOut);
    expect(softDogOut).toBeLessThan(hardDogOut);
  });

  it('hard evidence via likelihood matches regular hard evidence', () => {
    const net = BayesianNetwork.fromXmlBif(dogProblemXml, domParser);

    const hardResult = net.infer(new Map([['hear-bark', 'true']]));
    const likelihoodResult = net.infer(undefined, new Map([
      ['hear-bark', new Map([['true', 1.0], ['false', 0.0]])]
    ]));

    // Should produce identical results
    for (const v of net.variables) {
      const hd = hardResult.posteriors.get(v)!;
      const ld = likelihoodResult.posteriors.get(v)!;
      for (const outcome of v.outcomes) {
        expect(ld.get(outcome)).toBeCloseTo(hd.get(outcome)!, 5);
      }
    }
  });
});
