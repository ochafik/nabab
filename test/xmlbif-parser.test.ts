import { describe, it, expect } from 'vitest';
import { parseXmlBif } from '../src/lib/xmlbif-parser.js';
import { BayesianNetwork } from '../src/lib/network.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { JSDOM } from 'jsdom';

const dogProblemXml = readFileSync(resolve(__dirname, '../src/example.xmlbif'), 'utf-8');
const domParser = {
  parseFromString: (s: string, t: string) => new JSDOM(s, { contentType: t }).window.document,
};

describe('XMLBIF Parser', () => {
  it('parses the dog-problem network', () => {
    const parsed = parseXmlBif(dogProblemXml, domParser);
    expect(parsed.name).toBe('Dog-Problem');
    expect(parsed.variables.length).toBe(5);
    expect(parsed.cpts.length).toBe(5);

    const names = parsed.variables.map(v => v.name);
    expect(names).toContain('light-on');
    expect(names).toContain('bowel-problem');
    expect(names).toContain('dog-out');
    expect(names).toContain('hear-bark');
    expect(names).toContain('family-out');
  });

  it('parses CPT tables correctly', () => {
    const parsed = parseXmlBif(dogProblemXml, domParser);
    const familyOut = parsed.cpts.find(c => c.variable.name === 'family-out')!;
    expect(familyOut.parents.length).toBe(0);
    expect(familyOut.table.length).toBe(2);
    expect(familyOut.table[0]).toBeCloseTo(0.15);
    expect(familyOut.table[1]).toBeCloseTo(0.85);

    const dogOut = parsed.cpts.find(c => c.variable.name === 'dog-out')!;
    expect(dogOut.parents.length).toBe(2);
    expect(dogOut.parents.map(p => p.name)).toEqual(['bowel-problem', 'family-out']);
    expect(dogOut.table.length).toBe(8);
    expect(dogOut.table[0]).toBeCloseTo(0.99); // P(dog-out=T | bp=T, fo=T)
  });

  it('parses variable positions', () => {
    const parsed = parseXmlBif(dogProblemXml, domParser);
    const lightOn = parsed.variables.find(v => v.name === 'light-on')!;
    expect(lightOn.position).toEqual({ x: 73, y: 165 });
  });
});

describe('Dog-Problem inference', () => {
  it('computes correct priors', () => {
    const net = BayesianNetwork.fromXmlBif(dogProblemXml, domParser);
    const result = net.infer();

    const fo = result.posteriors.get(net.getVariable('family-out')!)!;
    expect(fo.get('true')).toBeCloseTo(0.15, 2);
    expect(fo.get('false')).toBeCloseTo(0.85, 2);

    const bp = result.posteriors.get(net.getVariable('bowel-problem')!)!;
    expect(bp.get('true')).toBeCloseTo(0.01, 2);
    expect(bp.get('false')).toBeCloseTo(0.99, 2);

    // P(light-on=T) = 0.6*0.15 + 0.05*0.85 = 0.1325
    const lo = result.posteriors.get(net.getVariable('light-on')!)!;
    expect(lo.get('true')).toBeCloseTo(0.1325, 2);
  });

  it('computes posteriors with evidence hear-bark=true', () => {
    const net = BayesianNetwork.fromXmlBif(dogProblemXml, domParser);
    const evidence = new Map([['hear-bark', 'true']]);
    const result = net.infer(evidence);

    // Dog is very likely out if we hear barking
    const dogOut = result.posteriors.get(net.getVariable('dog-out')!)!;
    expect(dogOut.get('true')).toBeGreaterThan(0.9);

    // Family more likely out
    const fo = result.posteriors.get(net.getVariable('family-out')!)!;
    expect(fo.get('true')).toBeGreaterThan(0.15); // increased from prior
  });

  it('computes posteriors with evidence dog-out=false', () => {
    const net = BayesianNetwork.fromXmlBif(dogProblemXml, domParser);
    const evidence = new Map([['dog-out', 'false']]);
    const result = net.infer(evidence);

    // If dog is not out, hearing bark is unlikely
    const hb = result.posteriors.get(net.getVariable('hear-bark')!)!;
    expect(hb.get('true')).toBeCloseTo(0.01, 2);
  });
});
