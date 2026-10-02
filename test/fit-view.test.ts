import { describe, it, expect } from 'vitest';
import { boundsOf, computeFit, MIN_ZOOM, MAX_FIT_ZOOM } from '../src/viewer/fit-view.js';

describe('fit-view', () => {
  it('bounds of nothing is null', () => expect(boundsOf([])).toBeNull());
  it('computes bounds of centred rects', () => {
    expect(boundsOf([{ x: 0, y: 0, w: 10, h: 10 }, { x: 100, y: 50, w: 20, h: 20 }]))
      .toEqual({ minX: -5, minY: -5, maxX: 110, maxY: 60 });
  });
  it('centres the box and scales to fit', () => {
    const f = computeFit({ minX: 0, minY: 0, maxX: 940, maxY: 440 }, 500, 250, 30);
    expect(f.k).toBeCloseTo(0.5);
    expect(470 * f.k + f.x).toBeCloseTo(250);
    expect(220 * f.k + f.y).toBeCloseTo(125);
  });
  it('does not zoom in past the cap for tiny graphs', () => {
    expect(computeFit({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, 1000, 1000).k).toBe(MAX_FIT_ZOOM);
  });
  it('handles extremely wide graphs (pathfinder is ~15000px) without clamping to 0.1', () => {
    const f = computeFit({ minX: 0, minY: 0, maxX: 15400, maxY: 3000 }, 1400, 690);
    expect(f.k).toBeLessThan(0.1);
    expect(f.k).toBeGreaterThanOrEqual(MIN_ZOOM);
  });
});
