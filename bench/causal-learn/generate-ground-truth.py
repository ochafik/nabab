#!/usr/bin/env python3
"""
Generate reference structure-learning results using causal-learn (Python).

This script generates data from known Bayesian network structures,
runs PC and GES algorithms on the data, and saves the results as JSON
for cross-validation with nabab's TypeScript structure-learning code.

Usage:
    pip install causal-learn numpy
    python generate-ground-truth.py
"""

import json
import os
import sys
import numpy as np

# ---- Scenario definitions ----
# Each scenario: name, node names, true edges (parent -> child), sample count


def define_scenarios():
    return [
        {
            "name": "chain",
            "description": "Simple chain: A -> B -> C",
            "nodes": ["A", "B", "C"],
            "edges": [("A", "B"), ("B", "C")],
            "cpts": {
                # P(A): binary
                "A": {"parents": [], "table": [0.4, 0.6]},
                # P(B|A): table[parent_config * child_card + child_val]
                # P(B=0|A=0)=0.9, P(B=1|A=0)=0.1, P(B=0|A=1)=0.2, P(B=1|A=1)=0.8
                "B": {"parents": ["A"], "table": [0.9, 0.1, 0.2, 0.8]},
                # P(C|B)
                "C": {"parents": ["B"], "table": [0.8, 0.2, 0.3, 0.7]},
            },
            "n_samples": 1000,
        },
        {
            "name": "v_structure",
            "description": "V-structure: A -> C <- B",
            "nodes": ["A", "B", "C"],
            "edges": [("A", "C"), ("B", "C")],
            "cpts": {
                "A": {"parents": [], "table": [0.5, 0.5]},
                "B": {"parents": [], "table": [0.5, 0.5]},
                # P(C|A,B): parents order [A, B], child C
                # A=0,B=0: P(C=0)=0.95, P(C=1)=0.05
                # A=0,B=1: P(C=0)=0.3,  P(C=1)=0.7
                # A=1,B=0: P(C=0)=0.3,  P(C=1)=0.7
                # A=1,B=1: P(C=0)=0.05, P(C=1)=0.95
                "C": {
                    "parents": ["A", "B"],
                    "table": [0.95, 0.05, 0.3, 0.7, 0.3, 0.7, 0.05, 0.95],
                },
            },
            "n_samples": 1000,
        },
        {
            "name": "diamond",
            "description": "Diamond: A -> B, A -> C, B -> D, C -> D",
            "nodes": ["A", "B", "C", "D"],
            "edges": [("A", "B"), ("A", "C"), ("B", "D"), ("C", "D")],
            "cpts": {
                "A": {"parents": [], "table": [0.5, 0.5]},
                "B": {"parents": ["A"], "table": [0.8, 0.2, 0.2, 0.8]},
                "C": {"parents": ["A"], "table": [0.7, 0.3, 0.3, 0.7]},
                # P(D|B,C)
                "D": {
                    "parents": ["B", "C"],
                    "table": [0.95, 0.05, 0.4, 0.6, 0.4, 0.6, 0.1, 0.9],
                },
            },
            "n_samples": 2000,
        },
        {
            "name": "alarm5",
            "description": "Alarm-like: 5 vars with mixed structure (A->B, A->C, B->D, C->D, C->E)",
            "nodes": ["A", "B", "C", "D", "E"],
            "edges": [("A", "B"), ("A", "C"), ("B", "D"), ("C", "D"), ("C", "E")],
            "cpts": {
                "A": {"parents": [], "table": [0.6, 0.4]},
                "B": {"parents": ["A"], "table": [0.85, 0.15, 0.2, 0.8]},
                "C": {"parents": ["A"], "table": [0.7, 0.3, 0.25, 0.75]},
                # P(D|B,C)
                "D": {
                    "parents": ["B", "C"],
                    "table": [0.9, 0.1, 0.35, 0.65, 0.35, 0.65, 0.05, 0.95],
                },
                # P(E|C)
                "E": {"parents": ["C"], "table": [0.8, 0.2, 0.15, 0.85]},
            },
            "n_samples": 2000,
        },
    ]


