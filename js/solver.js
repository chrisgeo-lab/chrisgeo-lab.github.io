function kMedoids(n, k, distFn) {
  const medoids = [0];
  while (medoids.length < k) {
    let maxD = -1, maxI = 0;
    for (let i = 0; i < n; i++) {
      if (medoids.includes(i)) continue;
      const minD = Math.min(...medoids.map(m => distFn(i, m)));
      if (minD > maxD) { maxD = minD; maxI = i; }
    }
    medoids.push(maxI);
  }

  let assign = new Array(n).fill(0);
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
        let cost = 0; for (const m of members) cost += distFn(cand, m) + distFn(m, cand);
        if (cost < bestC) { bestC = cost; bestM = cand; }
      }
      medoids[c] = bestM;
    }
  }
  return assign;
}

export function clusterUnvisited(indices, k, matrix) {
  if (k <= 1 || indices.length <= 1) return [indices];
  if (k >= indices.length) return indices.map(i => [i]);
  const n = indices.length;

  const assign = kMedoids(n, k, (i, j) => (matrix[indices[i]][indices[j]] + matrix[indices[j]][indices[i]]) / 2);

  const clusters = Array.from({ length: k }, () => []);
  for (let i = 0; i < n; i++) clusters[assign[i]].push(indices[i]);
  return clusters.filter(c => c.length > 0);
}

function routeCost(route, matrix) {
  let c = 0; for (let i = 0; i < route.length - 1; i++) c += matrix[route[i]][route[i + 1]];
  return c;
}

export function tspWithMatrix(indices, matrix, startIdx) {
  const n = indices.length;
  if (n <= 1) return [...indices];
  if (n <= 3) {
    const vis = new Set([startIdx]); const route = [startIdx];
    while (route.length < n) {
      const last = route[route.length - 1]; let bi = -1, bd = Infinity;
      for (const i of indices) { if (vis.has(i)) continue; if (matrix[last][i] < bd) { bd = matrix[last][i]; bi = i; } }
      if (bi === -1) break; vis.add(bi); route.push(bi);
    }
    return route;
  }

  const vis = new Set([startIdx]); const nnRoute = [startIdx];
  while (nnRoute.length < n) {
    const last = nnRoute[nnRoute.length - 1]; let bi = -1, bd = Infinity;
    for (const i of indices) { if (vis.has(i)) continue; if (matrix[last][i] < bd) { bd = matrix[last][i]; bi = i; } }
    if (bi === -1) break; vis.add(bi); nnRoute.push(bi);
  }

  let best = [...nnRoute];
  let bestCost = routeCost(best, matrix);

  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 1; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
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

  for (let segLen = 1; segLen <= 3; segLen++) {
    improved = true;
    while (improved) {
      improved = false;
      for (let i = 1; i < best.length - segLen; i++) {
        const seg = best.slice(i, i + segLen);
        const without = [...best.slice(0, i), ...best.slice(i + segLen)];
        for (let j = 1; j < without.length; j++) {
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
