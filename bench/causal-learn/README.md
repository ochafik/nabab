# Causal-Learn Cross-Validation

Generates reference structure-learning results from Python's [causal-learn](https://github.com/py-why/causal-learn) library, for cross-validation with nabab's TypeScript structure learning (HC+BIC and GES+BIC).

## Setup

```bash
pip install -r requirements.txt
```

## Run

```bash
python generate-ground-truth.py
```

## Output

Results are written to `results/`:

| File | Description |
|------|-------------|
| `{name}_data.csv` | Generated data (CSV with header row) |
| `{name}_true.json` | True adjacency matrix of the generating BN |
| `{name}_pc.json` | PC algorithm result (adjacency matrix + edge list) |
| `{name}_ges.json` | GES algorithm result (adjacency matrix + edge list) |

### JSON format

```json
{
  "nodes": ["A", "B", "C"],
  "matrix": [[0, 1, 0], [0, 0, 1], [0, 0, 0]],
  "edges": [
    { "from": "A", "to": "B", "type": "directed" },
    { "from": "B", "to": "C", "type": "directed" }
  ]
}
```

- `matrix[i][j] = 1` means there is an edge from `nodes[i]` to `nodes[j]`
- Edge types: `"directed"` (arrow), `"undirected"` (line), `"bidirected"` (double arrow)

### Test scenarios

| Name | Structure | Vars | Samples |
|------|-----------|------|---------|
| `chain` | A -> B -> C | 3 | 1000 |
| `v_structure` | A -> C <- B | 3 | 1000 |
| `diamond` | A -> B, A -> C, B -> D, C -> D | 4 | 2000 |
| `alarm5` | 5 vars with mixed structure | 5 | 2000 |

All scenarios use binary variables and a fixed random seed (42) for reproducibility.

## Cross-validation

After generating the Python results, run nabab's cross-validation test:

```bash
cd /path/to/nabab
npx vitest run test/cross-validate-structure.test.ts
```

The test loads the CSV data, runs nabab's HC and GES learners on it, and compares results using structural Hamming distance (SHD).
