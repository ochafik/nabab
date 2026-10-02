import { describe, it, expect } from 'vitest';
import { BayesianNetwork } from '../src/lib/network.js';
import type { Variable, Distribution } from '../src/lib/types.js';
import {
  SNAPS, snapIndex, sliderObs, multiWeightObs, targetObs, obsWeights, buildEffectiveEvidence, type VarObs,
} from '../src/viewer/evidence-model.js';
import {
  evidenceKey, previewKey, LruCache, computeDeltas, totalVariation, haloStrength, formatDelta,
  formatProbabilityOfEvidence, nearestAvailable, snapPriority, hintSide, type PosteriorsByName,
} from '../src/viewer/preview-logic.js';
import { PreviewComputer } from '../src/viewer/preview-computer.js';
import { S, setNetwork, getActive, setIntervention, interventionKey } from '../src/viewer/state.js';
import { buildSerializedState, applySerializedEvidence } from '../src/viewer/persistence.js';

const v2: Variable = { name: 'B', outcomes: ['yes', 'no'] };
const v3: Variable = { name: 'M', outcomes: ['lo', 'mid', 'hi'] };
const empty = (): VarObs => ({ enabled: false, tweaked: new Set() });

describe('snapIndex', () => {
  it('snaps to the nearest of 0/25/50/75/100%', () => {
    expect(SNAPS).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(snapIndex(0)).toBe(0);
    expect(snapIndex(0.1)).toBe(0);
    expect(snapIndex(0.13)).toBe(1);
    expect(snapIndex(0.4)).toBe(2);
    expect(snapIndex(0.7)).toBe(3);
    expect(snapIndex(0.9)).toBe(4);
    expect(snapIndex(1)).toBe(4);
  });
  it('clamps and tolerates NaN', () => {
    expect(snapIndex(-3)).toBe(0);
    expect(snapIndex(7)).toBe(4);
    expect(snapIndex(NaN)).toBe(0);
  });
});

describe('targetObs (shared by click-commit and preview)', () => {
  it('100% is hard evidence, 0% on a binary variable is the other outcome', () => {
    expect(targetObs(v2, 0, 1, empty()).hard).toBe('yes');
    expect(targetObs(v2, 0, 0, empty()).hard).toBe('no');
    expect(targetObs(v2, 1, 1, empty()).hard).toBe('no');
  });
  it('intermediate binary targets are soft evidence on the slider outcome', () => {
    const o = targetObs(v2, 0, 0.75, empty());
    expect(o.soft?.get('yes')).toBeCloseTo(0.75);
    expect(o.soft?.get('no')).toBeCloseTo(0.25);
    expect(targetObs(v2, 1, 0.75, empty()).soft?.get('yes')).toBeCloseTo(0.25);
  });
  it('multi-outcome: pins the outcome, rescales floating ones, 0% rules it out', () => {
    const o = targetObs(v3, 1, 0.5, empty());
    expect(o.soft?.get('mid')).toBeCloseTo(0.5);
    expect(o.soft?.get('lo')).toBeCloseTo(0.25);
    expect(o.soft?.get('hi')).toBeCloseTo(0.25);
    const z = targetObs(v3, 2, 0, empty());
    expect(z.soft?.get('hi')).toBe(0);
    expect(z.soft?.get('lo')).toBeCloseTo(0.5);
    expect(targetObs(v3, 0, 1, empty()).hard).toBe('lo');
  });
  it('a second tweak keeps the first pinned', () => {
    const first = multiWeightObs(v3, 0, 0.6, empty());
    const second = multiWeightObs(v3, 2, 0.1, first);
    expect(second.soft?.get('lo')).toBeCloseTo(0.6);
    expect(second.soft?.get('hi')).toBeCloseTo(0.1);
    expect(second.soft?.get('mid')).toBeCloseTo(0.3);
  });
  it('sliderObs snaps near the ends', () => {
    expect(sliderObs(v2, 0.999).hard).toBe('yes');
    expect(sliderObs(v2, 0.001).hard).toBe('no');
    expect(obsWeights(v2, sliderObs(v2, 0.3)).get('yes')).toBeCloseTo(0.3);
  });
});