def sample_data(scenario, rng):
    """Sample binary data from a known BN structure using forward sampling."""
    nodes = scenario["nodes"]
    cpts = scenario["cpts"]
    n = scenario["n_samples"]
    edges = scenario["edges"]

    # Topological order: nodes with no parents first
    parent_map = {node: cpts[node]["parents"] for node in nodes}
    order = []
    visited = set()
    def topo_visit(node):
        if node in visited:
            return
        for p in parent_map[node]:
            topo_visit(p)
        visited.add(node)
        order.append(node)
    for node in nodes:
        topo_visit(node)

    data = {node: np.zeros(n, dtype=int) for node in nodes}
    node_idx = {node: i for i, node in enumerate(nodes)}

    for row in range(n):
        for node in order:
            cpt_info = cpts[node]
            parents = cpt_info["parents"]
            table = cpt_info["table"]
            card = 2  # binary

            # Compute parent configuration index
            pa_idx = 0
            stride = 1
            for p in reversed(parents):
                pa_idx += int(data[p][row]) * stride
                stride *= 2  # binary

            # P(node=0|parents) and P(node=1|parents)
            p0 = table[pa_idx * card + 0]
            # sample
            if rng.random() < p0:
                data[node][row] = 0
            else:
                data[node][row] = 1

    return data


def make_adjacency_matrix(nodes, edges):
    """Create adjacency matrix from edge list. matrix[i][j]=1 means i->j."""
    n = len(nodes)
    idx = {name: i for i, name in enumerate(nodes)}
    matrix = [[0] * n for _ in range(n)]
    for src, dst in edges:
        matrix[idx[src]][idx[dst]] = 1
    return matrix


def causal_learn_matrix_to_edges(graph_matrix, nodes):
    """
    Convert causal-learn's GeneralGraph adjacency matrix to an edge list.

    causal-learn encodes edges in a pair-based format:
      graph[i][j] = -1, graph[j][i] = 1   means  i -> j
      graph[i][j] = -1, graph[j][i] = -1  means  i --- j  (undirected)
      graph[i][j] =  1, graph[j][i] =  1  means  i <-> j  (bidirected)
    """
    n = len(nodes)
    edges = []
    adj_matrix = [[0] * n for _ in range(n)]

    for i in range(n):
        for j in range(i + 1, n):
            if graph_matrix[i][j] == -1 and graph_matrix[j][i] == 1:
                # i -> j
                edges.append({"from": nodes[i], "to": nodes[j], "type": "directed"})
                adj_matrix[i][j] = 1
            elif graph_matrix[i][j] == 1 and graph_matrix[j][i] == -1:
                # j -> i
                edges.append({"from": nodes[j], "to": nodes[i], "type": "directed"})
                adj_matrix[j][i] = 1
            elif graph_matrix[i][j] == -1 and graph_matrix[j][i] == -1:
                # undirected i --- j
                edges.append({"from": nodes[i], "to": nodes[j], "type": "undirected"})
                # Mark both directions in the adjacency matrix for undirected
                adj_matrix[i][j] = 1
                adj_matrix[j][i] = 1
            elif graph_matrix[i][j] == 1 and graph_matrix[j][i] == 1:
                # bidirected i <-> j
                edges.append({"from": nodes[i], "to": nodes[j], "type": "bidirected"})
                adj_matrix[i][j] = 1
                adj_matrix[j][i] = 1

    return edges, adj_matrix


