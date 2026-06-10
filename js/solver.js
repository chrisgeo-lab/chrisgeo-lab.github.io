// Seeded PRNG so multi-restart k-medoids stays deterministic — identical
// inputs must produce identical clusterings or the UI flickers across renders.
function mulberry32(seed) {
  let s = seed | 0;
  return function() {
    s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Lloyd-style k-medoids refinement from a given seed set.
function runLloyd(n, k, distFn, initialMedoids) {
  const medoids = [...initialMedoids];
  const assign = new Array(n).fill(0);
  for (let iter = 0; iter < 50; iter++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      let best = 0, bestT = Infinity;
      for (let c = 0; c < k; c++) {
        const t = distFn(i, medoids[c]);
        if (t < bestT) { bestT = t; best = c; }
      }
      if (assign[i] !== best) { assign[i] = best; changed = true; }
    }
    if (!changed) break;
    for (let c = 0; c < k; c++) {
      const members = []; for (let i = 0; i < n; i++) if (assign[i] === c) members.push(i);
      if (!members.length) continue;
      let bestM = members[0], bestC = Infinity;
      for (const cand of members) {
        let cost = 0; for (const m of members) cost += distFn(cand, m);
        if (cost < bestC) { bestC = cost; bestM = cand; }
      }
      medoids[c] = bestM;
    }
  }
  return { assign, medoids };
}

// k-medoids++ probabilistic seeding — picks each medoid with probability
// proportional to D(x)² where D(x) is the distance to the closest already
// chosen medoid. Spreads seeds out without the index-0 bias of the old
// farthest-point heuristic.
function kppSeeds(n, k, distFn, rand) {
  const medoids = [Math.floor(rand() * n)];
  while (medoids.length < k) {
    const weights = new Array(n);
    let total = 0;
    for (let i = 0; i < n; i++) {
      if (medoids.includes(i)) { weights[i] = 0; continue; }
      let minD = Infinity;
      for (const m of medoids) { const d = distFn(i, m); if (d < minD) minD = d; }
      const w = minD * minD;
      weights[i] = w; total += w;
    }
    if (total <= 0) {
      for (let i = 0; i < n; i++) if (!medoids.includes(i)) { medoids.push(i); break; }
      continue;
    }
    let target = rand() * total, pick = -1;
    for (let i = 0; i < n; i++) {
      target -= weights[i];
      if (target <= 0 && weights[i] > 0) { pick = i; break; }
    }
    if (pick === -1) for (let i = 0; i < n; i++) if (!medoids.includes(i) && weights[i] > 0) { pick = i; break; }
    medoids.push(pick);
  }
  return medoids;
}

// Cheap nearest-neighbor tour cost over `members`. Used to score partitions
// by approximate route work instead of just assignment cost — a 4-4 split
// minimizes sum-of-distances-to-medoid but might still produce ugly snaking
// routes; this approximates what TSP refinement will actually deliver.
function nnTourCost(members, distFn) {
  if (members.length <= 1) return 0;
  const used = new Array(members.length).fill(false);
  used[0] = true;
  let cost = 0, last = members[0];
  for (let step = 1; step < members.length; step++) {
    let best = -1, bd = Infinity;
    for (let j = 0; j < members.length; j++) {
      if (used[j]) continue;
      const d = distFn(last, members[j]);
      if (d < bd) { bd = d; best = j; }
    }
    if (best === -1) break;
    cost += bd; used[best] = true; last = members[best];
  }
  return cost;
}

// Score a partition: total approximate route cost + soft penalty for
// oversized clusters. The penalty only kicks in when the largest cluster
// exceeds 1.5× the ideal size, so balanced partitions are preferred when
// route cost is otherwise tied.
function partitionScore(assign, k, n, distFn) {
  const clusters = Array.from({ length: k }, () => []);
  for (let i = 0; i < n; i++) clusters[assign[i]].push(i);
  let route = 0;
  for (const c of clusters) route += nnTourCost(c, distFn);
  const ideal = n / k;
  let maxSize = 0;
  for (const c of clusters) if (c.length > maxSize) maxSize = c.length;
  const overflow = Math.max(0, maxSize - 1.5 * ideal);
  const avgEdge = route / Math.max(1, n);
  return route + overflow * avgEdge * 0.5;
}

/**
 * Partition spot indices into k clusters via multi-restart k-medoids++.
 * Scores each restart by approximate route cost (NN tour + size-balance
 * penalty) and returns the best — this avoids local optima the old single-pass
 * deterministic seeding got stuck in.
 *
 * Output is deterministic: identical inputs (including `opts.previousMedoids`)
 * always produce identical clusters, so re-renders don't shuffle route colors.
 *
 * @param {number[]} indices  Indices into the full SPOTS array.
 * @param {number} k          Cluster count (clamped: ≤1 → single cluster, ≥|indices| → singletons).
 * @param {number[][]} matrix Full N×N duration matrix indexed by SPOTS index.
 * @param {Object} [opts]
 * @param {number[]} [opts.previousMedoids]  Prior medoids in SPOTS-space.
 *   When all k of them still appear in `indices`, used as the first restart's
 *   seed to bias toward the prior partition (sticky reclustering).
 * @param {{medoids?: number[]}} [opts.out]  Output bag — `out.medoids` is
 *   set to the chosen medoids in SPOTS-space.
 * @returns {number[][]}      Non-empty clusters of SPOTS indices.
 */
export function clusterUnvisited(indices, k, matrix, opts = {}) {
  if (k <= 1 || indices.length <= 1) return [indices];
  if (k >= indices.length) return indices.map(i => [i]);
  const n = indices.length;
  const distFn = (i, j) => (matrix[indices[i]][indices[j]] + matrix[indices[j]][indices[i]]) / 2;

  // 3-8 restarts depending on n. More restarts pay off on larger inputs but
  // each is O(n·k·iters) so we don't go wild.
  const restarts = Math.min(8, Math.max(3, Math.floor(n / 3)));
  let bestAssign = null, bestScore = Infinity, bestMedoids = null;

  // Sticky seed: if every previous medoid is still in `indices`, run one
  // restart pinned to that seed set. The Lloyd loop refines from there, so
  // small input changes (e.g. one new stop) tend to produce small partition
  // changes rather than wholly different ones.
  const prev = Array.isArray(opts.previousMedoids) ? opts.previousMedoids : null;
  if (prev && prev.length === k) {
    const local = prev.map(m => indices.indexOf(m));
    if (local.every(x => x >= 0) && new Set(local).size === k) {
      const { assign, medoids } = runLloyd(n, k, distFn, local);
      const score = partitionScore(assign, k, n, distFn);
      bestAssign = assign; bestScore = score; bestMedoids = medoids;
    }
  }

  for (let r = 0; r < restarts; r++) {
    const rand = mulberry32(((r + 1) * 2654435761) ^ (n * 31 + k));
    const seeds = kppSeeds(n, k, distFn, rand);
    const { assign, medoids } = runLloyd(n, k, distFn, seeds);
    const score = partitionScore(assign, k, n, distFn);
    if (score < bestScore) { bestScore = score; bestAssign = assign; bestMedoids = medoids; }
  }

  const clusters = Array.from({ length: k }, () => []);
  for (let i = 0; i < n; i++) clusters[bestAssign[i]].push(indices[i]);

  if (opts.out) opts.out.medoids = bestMedoids.map(m => indices[m]);

  return clusters.filter(c => c.length > 0);
}

function routeCost(route, matrix) {
  let c = 0; for (let i = 0; i < route.length - 1; i++) c += matrix[route[i]][route[i + 1]];
  return c;
}

/**
 * Heuristic TSP: nearest-neighbor seed, then 2-opt and or-opt (segment lengths 1–3) refinement.
 * Pure — does not touch state. `startIdx` must appear in `indices`.
 * When `endIdx` is provided (and !== startIdx), the result is a Hamiltonian path
 * from `startIdx` to `endIdx` (both fixed at their respective ends; refinement
 * never moves them).
 * @param {number[]} indices
 * @param {number[][]} matrix
 * @param {number} startIdx
 * @param {number} [endIdx]  Optional fixed final node.
 * @returns {number[]}  Visit order from `startIdx` to (optionally) `endIdx`.
 */
export function tspWithMatrix(indices, matrix, startIdx, endIdx) {
  const hasEnd = endIdx != null && endIdx !== startIdx && indices.includes(endIdx);
  const n = indices.length;
  if (n <= 1) return [...indices];

  // Nearest-neighbor seed. When an endIdx is fixed, we exclude it from the
  // greedy expansion and snap it on at the end; otherwise the NN walk could
  // strand it in the middle.
  const vis = new Set([startIdx]);
  if (hasEnd) vis.add(endIdx);
  const nnRoute = [startIdx];
  const targetMiddle = hasEnd ? n - 1 : n;
  while (nnRoute.length < targetMiddle) {
    const last = nnRoute[nnRoute.length - 1]; let bi = -1, bd = Infinity;
    for (const i of indices) {
      if (vis.has(i)) continue;
      if (matrix[last][i] < bd) { bd = matrix[last][i]; bi = i; }
    }
    if (bi === -1) break;
    vis.add(bi); nnRoute.push(bi);
  }
  if (hasEnd) nnRoute.push(endIdx);

  if (n <= 3) return nnRoute;

  let best = [...nnRoute];
  let bestCost = routeCost(best, matrix);

  // 2-opt — bounded so neither bookend can move. With a fixed end we stop k
  // before the last index so reversal never touches it.
  const lastMovable = hasEnd ? best.length - 2 : best.length - 1;
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 1; i <= lastMovable; i++) {
      for (let k = i + 1; k <= lastMovable; k++) {
        const a = best[i - 1], b = best[i], c = best[k], d = best[k + 1] || best[k];
        let oldSeg = matrix[a][b];
        let newSeg = matrix[a][c];
        if (k < best.length - 1) { oldSeg += matrix[c][d]; newSeg += matrix[b][d]; }
        if (newSeg < oldSeg) {
          const seg = best.slice(i, k + 1); seg.reverse();
          best = [...best.slice(0, i), ...seg, ...best.slice(k + 1)];
          bestCost = routeCost(best, matrix);
          improved = true;
        }
      }
    }
  }

  // Or-opt — never lift or insert into the bookend positions.
  for (let segLen = 1; segLen <= 3; segLen++) {
    improved = true;
    while (improved) {
      improved = false;
      const liftCap = hasEnd ? best.length - segLen - 1 : best.length - segLen;
      for (let i = 1; i <= liftCap; i++) {
        const seg = best.slice(i, i + segLen);
        const without = [...best.slice(0, i), ...best.slice(i + segLen)];
        const localInsertCap = hasEnd ? without.length - 1 : without.length;
        for (let j = 1; j < localInsertCap; j++) {
          if (j === i) continue;
          const candidate = [...without.slice(0, j), ...seg, ...without.slice(j)];
          const newCost = routeCost(candidate, matrix);
          if (newCost < bestCost) { best = candidate; bestCost = newCost; improved = true; break; }
        }
        if (improved) break;
      }
    }
  }

  return best;
}
