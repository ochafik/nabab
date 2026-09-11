import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BayesianNetwork } from '../src/lib/network.js';
import { forwardSample, likelihoodWeighting } from '../src/lib/sampling.js';
import { valueOfInformation, multiQueryVOI } from '../src/lib/voi.js';
import { isDSeparated } from '../src/lib/d-separation.js';
import { infer } from '../src/lib/inference.js';
import {
  sampledMutualInformation,
  sampledInformationGainRanking,
  sampledCriticality,
} from '../src/lib/sample-voi.js';
import type { Variable, CPT } from '../src/lib/types.js';

const MODELS_DIR = join(import.meta.dirname, '..', 'bench', 'models');
const asia = BayesianNetwork.fromBif(readFileSync(join(MODELS_DIR, 'asia.bif'), 'utf-8'));
const N = 20000;
const TOL = 0.02;

const names = asia.variables.map(v => v.name);

describe('sampledMutualInformation', () => {
  it('is ~0 for independent variables and ~1 bit for a copy', () => {
    const X: Variable = { name: 'X', outcomes: ['a', 'b'] };
    const Y: Variable = { name: 'Y', outcomes: ['a', 'b'] };
    const Z: Variable = { name: 'Z', outcomes: ['a', 'b'] };
    const cpts: CPT[] = [
      { variable: X, parents: [], table: new Float64Array([0.5, 0.5]) },
      { variable: Y, parents: [X], table: new Float64Array([1, 0, 0, 1]) },
      { variable: Z, parents: [], table: new Float64Array([0.5, 0.5]) },
    ];
    const r = forwardSample([X, Y, Z], cpts, N, { seed: 1 });
    expect(sampledMutualInformation(r, 'X', ['Y'])).toBeCloseTo(1, 1);
    expect(sampledMutualInformation(r, 'X', ['Z'])).toBeLessThan(TOL);
    // Joint of B: I(X; Y,Z) = I(X; Y) = 1.
    expect(sampledMutualInformation(r, 'X', ['Y', 'Z'])).toBeCloseTo(1, 1);
  });

  it('matches exact VOI on Asia', () => {
    const r = forwardSample(asia.variables, asia.cpts, N, { seed: 2 });
    const exact = valueOfInformation(asia, 'dysp');
    for (const e of exact) {
      expect(Math.abs(sampledMutualInformation(r, e.variable, ['dysp']) - e.voi)).toBeLessThan(TOL);
    }
  });

  it('returns 0 when there is no weight', () => {
    const A: Variable = { name: 'A', outcomes: ['T', 'F'] };
    const cpts: CPT[] = [{ variable: A, parents: [], table: new Float64Array([1, 0]) }];
    const r = likelihoodWeighting([A], cpts, new Map([['A', 'F']]), undefined, 10, { seed: 1 });
    expect(sampledMutualInformation(r, 'A', ['A'])).toBe(0);
  });
});

