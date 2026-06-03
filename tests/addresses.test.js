import { describe, it, expect } from './runner.js';
import { normalizeState, parseAddressLine } from '../js/address-parse.js';

describe('normalizeState', () => {
  it('returns CA unchanged for abbreviation input', () => {
    expect(normalizeState('CA')).toBe('CA');
  });

  it('converts "california" to CA', () => {
    expect(normalizeState('california')).toBe('CA');
  });

  it('converts "New York" to NY', () => {
    expect(normalizeState('New York')).toBe('NY');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeState('')).toBe('');
  });
});

describe('parseAddressLine', () => {
  it('parses comma-delimited address', () => {
    const result = parseAddressLine('123 Main St, Boston, MA');
    expect(result.street).toBe('123 Main St');
    expect(result.city).toBe('Boston');
    expect(result.state).toBe('MA');
    expect(result.lat).toBeNull();
    expect(result.lng).toBeNull();
  });

  it('parses tab-delimited address', () => {
    const result = parseAddressLine('456 Oak Ave\tCambridge\tMA\t02139');
    expect(result.street).toBe('456 Oak Ave');
    expect(result.city).toBe('Cambridge');
    expect(result.state).toBe('MA');
    expect(result.zip).toBe('02139');
  });

  it('parses pipe-delimited address', () => {
    const result = parseAddressLine('789 Elm Dr|Springfield|IL|62704');
    expect(result.street).toBe('789 Elm Dr');
    expect(result.city).toBe('Springfield');
    expect(result.state).toBe('IL');
    expect(result.zip).toBe('62704');
  });
});
