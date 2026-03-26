import { describe, it, expect } from 'vitest';
import {
  buildDirectedGraph,
  moralize,
  triangulate,
  findMaximalCliques,
  buildJunctionTree,
} from '../src/lib/graph.js';
import type { Variable } from '../src/lib/types.js';

const A: Variable = { name: 'A', outcomes: ['t', 'f'] };
const B: Variable = { name: 'B', outcomes: ['t', 'f'] };
const C: Variable = { name: 'C', outcomes: ['t', 'f'] };
const D: Variable = { name: 'D', outcomes: ['t', 'f'] };

describe('Graph', () => {
  it('builds a directed graph', () => {
    const dag = buildDirectedGraph([A, B, C], [[A, B], [A, C]]);
    expect(dag.vertices).toEqual([A, B, C]);
    expect(dag.children.get(A)).toEqual(new Set([B, C]));
    expect(dag.parents.get(B)).toEqual(new Set([A]));
  });

  it('moralizes a DAG', () => {
    // A->C, B->C → moralize should connect A-B (co-parents)
    const dag = buildDirectedGraph([A, B, C], [[A, C], [B, C]]);
    const moral = moralize(dag);
    expect(moral.neighbors.get(A)!.has(B)).toBe(true);
    expect(moral.neighbors.get(A)!.has(C)).toBe(true);
    expect(moral.neighbors.get(B)!.has(C)).toBe(true);
  });

  it('triangulates', () => {
    // A-B, B-C, C-D, D-A creates a 4-cycle, triangulation should add A-C or B-D
    const dag = buildDirectedGraph([A, B, C, D], [[A, B], [B, C], [C, D], [D, A]]);
    const moral = moralize(dag);
    const tri = triangulate(moral);
    // After triangulation, every 4-cycle should have a chord
    // Check that some diagonal exists
    const hasAC = tri.neighbors.get(A)!.has(C);
    const hasBD = tri.neighbors.get(B)!.has(D);
    expect(hasAC || hasBD).toBe(true);
  });

  it('finds maximal cliques', () => {
    // Complete graph on 3 vertices should have one clique of size 3
    const dag = buildDirectedGraph([A, B, C], [[A, B], [A, C], [B, C]]);
    const moral = moralize(dag);
    const tri = triangulate(moral);
    const cliques = findMaximalCliques(tri);
    // Should find a clique containing all 3
    const hasTriple = cliques.some(c => c.length === 3);
    expect(hasTriple).toBe(true);
  });

  it('builds a junction tree', () => {
    // Simple chain: A -> B -> C
    const dag = buildDirectedGraph([A, B, C], [[A, B], [B, C]]);
    const jt = buildJunctionTree(dag);
    expect(jt.cliques.length).toBeGreaterThan(0);
    // Should be a tree: edges = cliques - 1
    let totalEdges = 0;
    for (const ns of jt.neighbors.values()) totalEdges += ns.size;
    totalEdges /= 2; // undirected
    expect(totalEdges).toBe(jt.cliques.length - 1);
  });

  it('builds a junction tree for v-structure', () => {
    // A -> C <- B (v-structure, moralization creates A-B edge)
    const dag = buildDirectedGraph([A, B, C], [[A, C], [B, C]]);
    const jt = buildJunctionTree(dag);
    expect(jt.cliques.length).toBeGreaterThan(0);
    // All three variables should appear in at least one clique
    const allVars = new Set(jt.cliques.flat());
    expect(allVars.has(A)).toBe(true);
    expect(allVars.has(B)).toBe(true);
    expect(allVars.has(C)).toBe(true);
  });
});