describe('sampledInformationGainRanking', () => {
  it('agrees with exact valueOfInformation ordering for the top candidates (no evidence)', () => {
    const r = forwardSample(asia.variables, asia.cpts, N, { seed: 3 });
    const exact = valueOfInformation(asia, 'dysp');
    const exactVoi = new Map(exact.map(e => [e.variable, e.voi]));
    const ranked = sampledInformationGainRanking(r, names, ['dysp']);
    expect(ranked.some(e => e.variable === 'dysp')).toBe(false);
    for (let i = 0; i < 3; i++) {
      // The sampled i-th pick must be as good (exactly) as the exact i-th pick, up to tolerance.
      expect(exactVoi.get(ranked[i].variable)! + TOL).toBeGreaterThanOrEqual(exact[i].voi);
      expect(Math.abs(ranked[i].bits - exactVoi.get(ranked[i].variable)!)).toBeLessThan(TOL);
    }
  });

  it('agrees with exact valueOfInformation ordering under evidence', () => {
    const evidence = new Map([['smoke', 'yes']]);
    const r = likelihoodWeighting(asia.variables, asia.cpts, evidence, undefined, N, { seed: 4 });
    const exact = valueOfInformation(asia, 'either', evidence);
    const exactVoi = new Map(exact.map(e => [e.variable, e.voi]));
    const candidates = names.filter(n => n !== 'smoke');
    const ranked = sampledInformationGainRanking(r, candidates, ['either']);
    for (let i = 0; i < 3; i++) {
      expect(exactVoi.get(ranked[i].variable)! + TOL).toBeGreaterThanOrEqual(exact[i].voi);
    }
  });

  it('multi-target ranking is monotone with exact multiQueryVOI for the top pick', () => {
    // multiQueryVOI sums per-target VOI, sampled MI uses the joint; the top
    // candidate should still be a top candidate in both (allow ties).
    const r = forwardSample(asia.variables, asia.cpts, N, { seed: 5 });
    const targets = ['xray', 'dysp'];
    const exact = multiQueryVOI(asia, targets);
    const ranked = sampledInformationGainRanking(r, names, targets);
    expect(ranked.every(e => !targets.includes(e.variable))).toBe(true);
    const top = new Set(exact.slice(0, 3).map(e => e.variable));
    expect(top.has(ranked[0].variable)).toBe(true);
    for (let i = 1; i < ranked.length; i++) expect(ranked[i].bits).toBeLessThanOrEqual(ranked[i - 1].bits);
  });
});

describe('sampledCriticality', () => {
  it('is ~0 for variables d-separated from the target', () => {
    const r = forwardSample(asia.variables, asia.cpts, N, { seed: 6 });
    const crit = sampledCriticality(r, names, 'lung', 'yes');
    for (const c of crit) {
      if (isDSeparated(asia, c.variable, 'lung', [])) {
        expect(Math.abs(c.drop)).toBeLessThan(TOL);
      }
    }
    // Sanity: at least one d-separated candidate was checked.
    expect(names.some(n => n !== 'lung' && isDSeparated(asia, n, 'lung', []))).toBe(true);
  });

  it('matches exact conditional drops and sorts by drop', () => {
    const r = forwardSample(asia.variables, asia.cpts, N, { seed: 7 });
    const crit = sampledCriticality(r, names, 'dysp', 'yes', v => 'no');
    const pBase = infer(asia.variables, asia.cpts).posteriors.get(asia.getVariable('dysp')!)!.get('yes')!;
    for (const c of crit) {
      expect(c.nullOutcome).toBe('no');
      expect(Math.abs(c.pBase - pBase)).toBeLessThan(TOL);
      const exact = infer(asia.variables, asia.cpts, new Map([[c.variable, 'no']]))
        .posteriors.get(asia.getVariable('dysp')!)!.get('yes')!;
      expect(Math.abs(c.pGivenNull - exact)).toBeLessThan(TOL);
      expect(Math.abs(c.drop - (pBase - exact))).toBeLessThan(TOL);
    }
    for (let i = 1; i < crit.length; i++) expect(crit[i].drop).toBeLessThanOrEqual(crit[i - 1].drop);
    // bronc=no and either=no are the big killers of dysp=yes.
    expect(['bronc', 'either']).toContain(crit[0].variable);
  });

  it('skips the target itself and reports NaN when the null outcome never occurs', () => {
    const r = likelihoodWeighting(asia.variables, asia.cpts, new Map([['asia', 'yes']]), undefined, 100, { seed: 8 });
    const crit = sampledCriticality(r, ['asia', 'dysp', 'tub'], 'dysp', 'yes', () => 'no');
    expect(crit.some(c => c.variable === 'dysp')).toBe(false);
    const a = crit.find(c => c.variable === 'asia')!;
    expect(Number.isNaN(a.pGivenNull)).toBe(true);
    expect(a.drop).toBe(0);
  });
});
