/** Human-readable status for networks where exact inference is not feasible. */

export interface CostLike { treewidth: number; maxCliqueEntries: number }

function fmt(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`;
  return String(n);
}

export function describeInferenceFailure(cost: CostLike | null, budget: number, fallback: string): string {
  if (!cost) return `Inference unavailable: ${fallback}. Showing structure only.`;
  return `Exact inference too expensive (treewidth ${cost.treewidth}, largest clique ${fmt(cost.maxCliqueEntries)} entries, budget ${fmt(budget)}). Showing structure only.`;
}