describe('buildEffectiveEvidence', () => {
  const net = BayesianNetwork.fromXmlBif(`<?xml version="1.0"?><BIF VERSION="0.3"><NETWORK><NAME>t</NAME>
    <VARIABLE TYPE="nature"><NAME>A</NAME><OUTCOME>yes</OUTCOME><OUTCOME>no</OUTCOME></VARIABLE>
    <VARIABLE TYPE="nature"><NAME>C</NAME><OUTCOME>yes</OUTCOME><OUTCOME>no</OUTCOME></VARIABLE>
    <DEFINITION><FOR>A</FOR><TABLE>0.2 0.8</TABLE></DEFINITION>
    <DEFINITION><FOR>C</FOR><GIVEN>A</GIVEN><TABLE>0.9 0.1 0.1 0.9</TABLE></DEFINITION>
    </NETWORK></BIF>`);
  const A = net.getVariable('A')!;
  const priors = (): Map<Variable, Distribution> => net.infer().posteriors;
  const base = { hard: new Map<string, string>(), soft: new Map<string, Map<string, number>>(), enabled: new Set<string>(),
    getVariable: (n: string) => net.getVariable(n), getPriors: priors };

  it('applies Jeffrey: likelihood = target / prior', () => {
    const [he, se] = buildEffectiveEvidence({ ...base, soft: new Map([['A', new Map([['yes', 0.5], ['no', 0.5]])]]), enabled: new Set(['A']) });
    expect(he).toBeUndefined();
    expect(se!.get('A')!.get('yes')).toBeCloseTo(0.5 / 0.2);
    expect(se!.get('A')!.get('no')).toBeCloseTo(0.5 / 0.8);
  });
  it('override replaces the observation of one variable, leaving others', () => {
    const [he, se] = buildEffectiveEvidence({
      ...base, hard: new Map([['C', 'yes']]), enabled: new Set(['A', 'C']),
      override: { name: 'A', obs: targetObs(A, 0, 1, empty()) },
    });
    expect(he).toEqual(new Map([['C', 'yes'], ['A', 'yes']]));
    expect(se).toBeUndefined();
  });
  it('interventions suppress observations and become hard evidence', () => {
    const [he] = buildEffectiveEvidence({
      ...base, hard: new Map([['A', 'yes']]), enabled: new Set(['A']), interventions: new Map([['A', 'no']]),
    });
    expect(he).toEqual(new Map([['A', 'no']]));
  });
  it('drops disabled and stale entries', () => {
    const [he] = buildEffectiveEvidence({ ...base, hard: new Map([['A', 'maybe'], ['Z', 'x'], ['C', 'yes']]), enabled: new Set(['A', 'Z']) });
    expect(he).toBeUndefined();
  });
  it('preview matches a real inference: P(C) after A=yes', () => {
    const [he] = buildEffectiveEvidence({ ...base, override: { name: 'A', obs: targetObs(A, 0, 1, empty()) } });
    expect(net.infer(he).posteriors.get(net.getVariable('C')!)!.get('yes')).toBeCloseTo(0.9);
  });
});

