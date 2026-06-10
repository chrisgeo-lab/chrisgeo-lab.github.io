import { describe, it, expect } from './runner.js';
import { tspWithMatrix, clusterUnvisited } from '../js/solver.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function routeCost(route, matrix) {
  let c = 0;
  for (let i = 0; i < route.length - 1; i++) c += matrix[route[i]][route[i + 1]];
  return c;
}

function nearestNeighbor(indices, matrix, startIdx) {
  const vis = new Set([startIdx]);
  const route = [startIdx];
  while (route.length < indices.length) {
    const last = route[route.length - 1];
    let bi = -1, bd = Infinity;
    for (const i of indices) {
      if (vis.has(i)) continue;
      if (matrix[last][i] < bd) { bd = matrix[last][i]; bi = i; }
    }
    if (bi === -1) break;
    vis.add(bi); route.push(bi);
  }
  return route;
}

// Produce a symmetric cost matrix from 2D coordinates (Euclidean).
function makeMatrix(coords) {
  const n = coords.length;
  const m = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const dx = coords[i][0] - coords[j][0];
      const dy = coords[i][1] - coords[j][1];
      m[i][j] = Math.hypot(dx, dy);
    }
  }
  return m;
}

// ---------------------------------------------------------------------------
// tspWithMatrix
// ---------------------------------------------------------------------------
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

  it('returns a permutation of input indices on a 5-node graph', () => {
    const indices = [10, 11, 12, 13, 14];
    // Build a 15x15 sparse matrix; only the entries we use are filled.
    const matrix = Array.from({ length: 15 }, () => new Array(15).fill(0));
    const coords = {10: [0, 0], 11: [1, 0], 12: [2, 0], 13: [2, 1], 14: [0, 1]};
    for (const i of indices) for (const j of indices) {
      if (i === j) continue;
      const dx = coords[i][0] - coords[j][0];
      const dy = coords[i][1] - coords[j][1];
      matrix[i][j] = Math.hypot(dx, dy);
    }
    const result = tspWithMatrix(indices, matrix, 12);
    expect(result.length).toBe(5);
    const sorted = [...result].sort((a, b) => a - b);
    expect(sorted).toEqual([10, 11, 12, 13, 14]);
  });

  it('handles trivial case n=1', () => {
    const matrix = [[0]];
    const result = tspWithMatrix([0], matrix, 0);
    expect(result).toEqual([0]);
  });

  it('handles trivial case n=2', () => {
    const matrix = [[0, 7], [7, 0]];
    const result = tspWithMatrix([0, 1], matrix, 0);
    expect(result.length).toBe(2);
    expect(result[0]).toBe(0);
    expect(result[1]).toBe(1);
  });

  it('handles n=2 starting at the second index', () => {
    const matrix = [[0, 7], [7, 0]];
    const result = tspWithMatrix([0, 1], matrix, 1);
    expect(result[0]).toBe(1);
    expect(result[1]).toBe(0);
  });

  it('monotonically improves vs initial nearest-neighbor (4-node trap)', () => {
    // Asymmetric trap: nearest-neighbor from 0 picks the locally-cheap
    // 0->1 hop and gets stuck with an expensive long return leg, while
    // a 2-opt / or-opt pass can reorder to a cheaper tour.
    //
    //   coords: 0=(0,0), 1=(1,0), 2=(10,0), 3=(10,1)
    // NN from 0 -> 1 (cost 1) -> 2 (cost 9) -> 3 (cost 1)  total = 11.0
    // The 2-opt pass should keep this or improve to <= same cost.
    const coords = [[0, 0], [1, 0], [10, 0], [10, 1]];
    const matrix = makeMatrix(coords);
    const indices = [0, 1, 2, 3];

    const nn = nearestNeighbor(indices, matrix, 0);
    const tsp = tspWithMatrix(indices, matrix, 0);

    expect(tsp.length).toBe(indices.length);
    // tspWithMatrix must never worsen the solution it starts from.
    expect(routeCost(tsp, matrix) <= routeCost(nn, matrix) + 1e-9).toBe(true);
  });

  it('finds the optimal tour on a hand-checkable 5-node graph', () => {
    // Five points on a convex pentagon; the optimal tour visits them in
    // angular order. NN from 0 also happens to do that here, but this
    // confirms the 2-opt / or-opt pass at least preserves optimality.
    const coords = [
      [0, 0],     // 0
      [4, 0],     // 1
      [5, 3],     // 2
      [2, 5],     // 3
      [-1, 3]     // 4
    ];
    const matrix = makeMatrix(coords);
    const indices = [0, 1, 2, 3, 4];
    const tsp = tspWithMatrix(indices, matrix, 0);

    // The hand-verified optimal open path starting at 0 is 0-1-2-3-4.
    const optimal = [0, 1, 2, 3, 4];
    expect(routeCost(tsp, matrix) <= routeCost(optimal, matrix) + 1e-9).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// clusterUnvisited
// ---------------------------------------------------------------------------
describe('clusterUnvisited', () => {
  it('k=2 with 6 points produces 2 non-empty clusters', () => {
    const n = 6;
    const matrix = Array.from({ length: n }, () => Array(n).fill(100));
    for (let i = 0; i < n; i++) matrix[i][i] = 0;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (i !== j) matrix[i][j] = 1;
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

  it('returns k clusters that cover every input index when k <= n', () => {
    const n = 8;
    const matrix = Array.from({ length: n }, () => Array(n).fill(0));
    // Two well-separated groups of 4, each tightly clustered internally.
    const coords = [
      [0,0],[0,1],[1,0],[1,1],   // group A
      [50,50],[50,51],[51,50],[51,51] // group B
    ];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const dx = coords[i][0] - coords[j][0];
      const dy = coords[i][1] - coords[j][1];
      matrix[i][j] = Math.hypot(dx, dy);
    }
    const indices = [0,1,2,3,4,5,6,7];
    const k = 3;
    const clusters = clusterUnvisited(indices, k, matrix);

    expect(clusters.length <= k).toBe(true);
    expect(clusters.length >= 1).toBe(true);
    const flat = clusters.flat().sort((a, b) => a - b);
    expect(flat).toEqual(indices);
    // No duplicates across clusters.
    expect(new Set(flat).size).toBe(indices.length);
  });

  it('returns at most n clusters when k > n', () => {
    const matrix = [
      [0, 1, 2],
      [1, 0, 3],
      [2, 3, 0]
    ];
    const indices = [0, 1, 2];
    const clusters = clusterUnvisited(indices, 10, matrix);
    expect(clusters.length <= indices.length).toBe(true);
    expect(clusters.length >= 1).toBe(true);
    // Every input index appears exactly once across all clusters.
    const flat = clusters.flat().sort((a, b) => a - b);
    expect(flat).toEqual(indices);
  });

  it('k=1 with a single index returns one cluster containing that index', () => {
    const matrix = [[0]];
    const clusters = clusterUnvisited([7], 1, matrix);
    expect(clusters.length).toBe(1);
    expect(clusters[0]).toEqual([7]);
  });

  it('produces stable output across repeated calls (deterministic seeding)', () => {
    // Multi-restart k-medoids++ uses a seeded PRNG keyed on (n, k, restart#),
    // so identical input must yield identical output. If this flakes, the
    // algorithm has gained a non-deterministic step (e.g. Math.random()) and
    // the test should be revisited.
    const n = 6;
    const matrix = Array.from({ length: n }, () => Array(n).fill(100));
    for (let i = 0; i < n; i++) matrix[i][i] = 0;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (i !== j) matrix[i][j] = 1;
    for (let i = 3; i < 6; i++) for (let j = 3; j < 6; j++) if (i !== j) matrix[i][j] = 1;

    const a = clusterUnvisited([0, 1, 2, 3, 4, 5], 2, matrix);
    const b = clusterUnvisited([0, 1, 2, 3, 4, 5], 2, matrix);
    // Sort each cluster internally and the cluster list itself for stable comparison.
    const norm = cs => cs.map(c => [...c].sort((x, y) => x - y))
                        .sort((x, y) => x[0] - y[0]);
    expect(norm(a)).toEqual(norm(b));
  });

  it('exports chosen medoids via opts.out for sticky reclustering', () => {
    const n = 6;
    const matrix = Array.from({ length: n }, () => Array(n).fill(100));
    for (let i = 0; i < n; i++) matrix[i][i] = 0;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (i !== j) matrix[i][j] = 1;
    for (let i = 3; i < 6; i++) for (let j = 3; j < 6; j++) if (i !== j) matrix[i][j] = 1;

    const out = {};
    const clusters = clusterUnvisited([0, 1, 2, 3, 4, 5], 2, matrix, { out });
    expect(Array.isArray(out.medoids)).toBe(true);
    expect(out.medoids.length).toBe(2);
    // Each medoid must belong to exactly one of the returned clusters.
    const flat = clusters.flat();
    for (const m of out.medoids) expect(flat.includes(m)).toBe(true);
  });

  it('respects previousMedoids seed when those indices remain present', () => {
    // Two well-separated groups of 3 — almost any seed will recover the
    // natural split, but with a previousMedoids hint the chosen medoids
    // should come from the seed set when it's still valid.
    const n = 6;
    const matrix = Array.from({ length: n }, () => Array(n).fill(100));
    for (let i = 0; i < n; i++) matrix[i][i] = 0;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (i !== j) matrix[i][j] = 1;
    for (let i = 3; i < 6; i++) for (let j = 3; j < 6; j++) if (i !== j) matrix[i][j] = 1;

    const out = {};
    clusterUnvisited([0, 1, 2, 3, 4, 5], 2, matrix, { previousMedoids: [1, 4], out });
    // Each chosen medoid must lie within the cluster the seed was in.
    const left = new Set([0, 1, 2]);
    const inLeft = out.medoids.filter(m => left.has(m)).length;
    expect(inLeft).toBe(1);
  });
});
