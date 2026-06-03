import { describe, it, expect } from './runner.js';
import { tspWithMatrix, clusterUnvisited } from '../js/solver.js';

describe('tspWithMatrix', () => {
  it('returns all nodes with a 4-node identity matrix', () => {
    const matrix = [
      [0, 1, 1, 1],
      [1, 0, 1, 1],
      [1, 1, 0, 1],
      [1, 1, 1, 0]
    ];
    const result = tspWithMatrix([0, 1, 2, 3], matrix, 0);
    const sorted = [...result].sort((a, b) => a - b);
    expect(sorted).toEqual([0, 1, 2, 3]);
  });

  it('starts at the specified origin', () => {
    const matrix = [
      [0, 2, 9, 10],
      [1, 0, 6, 4],
      [15, 7, 0, 8],
      [6, 3, 12, 0]
    ];
    const result = tspWithMatrix([0, 1, 2, 3], matrix, 2);
    expect(result[0]).toBe(2);
  });

  it('result length equals input length (no duplicates/missing)', () => {
    const matrix = [
      [0, 5, 3, 7],
      [5, 0, 4, 6],
      [3, 4, 0, 2],
      [7, 6, 2, 0]
    ];
    const result = tspWithMatrix([0, 1, 2, 3], matrix, 0);
    expect(result.length).toBe(4);
    const unique = new Set(result);
    expect(unique.size).toBe(4);
  });
});

describe('clusterUnvisited', () => {
  it('k=2 with 6 points produces 2 non-empty clusters', () => {
    // Create a matrix where first 3 nodes are close to each other, last 3 are close to each other
    const n = 6;
    const matrix = Array.from({ length: n }, () => Array(n).fill(100));
    for (let i = 0; i < n; i++) matrix[i][i] = 0;
    // Group 1: nodes 0,1,2 — short distances between them
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (i !== j) matrix[i][j] = 1;
    // Group 2: nodes 3,4,5 — short distances between them
    for (let i = 3; i < 6; i++) for (let j = 3; j < 6; j++) if (i !== j) matrix[i][j] = 1;

    const clusters = clusterUnvisited([0, 1, 2, 3, 4, 5], 2, matrix);
    expect(clusters.length).toBe(2);
    expect(clusters[0].length).toBeGreaterThan(0);
    expect(clusters[1].length).toBeGreaterThan(0);
  });

  it('k=1 returns single cluster with all indices', () => {
    const matrix = [
      [0, 1, 1],
      [1, 0, 1],
      [1, 1, 0]
    ];
    const clusters = clusterUnvisited([0, 1, 2], 1, matrix);
    expect(clusters.length).toBe(1);
    expect(clusters[0].sort((a, b) => a - b)).toEqual([0, 1, 2]);
  });
});
