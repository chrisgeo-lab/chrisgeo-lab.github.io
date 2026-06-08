import { describe, it, expect } from './runner.js';
import { buildHaversineMatrix } from '../js/routing.js';
import { state } from '../js/state.js';
import { hd } from '../js/utils.js';

// Note: fetchTable / fetchRoute / fetchWithRetry / fetchFromAnyServer all
// hit the network. They are intentionally NOT tested here. cacheKey is
// not exported, so it is exercised only indirectly via the public API.
//
// Only buildHaversineMatrix is fully pure — that's what we test.

const SF = {lat: 37.7749, lng: -122.4194};
const LA = {lat: 34.0522, lng: -118.2437};
const NYC = {lat: 40.7128, lng: -74.0060};

function withTravelMode(mode, fn) {
  const prev = state.travelMode;
  state.travelMode = mode;
  try { return fn(); }
  finally { state.travelMode = prev; }
}

describe('buildHaversineMatrix', () => {
  it('returns a square matrix with zero diagonal', () => {
    withTravelMode('car', () => {
      const m = buildHaversineMatrix([SF, LA, NYC]);
      expect(m.length).toBe(3);
      for (let i = 0; i < 3; i++) {
        expect(m[i].length).toBe(3);
        expect(m[i][i]).toBe(0);
      }
    });
  });

  it('is symmetric: m[i][j] === m[j][i]', () => {
    withTravelMode('car', () => {
      const m = buildHaversineMatrix([SF, LA, NYC]);
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          expect(m[i][j]).toBe(m[j][i]);
        }
      }
    });
  });

  it('produces values in seconds — order of magnitude check (SF↔LA car)', () => {
    withTravelMode('car', () => {
      const m = buildHaversineMatrix([SF, LA]);
      // ~347 mi / 25 mph * 3600 s/h ≈ 50,000 s. Wide bracket on purpose.
      expect(m[0][1] > 30000).toBe(true);
      expect(m[0][1] < 70000).toBe(true);
    });
  });

  it('respects travelMode: bike durations exceed car durations for same coords', () => {
    const carM = withTravelMode('car',  () => buildHaversineMatrix([SF, LA]));
    const bikeM = withTravelMode('bike', () => buildHaversineMatrix([SF, LA]));
    expect(bikeM[0][1] > carM[0][1]).toBe(true);
    // bike is 10 mph vs car 25 mph -> bike should be exactly 2.5x slower.
    const ratio = bikeM[0][1] / carM[0][1];
    expect(Math.abs(ratio - 2.5) < 1e-6).toBe(true);
  });

  it('respects travelMode: walk durations exceed bike durations for same coords', () => {
    const bikeM = withTravelMode('bike', () => buildHaversineMatrix([SF, LA]));
    const walkM = withTravelMode('walk', () => buildHaversineMatrix([SF, LA]));
    expect(walkM[0][1] > bikeM[0][1]).toBe(true);
    // walk is 3 mph vs bike 10 mph -> ratio ~10/3 ≈ 3.333.
    const ratio = walkM[0][1] / bikeM[0][1];
    expect(Math.abs(ratio - (10 / 3)) < 1e-6).toBe(true);
  });

  it('falls back to car speed for an unknown travelMode', () => {
    const carM = withTravelMode('car',     () => buildHaversineMatrix([SF, LA]));
    const wtfM = withTravelMode('hovercraft', () => buildHaversineMatrix([SF, LA]));
    expect(wtfM[0][1]).toBe(carM[0][1]);
  });

  it('handles n=1 (returns 1x1 zero matrix)', () => {
    withTravelMode('car', () => {
      const m = buildHaversineMatrix([SF]);
      expect(m.length).toBe(1);
      expect(m[0].length).toBe(1);
      expect(m[0][0]).toBe(0);
    });
  });

  it('handles n=0 (returns empty matrix)', () => {
    withTravelMode('car', () => {
      const m = buildHaversineMatrix([]);
      expect(m.length).toBe(0);
    });
  });

  it('agrees with hd() for distances: m[i][j] / 3600 * speed_mph ≈ miles', () => {
    withTravelMode('car', () => {
      const m = buildHaversineMatrix([SF, LA]);
      const miles = hd(SF, LA);
      const reconstructed = (m[0][1] / 3600) * 25; // car speed
      expect(Math.abs(reconstructed - miles) < 0.01).toBe(true);
    });
  });
});
