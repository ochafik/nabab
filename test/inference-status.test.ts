import { describe, it, expect } from 'vitest';
import { describeInferenceFailure } from '../src/viewer/inference-status.js';

describe('describeInferenceFailure', () => {
  it('reports treewidth and clique size', () => {
    const m = describeInferenceFailure({ treewidth: 11, maxCliqueEntries: 274_400_000 }, 32_000_000, 'x');
    expect(m).toContain('treewidth 11');
    expect(m).toContain('274.4M');
    expect(m).toContain('32.0M');
  });
  it('falls back to the error message', () => {
    expect(describeInferenceFailure(null, 1, 'boom')).toContain('boom');
  });
});
