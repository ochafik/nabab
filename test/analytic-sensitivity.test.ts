import { describe, it, expect } from 'vitest';
import { BayesianNetwork } from '../src/lib/network.js';
import { analyticSensitivity, evalCurve, variableInfluenceMap } from '../src/lib/analytic-sensitivity.js';
import { sensitivityAnalysis } from '../src/lib/sensitivity.js';

// Simple Rain → Wet network
const XMLBIF = `<?xml version="1.0"?>
<BIF VERSION="0.3"><NETWORK><NAME>RainWet</NAME>
<VARIABLE TYPE="nature"><NAME>Rain</NAME><OUTCOME>T</OUTCOME><OUTCOME>F</OUTCOME></VARIABLE>
<VARIABLE TYPE="nature"><NAME>Wet</NAME><OUTCOME>T</OUTCOME><OUTCOME>F</OUTCOME></VARIABLE>
<DEFINITION><FOR>Rain</FOR><TABLE>0.2 0.8</TABLE></DEFINITION>
<DEFINITION><FOR>Wet</FOR><GIVEN>Rain</GIVEN><TABLE>0.9 0.1 0.1 0.9</TABLE></DEFINITION>
</NETWORK></BIF>`;

describe('Analytic sensitivity', () => {
  const net = BayesianNetwork.fromXmlBif(XMLBIF);

  it('produces one result per CPT parameter', () => {
    const results = analyticSensitivity(net, 'Wet', 'T');
    // Rain: 2 outcomes × 1 config = 2; Wet: 2 outcomes × 2 configs = 4; total = 6
    expect(results.length).toBe(6);
  });

  it('derivatives match finite-difference sensitivity within tolerance', () => {
    const analytic = analyticSensitivity(net, 'Wet', 'T');
    const finiteDiff = sensitivityAnalysis(net, 'Wet', 'T');

    for (const a of analytic) {
      const fd = finiteDiff.find(
        f => f.variable === a.variable && f.outcome === a.outcome && f.parentConfig === a.parentConfig,
      );
      expect(fd).toBeDefined();
      expect(a.derivative).toBeCloseTo(fd!.derivative, 1); // within 0.05
    }
  });

  it('evalCurve reproduces the posterior at the current parameter value', () => {
    const results = analyticSensitivity(net, 'Wet', 'T');
    const basePosterior = net.query('Wet').get('T')!;

    for (const r of results) {
      const curveVal = evalCurve(r, r.currentValue);
      expect(curveVal).toBeCloseTo(basePosterior, 2);
    }
  });

  it('variableInfluenceMap aggregates max |derivative| per variable', () => {
    const results = analyticSensitivity(net, 'Wet', 'T');
    const influence = variableInfluenceMap(results);
    expect(influence.has('Rain')).toBe(true);
    expect(influence.has('Wet')).toBe(true);
    expect(influence.get('Wet')!).toBeGreaterThan(0);
  });

  it('range is non-negative', () => {
    const results = analyticSensitivity(net, 'Wet', 'T');
    for (const r of results) {
      expect(r.range).toBeGreaterThanOrEqual(0);
    }
  });
});
