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
  const coords = data.features[0].geometry?.coordinates;
  if (!coords || coords.length < 2) return null;
  return {lat: coords[1], lng: coords[0]};
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
  const coords = matches[0].coordinates;
  if (!coords) return null;
  return {lat: coords.y, lng: coords.x};
}

async function tryNominatim(query) {
  const elapsed = Date.now() - lastNominatimReq;
  if (elapsed < 1100) await new Promise(r => setTimeout(r, 1100 - elapsed));
  lastNominatimReq = Date.now();
  const params = new URLSearchParams({format: 'json', q: query, limit: '1', countrycodes: 'us'});
  const r = await fetch(`${NOMINATIM_URL}?${params}`, {headers: NOMINATIM_HEADERS});
  if (r.status === 429) {
    await new Promise(r2 => setTimeout(r2, 3000));
    lastNominatimReq = Date.now();
    const retry = await fetch(`${NOMINATIM_URL}?${params}`, {headers: NOMINATIM_HEADERS});
    if (!retry.ok) return null;
    const data = await retry.json();
    return data.length ? {lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon)} : null;
  }
  if (!r.ok) return null;
  const data = await r.json();
  return data.length ? {lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon)} : null;
}

export async function geocodeAddress(addr) {
  const parts = [addr.street, addr.city, addr.state, addr.zip].filter(Boolean);
  const query = parts.join(', ');
  if (!query) return null;

  // Try Photon first (best fuzzy matching)
  try {
    const result = await tryPhoton(query);
    if (result) return result;
  } catch {}

  // Try with cleaned query (remove periods from abbreviations)
  const cleaned = query.replace(/\./g, '');
  if (cleaned !== query) {
    try {
      const result = await tryPhoton(cleaned);
      if (result) return result;
    } catch {}
  }

  // Try US Census Geocoder (excellent for US addresses)
  try {
    const result = await tryCensus(query);
    if (result) return result;
  } catch {}

  // Try without ZIP (sometimes ZIP mismatches cause failures)
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

  // Final attempt: Nominatim without ZIP and periods
  if (addr.zip || /\./.test(query)) {
    const lastTry = [addr.street, addr.city, addr.state].filter(Boolean).join(', ').replace(/\./g, '');
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

  // Check for raw coordinates
  const coords = query.match(/^\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*$/);
  if (coords) {
    return {lat: parseFloat(coords[1]), lng: parseFloat(coords[2]), label: query};
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

  return null;
}
