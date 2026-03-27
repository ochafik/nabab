import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { BayesianNetwork } from '../src/lib/network.js';
import { toXmlBif } from '../src/lib/xmlbif-writer.js';
import { toJSON, fromJSON } from '../src/lib/json-export.js';

const dogProblemXml = readFileSync(resolve(__dirname, '../src/example.xmlbif'), 'utf-8');

describe('XMLBIF round-trip', () => {
  it('load → export XMLBIF → re-load preserves network structure', () => {
    const original = BayesianNetwork.fromXmlBif(dogProblemXml);
    const exported = toXmlBif(original);
    const reloaded = BayesianNetwork.fromXmlBif(exported);

    // Same name
    expect(reloaded.name).toBe(original.name);

    // Same variables (name + outcomes)
    expect(reloaded.variables.length).toBe(original.variables.length);
    for (let i = 0; i < original.variables.length; i++) {
      expect(reloaded.variables[i].name).toBe(original.variables[i].name);
      expect([...reloaded.variables[i].outcomes]).toEqual([...original.variables[i].outcomes]);
    }

    // Same CPTs
    expect(reloaded.cpts.length).toBe(original.cpts.length);
    for (let i = 0; i < original.cpts.length; i++) {
      const origCpt = original.cpts[i];
      const reloadCpt = reloaded.cpts[i];
      expect(reloadCpt.variable.name).toBe(origCpt.variable.name);
      expect(reloadCpt.parents.map(p => p.name)).toEqual(origCpt.parents.map(p => p.name));
      expect(reloadCpt.table.length).toBe(origCpt.table.length);
      for (let j = 0; j < origCpt.table.length; j++) {
        expect(reloadCpt.table[j]).toBeCloseTo(origCpt.table[j], 10);
      }
    }

    // Same positions
    for (let i = 0; i < original.variables.length; i++) {
      if (original.variables[i].position) {
        expect(reloaded.variables[i].position).toEqual(original.variables[i].position);
      }
    }
  });

  it('round-tripped network produces the same inference results', () => {
    const original = BayesianNetwork.fromXmlBif(dogProblemXml);
    const exported = toXmlBif(original);
    const reloaded = BayesianNetwork.fromXmlBif(exported);

    const origResult = original.infer();
    const reloadResult = reloaded.infer();

    for (const origVar of original.variables) {
      const reloadVar = reloaded.getVariable(origVar.name)!;
      const origDist = origResult.posteriors.get(origVar)!;
      const reloadDist = reloadResult.posteriors.get(reloadVar)!;
      for (const outcome of origVar.outcomes) {
        expect(reloadDist.get(outcome)).toBeCloseTo(origDist.get(outcome)!, 6);
      }
    }
  });
});

describe('JSON round-trip', () => {
  it('load → export JSON → fromJSON preserves network structure', () => {
    const original = BayesianNetwork.fromXmlBif(dogProblemXml);
    const json = toJSON(original);
    const reloaded = fromJSON(json);

    expect(reloaded.name).toBe(original.name);
    expect(reloaded.variables.length).toBe(original.variables.length);

    for (let i = 0; i < original.variables.length; i++) {
      expect(reloaded.variables[i].name).toBe(original.variables[i].name);
      expect([...reloaded.variables[i].outcomes]).toEqual([...original.variables[i].outcomes]);
    }

    // Edges are represented in CPTs
    expect(reloaded.cpts.length).toBe(original.cpts.length);
    for (let i = 0; i < original.cpts.length; i++) {
      const origCpt = original.cpts[i];
      const reloadCpt = reloaded.cpts[i];
      expect(reloadCpt.variable.name).toBe(origCpt.variable.name);
      expect(reloadCpt.parents.map(p => p.name)).toEqual(origCpt.parents.map(p => p.name));
      expect(reloadCpt.table.length).toBe(origCpt.table.length);
      for (let j = 0; j < origCpt.table.length; j++) {
        expect(reloadCpt.table[j]).toBeCloseTo(origCpt.table[j], 10);
      }
    }
  });

  it('JSON round-trip produces the same inference results', () => {
    const original = BayesianNetwork.fromXmlBif(dogProblemXml);
    const json = toJSON(original);
    const reloaded = fromJSON(json);

    const origResult = original.infer();
    const reloadResult = reloaded.infer();

    for (const origVar of original.variables) {
      const reloadVar = reloaded.getVariable(origVar.name)!;
      const origDist = origResult.posteriors.get(origVar)!;
      const reloadDist = reloadResult.posteriors.get(reloadVar)!;
      for (const outcome of origVar.outcomes) {
        expect(reloadDist.get(outcome)).toBeCloseTo(origDist.get(outcome)!, 6);
      }
    }
  });

  it('JSON export contains correct edges', () => {
    const net = BayesianNetwork.fromXmlBif(dogProblemXml);
    const json = toJSON(net);

    // Dog-problem edges: family-out→light-on, bowel-problem→dog-out,
    // family-out→dog-out, dog-out→hear-bark
    expect(json.edges).toContainEqual({ from: 'family-out', to: 'light-on' });
    expect(json.edges).toContainEqual({ from: 'bowel-problem', to: 'dog-out' });
    expect(json.edges).toContainEqual({ from: 'family-out', to: 'dog-out' });
    expect(json.edges).toContainEqual({ from: 'dog-out', to: 'hear-bark' });
    expect(json.edges.length).toBe(4);
  });

  it('JSON export preserves positions', () => {
    const net = BayesianNetwork.fromXmlBif(dogProblemXml);
    const json = toJSON(net);

    const lightOn = json.variables.find(v => v.name === 'light-on')!;
    expect(lightOn.position).toEqual({ x: 73, y: 165 });
  });

  it('JSON round-trip with evidence produces matching posteriors', () => {
    const original = BayesianNetwork.fromXmlBif(dogProblemXml);
    const json = toJSON(original);
    const reloaded = fromJSON(json);

    const evidence = new Map([['hear-bark', 'true']]);
    const origResult = original.infer(evidence);
    const reloadResult = reloaded.infer(evidence);

    for (const origVar of original.variables) {
      const reloadVar = reloaded.getVariable(origVar.name)!;
      const origDist = origResult.posteriors.get(origVar)!;
      const reloadDist = reloadResult.posteriors.get(reloadVar)!;
      for (const outcome of origVar.outcomes) {
        expect(reloadDist.get(outcome)).toBeCloseTo(origDist.get(outcome)!, 6);
      }
    }
  });
});