describe('cache keys and LRU', () => {
  it('evidenceKey is order independent and value sensitive', () => {
    const a = evidenceKey(new Map([['x', '1'], ['y', '2']]), new Map([['z', new Map([['p', 0.5], ['q', 1]])]]));
    const b = evidenceKey(new Map([['y', '2'], ['x', '1']]), new Map([['z', new Map([['q', 1], ['p', 0.5]])]]));
    const c = evidenceKey(new Map([['y', '2'], ['x', '1']]), new Map([['z', new Map([['q', 1], ['p', 0.6]])]]));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(evidenceKey()).toBe(evidenceKey(new Map(), new Map()));
  });
  it('previewKey separates contexts (network / interventions)', () => {
    expect(previewKey('1|', new Map([['a', 'b']]))).not.toBe(previewKey('1|x=y', new Map([['a', 'b']])));
  });
  it('LruCache evicts least recently used', () => {
    const c = new LruCache<string, number>(2);
    c.set('a', 1); c.set('b', 2); c.get('a'); c.set('c', 3);
    expect(c.has('a')).toBe(true);
    expect(c.has('b')).toBe(false);
    expect(c.size).toBe(2);
  });
});

describe('deltas', () => {
  const d = (o: Record<string, number>): Distribution => new Map(Object.entries(o));
  it('computes TVD, signed deltas and the largest change', () => {
    const before: PosteriorsByName = new Map([['N', d({ a: 0.5, b: 0.3, c: 0.2 })], ['Q', d({ t: 0.5, f: 0.5 })], ['X', d({ t: 1, f: 0 })]]);
    const after: PosteriorsByName = new Map([['N', d({ a: 0.8, b: 0.1, c: 0.1 })], ['Q', d({ t: 0.5, f: 0.5 })], ['X', d({ t: 0, f: 1 })]]);
    const out = computeDeltas(before, after, new Set(['X']));
    expect(out.has('X')).toBe(false);
    const n = out.get('N')!;
    expect(n.tvd).toBeCloseTo(0.3);
    expect(n.maxOutcome).toBe('a');
    expect(n.maxDelta).toBeCloseTo(0.3);
    expect(n.deltas.get('b')).toBeCloseTo(-0.2);
    expect(out.get('Q')!.tvd).toBe(0);
    expect(haloStrength(0)).toBe(0);
    expect(haloStrength(0.3)).toBe(1);
    expect(haloStrength(0.05)).toBeGreaterThan(0);
  });
  it('totalVariation of identical or disjoint', () => {
    expect(totalVariation(d({ a: 1 }), d({ a: 1 }))).toBe(0);
    expect(totalVariation(d({ a: 1, b: 0 }), d({ a: 0, b: 1 }))).toBe(1);
  });
  it('formats', () => {
    expect(formatDelta(0.123)).toBe('+12%');
    expect(formatDelta(-0.034)).toBe('-3%');
    expect(formatDelta(0.001)).toBe('+<1%');
    expect(formatProbabilityOfEvidence(0.00032)).toBe('3.2e-4');
    expect(formatProbabilityOfEvidence(0.42)).toBe('0.42');
    expect(formatProbabilityOfEvidence(1)).toBe('1.00');
  });
  it('nearestAvailable / snapPriority', () => {
    expect(nearestAvailable(3, [0, 4])).toBe(4);
    expect(nearestAvailable(2, [])).toBe(-1);
    expect(snapPriority(3, 5)).toEqual([3, 2, 4, 1, 0]);
  });
});

describe('hintSide (floating hint placement)', () => {
  it('sits on the side opposite the pointer', () => {
    expect(hintSide(100, 1000, null)).toBe('right');
    expect(hintSide(900, 1000, null)).toBe('left');
  });
  it('has hysteresis around the middle', () => {
    expect(hintSide(550, 1000, 'right')).toBe('right');
    expect(hintSide(450, 1000, 'left')).toBe('left');
    expect(hintSide(650, 1000, 'right')).toBe('left');
    expect(hintSide(350, 1000, 'left')).toBe('right');
  });
});

