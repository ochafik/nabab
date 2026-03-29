import { describe, it, expect } from 'vitest';
import { BayesianNetwork } from '../src/lib/network.js';
import { valueOfInformation, entropy } from '../src/lib/voi.js';

const XMLBIF = `<?xml version="1.0"?>
<BIF VERSION="0.3"><NETWORK><NAME>RainWet</NAME>
<VARIABLE TYPE="nature"><NAME>Rain</NAME><OUTCOME>T</OUTCOME><OUTCOME>F</OUTCOME></VARIABLE>
<VARIABLE TYPE="nature"><NAME>Wet</NAME><OUTCOME>T</OUTCOME><OUTCOME>F</OUTCOME></VARIABLE>
<DEFINITION><FOR>Rain</FOR><TABLE>0.2 0.8</TABLE></DEFINITION>
<DEFINITION><FOR>Wet</FOR><GIVEN>Rain</GIVEN><TABLE>0.9 0.1 0.1 0.9</TABLE></DEFINITION>
</NETWORK></BIF>`;

describe('entropy', () => {
  it('returns 0 for a certain distribution', () => {
    const dist = new Map([['A', 1], ['B', 0]]);
    expect(entropy(dist)).toBe(0);
  });

  it('returns 1 bit for a fair coin', () => {
    const dist = new Map([['H', 0.5], ['T', 0.5]]);
    expect(entropy(dist)).toBeCloseTo(1, 5);
  });
});

describe('Value of Information', () => {
  const net = BayesianNetwork.fromXmlBif(XMLBIF);

  it('returns results for unobserved variables', () => {
    const results = valueOfInformation(net, 'Wet');
    expect(results.length).toBe(1); // only Rain is unobserved (Wet is the query)
    expect(results[0].variable).toBe('Rain');
  });

  it('VOI is non-negative', () => {
    const results = valueOfInformation(net, 'Wet');
    for (const r of results) {
      expect(r.voi).toBeGreaterThanOrEqual(0);
    }
  });

  it('VOI is positive for an informative parent', () => {
    const results = valueOfInformation(net, 'Wet');
    // Rain is a parent of Wet with strong influence → should have positive VOI
    expect(results[0].voi).toBeGreaterThan(0.01);
  });

  it('VOI is zero when variable is already observed', () => {
    const evidence = new Map([['Rain', 'T']]);
    const results = valueOfInformation(net, 'Wet', evidence);
    // Rain is already observed → no unobserved d-connected variables
    expect(results.length).toBe(0);
  });

  it('includes per-outcome breakdown', () => {
    const results = valueOfInformation(net, 'Wet');
    const rain = results[0];
    expect(rain.outcomes.length).toBe(2);
    const totalProb = rain.outcomes.reduce((s, o) => s + o.probability, 0);
    expect(totalProb).toBeCloseTo(1, 5);
  });
});