def run_scenario(scenario, results_dir, rng):
    """Run a single scenario: generate data, run PC and GES, save results."""
    name = scenario["name"]
    nodes = scenario["nodes"]
    true_edges = scenario["edges"]
    n_samples = scenario["n_samples"]

    print(f"\n{'='*60}")
    print(f"Scenario: {name} — {scenario['description']}")
    print(f"  Nodes: {nodes}")
    print(f"  True edges: {true_edges}")
    print(f"  Samples: {n_samples}")

    # 1. Generate data
    data = sample_data(scenario, rng)

    # Save CSV
    csv_path = os.path.join(results_dir, f"{name}_data.csv")
    with open(csv_path, "w") as f:
        f.write(",".join(nodes) + "\n")
        for row in range(n_samples):
            f.write(",".join(str(data[node][row]) for node in nodes) + "\n")
    print(f"  Saved data: {csv_path}")

    # 2. Save true structure
    true_matrix = make_adjacency_matrix(nodes, true_edges)
    true_json = {
        "nodes": nodes,
        "matrix": true_matrix,
        "edges": [{"from": e[0], "to": e[1], "type": "directed"} for e in true_edges],
    }
    true_path = os.path.join(results_dir, f"{name}_true.json")
    with open(true_path, "w") as f:
        json.dump(true_json, f, indent=2)
    print(f"  Saved true structure: {true_path}")

    # 3. Prepare data matrix for causal-learn (numeric array)
    data_array = np.column_stack([data[node] for node in nodes])

    # 4. Run PC algorithm
    print(f"  Running PC algorithm (chi-squared test)...")
    try:
        from causallearn.search.ConstraintBased.PC import pc

        pc_result = pc(
            data_array,
            alpha=0.05,
            indep_test="chisq",
            stable=True,
            node_names=nodes,
        )
        pc_graph_matrix = pc_result.G.graph.tolist()
        pc_edges, pc_adj = causal_learn_matrix_to_edges(pc_graph_matrix, nodes)

        pc_json = {
            "algorithm": "PC",
            "parameters": {"alpha": 0.05, "indep_test": "chisq"},
            "nodes": nodes,
            "matrix": pc_adj,
            "edges": pc_edges,
            "raw_matrix": pc_graph_matrix,
        }
        pc_path = os.path.join(results_dir, f"{name}_pc.json")
        with open(pc_path, "w") as f:
            json.dump(pc_json, f, indent=2)
        print(f"  Saved PC result: {pc_path}")
        print(f"    PC edges: {pc_edges}")
    except Exception as e:
        print(f"  PC algorithm failed: {e}")

    # 5. Run GES algorithm
    print(f"  Running GES algorithm...")
    try:
        from causallearn.search.ScoreBased.GES import ges

        ges_result = ges(
            data_array,
            score_func="local_score_BIC",
            node_names=nodes,
        )
        ges_graph_matrix = ges_result["G"].graph.tolist()
        ges_edges, ges_adj = causal_learn_matrix_to_edges(ges_graph_matrix, nodes)

        ges_json = {
            "algorithm": "GES",
            "parameters": {"score_func": "local_score_BIC"},
            "nodes": nodes,
            "matrix": ges_adj,
            "edges": ges_edges,
            "raw_matrix": ges_graph_matrix,
        }
        ges_path = os.path.join(results_dir, f"{name}_ges.json")
        with open(ges_path, "w") as f:
            json.dump(ges_json, f, indent=2)
        print(f"  Saved GES result: {ges_path}")
        print(f"    GES edges: {ges_edges}")
    except Exception as e:
        print(f"  GES algorithm failed: {e}")


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    results_dir = os.path.join(script_dir, "results")
    os.makedirs(results_dir, exist_ok=True)

    # Fixed seed for reproducibility
    rng = np.random.default_rng(seed=42)

    scenarios = define_scenarios()
    print(f"Generating ground truth for {len(scenarios)} scenarios...")

    for scenario in scenarios:
        run_scenario(scenario, results_dir, rng)

    print(f"\n{'='*60}")
    print(f"Done. Results saved to: {results_dir}")
    print(f"\nExpected output format:")
    print(f"  {{name}}_data.csv  — generated data (header + rows)")
    print(f"  {{name}}_true.json — true adjacency matrix")
    print(f"  {{name}}_pc.json   — PC algorithm result")
    print(f"  {{name}}_ges.json  — GES algorithm result")
    print(f"\nJSON format:")
    print(f'  {{ "nodes": ["A","B",...], "matrix": [[0,1,...],[...]], "edges": [...] }}')
    print(f"  matrix[i][j]=1 means edge from nodes[i] to nodes[j]")


if __name__ == "__main__":
    main()