describe('PreviewComputer', () => {
  const mk = (calls: string[]) => {
    const ready: string[] = [];
    const c = new PreviewComputer(async (he) => {
      calls.push([...(he ?? [])].map(([k, v]) => k + v).join());
      return new Map([['n', new Map([['t', 1]])]]);
    }, k => ready.push(k), 10, async () => {});
    return { c, ready };
  };
  const job = (k: string) => ({ key: k, he: new Map([[k, 'v']]) });

  it('computes in order, caches, and dedupes', async () => {
    const calls: string[] = [];
    const { c, ready } = mk(calls);
    c.request([job('a'), job('b'), job('a')]);
    await new Promise(r => setTimeout(r, 10));
    expect(ready).toEqual(['a', 'b']);
    expect(c.has('a')).toBe(true);
    c.request([job('a'), job('b')]);
    await new Promise(r => setTimeout(r, 10));
    expect(calls).toEqual(['av', 'bv']);
    expect(c.executed).toBe(2);
  });
  it('cancel drops queued work but caches what finished', async () => {
    const calls: string[] = [];
    const { c } = mk(calls);
    c.request([job('a'), job('b'), job('c')]);
    c.cancel();
    await new Promise(r => setTimeout(r, 10));
    expect(c.has('c')).toBe(false);
    expect(c.has('b')).toBe(false);
  });
  it('request replaces stale queue and failures become null', async () => {
    const c = new PreviewComputer(async (he) => { if (he?.has('bad')) throw new Error('x'); return new Map(); }, () => {}, 10, async () => {});
    c.request([job('a'), job('bad'), job('z')]);
    c.request([{ key: 'bad', he: new Map([['bad', 'v']]) }]);
    await new Promise(r => setTimeout(r, 10));
    expect(c.get('bad')).toBeNull();
  });
});

describe('intervention state persistence', () => {
  const xml = `<?xml version="1.0"?><BIF VERSION="0.3"><NETWORK><NAME>t</NAME>
    <VARIABLE TYPE="nature"><NAME>A</NAME><OUTCOME>yes</OUTCOME><OUTCOME>no</OUTCOME></VARIABLE>
    <VARIABLE TYPE="nature"><NAME>C</NAME><OUTCOME>yes</OUTCOME><OUTCOME>no</OUTCOME></VARIABLE>
    <DEFINITION><FOR>A</FOR><TABLE>0.2 0.8</TABLE></DEFINITION>
    <DEFINITION><FOR>C</FOR><GIVEN>A</GIVEN><TABLE>0.9 0.1 0.1 0.9</TABLE></DEFINITION>
    </NETWORK></BIF>`;

  it('round-trips interventions and drops stale ones', () => {
    setNetwork(BayesianNetwork.fromXmlBif(xml));
    S.currentSource = { type: 'custom', xmlbif: xml };
    S.hardEvidence = new Map([['C', 'yes']]);
    S.observationEnabled = new Set(['C']);
    setIntervention('A', 'no');
    const state = buildSerializedState();
    expect(state.d).toEqual({ A: 'no' });
    expect(state.h).toEqual({ C: 'yes' });

    setNetwork(BayesianNetwork.fromXmlBif(xml)); // resets interventions
    expect(S.interventions.size).toBe(0);
    applySerializedEvidence(JSON.parse(JSON.stringify(state)));
    expect([...S.interventions]).toEqual([['A', 'no']]);

    applySerializedEvidence({ ...state, d: { A: 'maybe', Zed: 'x' } });
    expect(S.interventions.size).toBe(0);
  });

  it('omits d when there are no interventions; active network is mutilated under do()', () => {
    setNetwork(BayesianNetwork.fromXmlBif(xml));
    S.currentSource = { type: 'custom', xmlbif: xml };
    expect(buildSerializedState().d).toBeUndefined();
    expect(getActive()!.net).toBe(S.network);
    setIntervention('C', 'yes');
    expect(interventionKey()).toBe('C=yes');
    const act = getActive()!;
    expect(act.net).not.toBe(S.network);
    expect(act.net.cpts.find(c => c.variable.name === 'C')!.parents).toHaveLength(0);
    expect(getActive()).toBe(act); // cached per intervention set
    setIntervention('C', null);
    expect(getActive()!.net).toBe(S.network);
  });
});
