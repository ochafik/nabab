#!/bin/bash
# Run benchmarks across all models and display a comparison table.
#
# Usage:
#   ./compare.sh              # Run all models, display table
#   ./compare.sh --json       # Output raw JSON
#   ./compare.sh --save NAME  # Save results to bench/results/NAME.json
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RESULTS_DIR="$SCRIPT_DIR/results"

OUTPUT_FORMAT="table"
SAVE_NAME=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --json) OUTPUT_FORMAT="json"; shift ;;
    --save) SAVE_NAME="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# Run benchmarks (stderr has progress, stdout has JSON)
JSON=$(npx tsx "$SCRIPT_DIR/run-bench.ts" 2>/dev/null)

if [[ "$OUTPUT_FORMAT" == "json" ]]; then
  echo "$JSON"
  exit 0
fi

# Save if requested
if [[ -n "$SAVE_NAME" ]]; then
  mkdir -p "$RESULTS_DIR"
  echo "$JSON" > "$RESULTS_DIR/$SAVE_NAME.json"
  echo "Saved to $RESULTS_DIR/$SAVE_NAME.json"
fi

# Display table
echo ""
echo "=== nabab Benchmark Results ==="
echo ""
printf "%-12s %5s %5s %3s %3s %9s %9s %9s %9s\n" \
  "Model" "Nodes" "Edges" "TW" "MCS" "Parse" "Build JT" "Infer" "Total"
printf "%-12s %5s %5s %3s %3s %9s %9s %9s %9s\n" \
  "────────────" "─────" "─────" "───" "───" "─────────" "─────────" "─────────" "─────────"

echo "$JSON" | npx tsx -e '
import { stdin } from "process";

let data = "";
stdin.setEncoding("utf-8");
stdin.on("data", (chunk: string) => data += chunk);
stdin.on("end", () => {
  const results = JSON.parse(data);
  for (const r of results) {
    const total = r.timings.parseMs + r.timings.buildJTMs + r.timings.priorInferMs;
    const fmt = (n: number) => n < 1 ? n.toFixed(3) + "ms" : n < 1000 ? n.toFixed(1) + "ms" : (n/1000).toFixed(2) + "s ";
    console.log(
      r.model.padEnd(12) + " " +
      String(r.nodes).padStart(5) + " " +
      String(r.edges).padStart(5) + " " +
      String(r.treewidth).padStart(3) + " " +
      String(r.maxCliqueSize).padStart(3) + " " +
      fmt(r.timings.parseMs).padStart(9) + " " +
      fmt(r.timings.buildJTMs).padStart(9) + " " +
      fmt(r.timings.priorInferMs).padStart(9) + " " +
      fmt(total).padStart(9)
    );
  }
});
'

echo ""

# Show evidence inference timings
echo "Evidence inference timings (ms):"
printf "%-12s %s\n" "Model" "Scenarios"
printf "%-12s %s\n" "────────────" "─────────────────────────────────────────"

echo "$JSON" | npx tsx -e '
import { stdin } from "process";

let data = "";
stdin.setEncoding("utf-8");
stdin.on("data", (chunk: string) => data += chunk);
stdin.on("end", () => {
  const results = JSON.parse(data);
  for (const r of results) {
    const timings = r.timings.evidenceInferMs.map((t: number) =>
      t < 1 ? t.toFixed(3) : t.toFixed(1)
    ).join(", ");
    console.log(r.model.padEnd(12) + " " + timings);
  }
});
'
