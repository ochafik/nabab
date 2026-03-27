import { describe, it, expect } from 'vitest';
import { BayesianNetwork } from '../src/lib/network.js';
import {
  sensitivityAnalysis,
  mostInfluentialParameters,
  tornadoAnalysis,
} from '../src/lib/sensitivity.js';
import type { Variable, CPT } from '../src/lib/types.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ─── Helper: build the simple Rain→Wet network ───────────────────────

function rainWetNetwork(): BayesianNetwork {
  const Rain: Variable = { name: 'Rain', outcomes: ['T', 'F'] };
  const Wet: Variable = { name: 'Wet', outcomes: ['T', 'F'] };
  return new BayesianNetwork({
    name: 'RainWet',
    variables: [Rain, Wet],
    cpts: [
      { variable: Rain, parents: [], table: new Float64Array([0.2, 0.8]) },
      { variable: Wet, parents: [Rain], table: new Float64Array([0.9, 0.1, 0.1, 0.9]) },
    ],
  });
}

// ─── Helper: load dog-problem ─────────────────────────────────────────

const dogProblemXml = readFileSync(
  resolve(__dirname, '../src/example.xmlbif'),
  'utf-8',
);

function dogNetwork(): BayesianNetwork {
  return BayesianNetwork.fromXmlBif(dogProblemXml);
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('sensitivityAnalysis', () => {
  it('returns results for every CPT parameter', () => {
    const net = rainWetNetwork();
    const results = sensitivityAnalysis(net, 'Wet', 'T');

    // Rain CPT: 2 params, Wet CPT: 4 params (2 rows × 2 outcomes) = 6 total
    expect(results).toHaveLength(6);
    for (const r of results) {
      expect(typeof r.derivative).toBe('number');
      expect(typeof r.currentValue).toBe('number');
      expect(r.currentValue).toBeGreaterThanOrEqual(0);
      expect(r.currentValue).toBeLessThanOrEqual(1);
    }
  });

  it('P(Rain=T) strongly affects P(Wet=T)', () => {
    const net = rainWetNetwork();
    const results = sensitivityAnalysis(net, 'Wet', 'T');

    // Find the derivative for P(Rain=T)
    const rainT = results.find(
      r => r.variable === 'Rain' && r.outcome === 'T',
    )!;
    expect(rainT).toBeDefined();
    expect(rainT.currentValue).toBeCloseTo(0.2);

    // P(Wet=T) = 0.9 * P(Rain=T) + 0.1 * (1 - P(Rain=T))
    //          = 0.1 + 0.8 * P(Rain=T)
    // => d P(Wet=T) / d P(Rain=T) ≈ 0.8
    expect(rainT.derivative).toBeCloseTo(0.8, 1);
  });

  it('P(Wet=T|Rain=T) strongly affects P(Wet=T)', () => {
    const net = rainWetNetwork();
    const results = sensitivityAnalysis(net, 'Wet', 'T');

    // P(Wet=T|Rain=T) with parent config Rain=T
    const wetGivenRainT = results.find(
      r => r.variable === 'Wet' && r.outcome === 'T' && r.parentConfig === 'Rain=T',
    )!;
    expect(wetGivenRainT).toBeDefined();
    expect(wetGivenRainT.currentValue).toBeCloseTo(0.9);

    // P(Wet=T) = P(Wet=T|Rain=T)*P(Rain=T) + P(Wet=T|Rain=F)*P(Rain=F)
    // d P(Wet=T) / d P(Wet=T|Rain=T) = P(Rain=T) = 0.2
    expect(wetGivenRainT.derivative).toBeCloseTo(0.2, 1);
  });

  it('works with evidence', () => {
    const net = rainWetNetwork();
    const evidence = new Map([['Wet', 'T']]);
    const results = sensitivityAnalysis(net, 'Rain', 'T', evidence);

    // Should still produce results for every parameter
    expect(results).toHaveLength(6);

    // All derivatives should be finite
    for (const r of results) {
      expect(Number.isFinite(r.derivative)).toBe(true);
    }
  });
});

describe('mostInfluentialParameters', () => {
  it('ranks parameters by |derivative| descending', () => {
    const net = rainWetNetwork();
    const top = mostInfluentialParameters(net, 'Wet', 'T', 10);

    // Check sorted by |derivative| descending
    for (let i = 1; i < top.length; i++) {
      expect(Math.abs(top[i - 1].derivative)).toBeGreaterThanOrEqual(
        Math.abs(top[i].derivative) - 1e-10,
      );
    }
  });

  it('respects topN limit', () => {
    const net = rainWetNetwork();
    const top = mostInfluentialParameters(net, 'Wet', 'T', 3);
    expect(top).toHaveLength(3);
  });

  it('identifies influential parameters on dog-problem', () => {
    const net = dogNetwork();
    const top = mostInfluentialParameters(net, 'dog-out', 'true', 5);

    expect(top.length).toBe(5);
    // The most influential parameter should have a non-trivial derivative
    expect(Math.abs(top[0].derivative)).toBeGreaterThan(0.01);

    // All results should have valid fields
    for (const r of top) {
      expect(r.variable).toBeTruthy();
      expect(r.outcome).toBeTruthy();
      expect(Number.isFinite(r.derivative)).toBe(true);
    }
  });
});

describe('tornadoAnalysis', () => {
  it('produces the expected number of sweep points', () => {
    const net = rainWetNetwork();
    const tornado = tornadoAnalysis(net, 'Wet', 'T', undefined, 5);

    // 6 parameters total
    expect(tornado).toHaveLength(6);
    for (const entry of tornado) {
      expect(entry.queryValues).toHaveLength(5);
    }
  });

  it('sweep values span from 0 to 1 and produce monotonic or smooth curves', () => {
    const net = rainWetNetwork();
    const tornado = tornadoAnalysis(net, 'Wet', 'T', undefined, 5);

    // Find the sweep for P(Rain=T)
    const rainT = tornado.find(
      e => e.variable === 'Rain' && e.outcome === 'T',
    )!;
    expect(rainT).toBeDefined();

    // P(Wet=T) = 0.1 + 0.8 * P(Rain=T), so as P(Rain=T) goes from 0→1,
    // P(Wet=T) goes from 0.1→0.9 — monotonically increasing.
    for (let i = 1; i < rainT.queryValues.length; i++) {
      expect(rainT.queryValues[i]).toBeGreaterThanOrEqual(
        rainT.queryValues[i - 1] - 1e-10,
      );
    }

    // Range should be close to 0.8
    expect(rainT.range).toBeCloseTo(0.8, 1);
  });

  it('is sorted by descending range', () => {
    const net = rainWetNetwork();
    const tornado = tornadoAnalysis(net, 'Wet', 'T');

    for (let i = 1; i < tornado.length; i++) {
      expect(tornado[i - 1].range).toBeGreaterThanOrEqual(tornado[i].range - 1e-10);
    }
  });

  it('all query values are valid probabilities', () => {
    const net = dogNetwork();
    const tornado = tornadoAnalysis(net, 'dog-out', 'true', undefined, 3);

    for (const entry of tornado) {
      for (const v of entry.queryValues) {
        expect(v).toBeGreaterThanOrEqual(-1e-10);
        expect(v).toBeLessThanOrEqual(1 + 1e-10);
      }
      expect(entry.range).toBeGreaterThanOrEqual(0);
    }
  });
});
