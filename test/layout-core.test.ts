import { describe, it, expect } from 'vitest';
import { computeLayout } from '../src/viewer/layout-core.js';
import { hitTestNode, type NodeGeom, type BarGeom } from '../src/viewer/bar-registry.js';

describe('computeLayout', () => {
  it('places parents above children, one centre per node', () => {
    const r = computeLayout({ names: ['a', 'b', 'c'], w: [100, 100, 100], h: [50, 50, 50], edges: [[0, 1], [0, 2]] });
    expect(r.x).toHaveLength(3);
    expect(r.y[0]).toBeLessThan(r.y[1]);
    expect(r.y[0]).toBeLessThan(r.y[2]);
    expect(r.width).toBeGreaterThan(0);
  });
});

describe('hitTestNode', () => {
  const bar = (idx: number, by: number, hidden = false): BarGeom =>
    ({ outcome: `o${idx}`, idx, val: 0.5, x0: 0, range: 100, bx: 0, bw: 100, by, barH: 6, labelX: null, hidden });
  const node = { bars: [bar(0, 0), bar(1, -1e6, true), bar(2, 24)] } as unknown as NodeGeom;
  it('never hits a hidden (capped) outcome and keeps bars aligned with outcome indexes', () => {
    expect(hitTestNode(node, 50, 3)?.bar.idx).toBe(0);
    expect(hitTestNode(node, 50, 27)?.bar.idx).toBe(2);
    expect(hitTestNode(node, 50, -1e6 + 2)).toBeNull();
    expect(node.bars[2].idx).toBe(2);
  });
});
