import { describe, it, expect } from './runner.js';
import { fmtMi, fmtTime, fmtDur, hd } from '../js/utils.js';

describe('fmtTime', () => {
  it('formats 30 minutes as "30 min"', () => {
    expect(fmtTime(30)).toBe('30 min');
  });

  it('formats 90 minutes as "1h 30m"', () => {
    expect(fmtTime(90)).toBe('1h 30m');
  });
});

describe('fmtDur', () => {
  it('formats 30 seconds as "< 1 min"', () => {
    expect(fmtDur(30)).toBe('< 1 min');
  });

  it('formats 300 seconds as "5 min"', () => {
    expect(fmtDur(300)).toBe('5 min');
  });

  it('formats 3700 seconds as "1h 2m"', () => {
    expect(fmtDur(3700)).toBe('1h 2m');
  });
});

describe('hd', () => {
  it('computes haversine distance SF to LA approx 347 mi', () => {
    const sf = { lat: 37.7749, lng: -122.4194 };
    const la = { lat: 34.0522, lng: -118.2437 };
    const dist = hd(sf, la);
    expect(dist).toBeGreaterThan(340);
    // Should be less than 360
    expect(360 > dist).toBe(true);
  });
});

describe('fmtMi', () => {
  it('converts 1609.34 meters to "1.0" miles', () => {
    expect(fmtMi(1609.34)).toBe('1.0');
  });
});
