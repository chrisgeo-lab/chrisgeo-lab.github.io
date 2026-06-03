import { state } from './state.js';

const PHOTON_URL = 'https://photon.komoot.io/api/';
const CENSUS_URL = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_HEADERS = {'Accept': 'application/json', 'User-Agent': 'RouteFlow/1.0 (multi-stop-route-planner)'};

let lastNominatimReq = 0;
let lastCensusReq = 0;

async function tryPhoton(query) {
  const params = new URLSearchParams({q: query, limit: '1', lang: 'en'});
  if (state.gpsPos) {
    params.append('lat', state.gpsPos.lat);
    params.append('lon', state.gpsPos.lng);
  }
  const r = await fetch(`${PHOTON_URL}?${params}`);
  if (!r.ok) return null;
  const data = await r.json();
  if (!data.features || !data.features.length) return null;
  const f = data.features[0];
  const coords = f.geometry?.coordinates;
  if (!coords || coords.length < 2) return null;
  const p = f.properties || {};
  return {
    lat: coords[1],
    lng: coords[0],
    resolvedStreet: [p.housenumber, p.street || p.name].filter(Boolean).join(' '),
    resolvedCity: p.city || p.locality || p.county || '',
    resolvedState: p.state || '',
    resolvedZip: p.postcode || ''
  };
}

async function tryCensus(query) {
  const elapsed = Date.now() - lastCensusReq;
  if (elapsed < 300) await new Promise(r => setTimeout(r, 300 - elapsed));
  lastCensusReq = Date.now();
  const params = new URLSearchParams({
    address: query,
    benchmark: 'Public_AR_Current',
    format: 'json'
  });
  const r = await fetch(`${CENSUS_URL}?${params}`);
  if (!r.ok) return null;
  const data = await r.json();
  const matches = data?.result?.addressMatches;
  if (!matches || !matches.length) return null;
  const match = matches[0];
  const coords = match.coordinates;
  if (!coords) return null;
  const addr = match.matchedAddress || '';
  return {
    lat: coords.y,
    lng: coords.x,
    matchedAddress: addr
  };
}

async function tryNominatim(query) {
  const elapsed = Date.now() - lastNominatimReq;
  if (elapsed < 1100) await new Promise(r => setTimeout(r, 1100 - elapsed));
  lastNominatimReq = Date.now();
  const params = new URLSearchParams({format: 'json', q: query, limit: '1', addressdetails: '1'});
  const r = await fetch(`${NOMINATIM_URL}?${params}`, {headers: NOMINATIM_HEADERS});
  if (r.status === 429) {
    await new Promise(r2 => setTimeout(r2, 3000));
    lastNominatimReq = Date.now();
    const retry = await fetch(`${NOMINATIM_URL}?${params}`, {headers: NOMINATIM_HEADERS});
    if (!retry.ok) return null;
    const data = await retry.json();
    return parseNominatimResult(data);
  }
  if (!r.ok) return null;
  const data = await r.json();
  return parseNominatimResult(data);
}

function parseNominatimResult(data) {
  if (!data.length) return null;
  const item = data[0];
  const a = item.address || {};
  return {
    lat: parseFloat(item.lat),
    lng: parseFloat(item.lon),
    resolvedStreet: [a.house_number, a.road].filter(Boolean).join(' '),
    resolvedCity: a.city || a.town || a.village || a.municipality || '',
    resolvedState: a.state || '',
    resolvedZip: a.postcode || ''
  };
}

function normalizeAddress(str) {
  return str
    .replace(/\./g, '')
    .replace(/\b(apt|suite|ste|unit|#)\s*\S*/gi, '')
    .trim();
}

function buildQuery(addr) {
  return [addr.street, addr.city, addr.state, addr.zip].filter(Boolean).join(', ');
}

export async function geocodeAddress(addr) {
  const query = buildQuery(addr);
  if (!query) return null;
  const cleaned = normalizeAddress(query);

  // Try Photon first (fastest, best fuzzy matching)
  try {
    const result = await tryPhoton(query);
    if (result) return result;
  } catch {}

  // Try cleaned query with Photon
  if (cleaned !== query) {
    try {
      const result = await tryPhoton(cleaned);
      if (result) return result;
    } catch {}
  }

  // Try without ZIP (sometimes ZIP mismatch causes failures)
  if (addr.zip) {
    const noZip = [addr.street, addr.city, addr.state].filter(Boolean).join(', ');
    try {
      const result = await tryPhoton(noZip);
      if (result) return result;
    } catch {}
  }

  // US Census Geocoder (excellent for US street addresses)
  try {
    const result = await tryCensus(query);
    if (result) return result;
  } catch {}

  if (addr.zip) {
    const noZip = [addr.street, addr.city, addr.state].filter(Boolean).join(', ');
    try {
      const result = await tryCensus(noZip);
      if (result) return result;
    } catch {}
  }

  // Nominatim as last resort
  try {
    const result = await tryNominatim(query);
    if (result) return result;
  } catch {}

  // Final attempt: Nominatim without ZIP and dots
  if (addr.zip || /\./.test(query)) {
    const lastTry = normalizeAddress([addr.street, addr.city, addr.state].filter(Boolean).join(', '));
    try {
      const result = await tryNominatim(lastTry);
      if (result) return result;
    } catch {}
  }

  return null;
}

export async function geocodeFreeform(text) {
  if (!text || !text.trim()) return null;
  const query = text.trim();

  // Check for raw coordinates (lat, lng)
  const coords = query.match(/^\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*$/);
  if (coords) {
    const lat = parseFloat(coords[1]);
    const lng = parseFloat(coords[2]);
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return {lat, lng, label: query};
    }
  }

  // Try Photon
  try {
    const result = await tryPhoton(query);
    if (result) return {...result, label: query};
  } catch {}

  // Try Census
  try {
    const result = await tryCensus(query);
    if (result) return {...result, label: query};
  } catch {}

  // Try Nominatim
  try {
    const result = await tryNominatim(query);
    if (result) return {...result, label: query};
  } catch {}

  // Try cleaned version
  const cleaned = normalizeAddress(query);
  if (cleaned !== query) {
    try {
      const result = await tryPhoton(cleaned);
      if (result) return {...result, label: query};
    } catch {}
  }

  return null;
}

export function formatForMaps(sp) {
  const parts = [sp.street];
  if (sp.city) parts.push(sp.city);
  if (sp.state) parts.push(sp.state);
  if (sp.zip) parts.push(sp.zip);
  const addr = parts.filter(Boolean).join(', ');
  if (addr && addr.length > 5) return addr;
  return `${sp.lat},${sp.lng}`;
}
