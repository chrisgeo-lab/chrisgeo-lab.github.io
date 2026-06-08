import { state, STORE_SPOTS, STORE_V, STORE_CACHE, saveSet, saveJSON } from './state.js';
import { esc, toast, trapFocus } from './utils.js';
import { render, computeMaxClusters } from './ui.js';
import { geocodeAddress } from './geocoder.js';
import { normalizeState, parseAddressLine } from './address-parse.js';

let stagedAddresses = [];
let importMode = 'append';
let releaseAddrTrap = null;

function resetRouteState() {
  state.durationMatrix = null;
  state.osrmCache = {}; saveJSON(STORE_CACHE, state.osrmCache);
  state.currentRoutes = [];
}

function updateClusterSlider() {
  const slider = document.getElementById('clusterSlider');
  const sliderVal = document.getElementById('clusterVal');
  const newMax = computeMaxClusters();
  slider.max = newMax; slider.setAttribute('max', newMax);
  if (+slider.value > newMax) { slider.value = newMax; sliderVal.textContent = newMax; state.numClusters = newMax; }
}

export function showAddrModal() {
  const modal = document.getElementById('addrModal');
  modal.classList.add('show');
  releaseAddrTrap = trapFocus(modal);
  stagedAddresses = [];
  renderAddrPreview();
  const hasExisting = state.SPOTS.length > 0;
  document.getElementById('addrModeToggle').style.display = hasExisting ? 'flex' : 'none';
  importMode = hasExisting ? 'append' : 'replace';
  document.getElementById('addrModeAppend').classList.toggle('active', importMode === 'append');
  document.getElementById('addrModeReplace').classList.toggle('active', importMode === 'replace');
  document.getElementById('addrPasteArea').value = '';
  document.getElementById('addrManualSearch').value = '';
  document.getElementById('addrManualStreet').value = '';
  document.getElementById('addrManualCity').value = '';
  document.getElementById('addrManualState').value = '';
  document.getElementById('addrManualZip').value = '';
  document.getElementById('addrAcList').classList.remove('show');
  document.querySelectorAll('.addr-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.addr-section').forEach(s => s.classList.remove('active'));
  document.querySelector('.addr-tab[data-tab="import"]').classList.add('active');
  document.getElementById('addrImportSection').classList.add('active');
}

export function setImportMode(mode) {
  importMode = mode;
  document.getElementById('addrModeAppend').classList.toggle('active', mode === 'append');
  document.getElementById('addrModeReplace').classList.toggle('active', mode === 'replace');
}

export function hideAddrModal() {
  document.getElementById('addrModal').classList.remove('show');
  if (releaseAddrTrap) { releaseAddrTrap(); releaseAddrTrap = null; }
  stagedAddresses = [];
  renderAddrPreview();
}

function processFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'xlsx' || ext === 'xls') {
    processExcel(file);
  } else {
    const reader = new FileReader();
    reader.onload = e => parseCSV(e.target.result, ext === 'tsv' ? '\t' : ',');
    reader.readAsText(file);
  }
}

function processExcel(file) {
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const data = new Uint8Array(e.target.result);
      const zip = await parseZip(data);
      const sharedStrings = parseSharedStrings(zip['xl/sharedStrings.xml'] || '');
      const sheetXml = zip['xl/worksheets/sheet1.xml'] || '';
      const rows = parseSheetRows(sheetXml, sharedStrings);
      if (rows.length < 2) { toast('No data rows found'); return; }
      parseRows(rows[0], rows.slice(1));
    } catch (err) {
      console.error('Excel parse error:', err);
      toast('Couldn\'t parse Excel file — try CSV instead');
    }
  };
  reader.readAsArrayBuffer(file);
}

async function parseZip(data) {
  const files = {};
  const view = new DataView(data.buffer);
  let offset = 0;
  while (offset < data.length - 4) {
    const sig = view.getUint32(offset, true);
    if (sig !== 0x04034b50) break;
    const compMethod = view.getUint16(offset + 8, true);
    const compSize = view.getUint32(offset + 18, true);
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const name = new TextDecoder().decode(data.slice(offset + 30, offset + 30 + nameLen));
    const fileData = data.slice(offset + 30 + nameLen + extraLen, offset + 30 + nameLen + extraLen + compSize);
    if (compMethod === 0) {
      files[name] = new TextDecoder().decode(fileData);
    } else if (compMethod === 8) {
      try {
        const ds = new DecompressionStream('deflate-raw');
        const writer = ds.writable.getWriter();
        writer.write(fileData); writer.close();
        const reader = ds.readable.getReader();
        const chunks = []; let done = false;
        while (!done) { const r = await reader.read(); if (r.value) chunks.push(r.value); done = r.done; }
        const total = chunks.reduce((a, c) => a + c.length, 0);
        const result = new Uint8Array(total); let pos = 0;
        chunks.forEach(c => { result.set(c, pos); pos += c.length; });
        files[name] = new TextDecoder().decode(result);
      } catch { files[name] = ''; }
    }
    offset += 30 + nameLen + extraLen + compSize;
  }
  return files;
}

function parseSharedStrings(xml) {
  const strings = [];
  const regex = /<t[^>]*>([^<]*)<\/t>/g;
  let m; while ((m = regex.exec(xml)) !== null) strings.push(m[1]);
  return strings;
}

function parseSheetRows(xml, strings) {
  const rows = [];
  const rowRegex = /<row[^>]*>([\s\S]*?)<\/row>/g;
  const cellRegex = /<c\s+r="([A-Z]+)\d+"[^>]*(?:t="([^"]*)")?[^>]*>(?:<v>([^<]*)<\/v>)?/g;
  let rm;
  while ((rm = rowRegex.exec(xml)) !== null) {
    const cells = []; let cm;
    cellRegex.lastIndex = 0;
    while ((cm = cellRegex.exec(rm[1])) !== null) {
      const col = cm[1].charCodeAt(0) - 65;
      let val = cm[3] || '';
      if (cm[2] === 's' && strings[parseInt(val)]) val = strings[parseInt(val)];
      while (cells.length <= col) cells.push('');
      cells[col] = val.trim();
    }
    if (cells.some(c => c)) rows.push(cells);
  }
  return rows;
}

function parseCSV(text, delimiter = ',') {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) { toast('No data rows found'); return; }
  const headerLine = lines[0];
  if (delimiter === ',' && !headerLine.includes(',') && headerLine.includes('\t')) delimiter = '\t';
  if (delimiter === ',' && !headerLine.includes(',') && headerLine.includes('|')) delimiter = '|';
  const rows = lines.map(l => parseCSVLine(l, delimiter));
  parseRows(rows[0], rows.slice(1));
}

function parseCSVLine(line, delim) {
  if (delim === ',' && line.includes('"')) {
    const result = []; let current = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQuotes = !inQuotes; }
      else if (c === delim && !inQuotes) { result.push(current.trim()); current = ''; }
      else { current += c; }
    }
    result.push(current.trim());
    return result;
  }
  return line.split(delim).map(s => s.trim().replace(/^"|"$/g, ''));
}

function parseRows(headers, dataRows) {
  const h = headers.map(s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, ''));
  const streetCol = h.findIndex(c => c === 'street' || c === 'address' || c === 'streetaddress' || c === 'addr' || c === 'location');
  const cityCol = h.findIndex(c => c === 'city' || c === 'town' || c === 'municipality');
  const stateCol = h.findIndex(c => c === 'state' || c === 'st' || c === 'province');
  const zipCol = h.findIndex(c => c === 'zip' || c === 'zipcode' || c === 'postalcode' || c === 'postal');
  const latCol = h.findIndex(c => c === 'lat' || c === 'latitude');
  const lngCol = h.findIndex(c => c === 'lng' || c === 'lon' || c === 'longitude' || c === 'long');

  if (streetCol === -1) {
    if (headers.length >= 3) {
      importAddresses(dataRows.map(r => ({street: r[0] || '', city: r[1] || '', state: normalizeState(r[2] || ''), zip: (r[3] || '').replace(/[^\d-]/g, ''), lat: null, lng: null})));
    } else if (headers.length >= 2) {
      importAddresses(dataRows.map(r => ({street: r[0] || '', city: r[1] || '', state: '', zip: '', lat: null, lng: null})));
    } else {
      toast('No "street" or "address" column found');
    }
    return;
  }

  const results = dataRows.map(row => {
    const street = row[streetCol] || '';
    let city = cityCol >= 0 ? (row[cityCol] || '') : '';
    let st = stateCol >= 0 ? normalizeState(row[stateCol] || '') : '';
    const zip = zipCol >= 0 ? (row[zipCol] || '').replace(/[^\d-]/g, '') : '';
    if (!city) {
      const parts = street.split(',');
      if (parts.length >= 2) { return {street: parts[0].trim(), city: parts[1].trim(), state: normalizeState(parts[2]?.trim() || '') || st, zip, lat: null, lng: null}; }
    }
    const lat = latCol >= 0 ? parseFloat(row[latCol]) : null;
    const lng = lngCol >= 0 ? parseFloat(row[lngCol]) : null;
    return {street, city, state: st, zip, lat: isNaN(lat) ? null : lat, lng: isNaN(lng) ? null : lng};
  }).filter(r => r.street);

  if (stateCol === -1 && !results.some(r => r.state)) {
    toast('No state column found — some addresses may not resolve');
  }
  importAddresses(results);
}

function importAddresses(addresses) {
  const MAX_STOPS = 100;
  const existing = importMode === 'append' ? state.SPOTS.length : 0;
  const available = MAX_STOPS - existing;
  if (addresses.length > available) {
    if (existing > 0) toast(`Max 100 stops — only adding ${available}`);
    else toast('Max 100 stops');
    addresses = addresses.slice(0, Math.max(0, available));
  }
  if (!addresses.length) return;
  stagedAddresses = addresses.map((a, i) => ({
    id: i + 1,
    street: a.street,
    city: a.city || '',
    state: a.state || '',
    zip: a.zip || '',
    lat: a.lat,
    lng: a.lng,
    status: a.lat && a.lng ? 'ok' : 'pending'
  }));
  renderAddrPreview();
  toast(`${stagedAddresses.length} addresses loaded`);
}

function renderAddrPreview() {
  const el = document.getElementById('addrPreview');
  const btn = document.getElementById('addrConfirmBtn');
  const count = document.getElementById('addrFooterCount');

  if (!stagedAddresses.length) {
    el.style.display = 'none';
    btn.disabled = true;
    count.textContent = '0 addresses staged';
    return;
  }

  el.style.display = 'block';
  btn.disabled = false;
  const geocoded = stagedAddresses.filter(a => a.status === 'ok').length;
  count.textContent = `${stagedAddresses.length} addresses staged${geocoded ? ` (${geocoded} geocoded)` : ''}`;

  el.innerHTML = '';
  stagedAddresses.forEach((addr, i) => {
    const item = document.createElement('div');
    item.className = 'addr-preview-item';
    const statusClass = addr.status === 'ok' ? 'ok' : addr.status === 'error' ? 'error' : 'pending';
    const statusText = addr.status === 'ok' ? '&#10003;' : addr.status === 'error' ? '&#10007;' : '&#8987;';
    item.innerHTML = `
      <span class="addr-preview-num">${i + 1}</span>
      <span class="addr-preview-text">${esc(addr.street)}${addr.city ? ', ' + esc(addr.city) : ''}${addr.state ? ', ' + esc(addr.state) : ''}${addr.zip ? ' ' + esc(addr.zip) : ''}</span>
      <span class="addr-preview-status ${statusClass}">${statusText}</span>
      <button class="addr-preview-remove" data-idx="${i}">&times;</button>`;
    item.querySelector('.addr-preview-remove').onclick = () => {
      stagedAddresses.splice(i, 1);
      stagedAddresses.forEach((a, j) => a.id = j + 1);
      renderAddrPreview();
    };
    el.appendChild(item);
  });
}

// Geocoding (uses multi-provider cascade from geocoder.js)
let geocodeCancelled = false;

async function geocodeOne(addr) {
  try {
    const result = await geocodeAddress(addr);
    if (result) {
      addr.lat = result.lat;
      addr.lng = result.lng;
      if (result.resolvedStreet && !addr.street) addr.street = result.resolvedStreet;
      if (result.resolvedCity && !addr.city) addr.city = result.resolvedCity;
      if (result.resolvedState && !addr.state) addr.state = result.resolvedState;
      if (result.resolvedZip && !addr.zip) addr.zip = result.resolvedZip;
      addr.status = 'ok';
    } else {
      addr.status = 'error';
    }
  } catch {
    addr.status = 'error';
  }
}

async function geocodeStaged() {
  const toGeocode = stagedAddresses.filter(a => a.status === 'pending');
  if (!toGeocode.length) return true;
  geocodeCancelled = false;

  const geoBar = document.getElementById('addrGeoBar');
  const fillEl = document.getElementById('addrGeoProgressFill');
  const cancelBtn = document.getElementById('addrCancelBtn');

  geoBar.style.display = 'block';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.onclick = () => { geocodeCancelled = true; };

  let done = 0;
  const total = toGeocode.length;
  fillEl.style.width = '0';

  for (let i = 0; i < total && !geocodeCancelled; i++) {
    await geocodeOne(toGeocode[i]);
    done++;
    fillEl.style.width = `${Math.round((done / total) * 100)}%`;
    renderAddrPreview();

    if (toGeocode[i].status === 'error') {
      const action = await showFixAddrPrompt(toGeocode[i]);
      if (action === 'retry') { i--; done--; continue; }
      if (action === 'remove') {
        const idx = stagedAddresses.indexOf(toGeocode[i]);
        if (idx >= 0) stagedAddresses.splice(idx, 1);
        renderAddrPreview();
      }
    }
  }

  geoBar.style.display = 'none';
  fillEl.style.width = '0';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.onclick = hideAddrModal;

  if (geocodeCancelled) {
    const countEl = document.getElementById('addrFooterCount');
    countEl.textContent = `Cancelled — ${stagedAddresses.filter(a => a.status === 'ok').length} resolved`;
    return false;
  }
  return true;
}

function applyValidStops(valid) {
  if (importMode === 'append' && state.SPOTS.length > 0) {
    const maxId = Math.max(0, ...state.SPOTS.map(s => s.id));
    const newSpots = valid.map((a, i) => ({id: maxId + i + 1, street: a.street, city: a.city || '', state: a.state || '', zip: a.zip || '', lat: a.lat, lng: a.lng}));
    state.SPOTS = [...state.SPOTS, ...newSpots];
    saveJSON(STORE_SPOTS, state.SPOTS);
    resetRouteState();
    updateClusterSlider();
    hideAddrModal();
    toast(`${newSpots.length} stops added (${state.SPOTS.length} total)`);
    render();
  } else {
    const newSpots = valid.map((a, i) => ({id: i + 1, street: a.street, city: a.city || '', state: a.state || '', zip: a.zip || '', lat: a.lat, lng: a.lng}));
    state.SPOTS = newSpots;
    saveJSON(STORE_SPOTS, state.SPOTS);
    state.visitedSet.clear(); saveSet(STORE_V, state.visitedSet);
    // Stale start/end anchors from the previous dataset would dangle here;
    // clear them rather than carrying mismatched coordinates onto the new map.
    state.startPoint = null; localStorage.removeItem('routeflow-start');
    state.home = null; localStorage.removeItem('routeflow-home');
    resetRouteState();
    state.numClusters = 1; state.activeFilter = -1;
    document.getElementById('clusterSlider').value = 1;
    document.getElementById('clusterVal').textContent = '1';
    updateClusterSlider();
    hideAddrModal();
    toast(`${newSpots.length} stops loaded`);
    render();
  }
}

export function resetToDefaultStops() {
  if (!confirm('Clear all stops and reset progress?')) return;
  state.SPOTS = [];
  localStorage.removeItem(STORE_SPOTS);
  state.visitedSet.clear(); saveSet(STORE_V, state.visitedSet);
  resetRouteState();
  state.numClusters = 1; state.activeFilter = -1;
  document.getElementById('clusterSlider').value = 1;
  document.getElementById('clusterVal').textContent = '1';
  updateClusterSlider();
  hideAddrModal();
  toast('All stops cleared');
  render();
}

// Fix failed address prompt
function showFixAddrPrompt(addr) {
  return new Promise(resolve => {
    const modal = document.getElementById('fixAddrModal');
    const input = document.getElementById('fixAddrInput');
    const list = document.getElementById('fixAddrAcList');
    const addrText = [addr.street, addr.city, addr.state].filter(Boolean).join(', ');
    input.value = addrText;
    document.getElementById('fixAddrTitle').textContent = 'Not found';
    document.getElementById('fixAddrDesc').textContent = `Couldn't locate "${addrText}"`;

    modal.classList.add('show');
    list.classList.remove('show');
    setTimeout(() => { input.focus(); input.select(); }, 100);

    let fixAcTimer = null, fixAcResults = [], fixAcIdx = -1, fixReqId = 0;

    function onFixInput() {
      clearTimeout(fixAcTimer);
      const q = input.value.trim();
      if (q.length < 3) { list.classList.remove('show'); fixAcResults = []; return; }
      fixAcTimer = setTimeout(async () => {
        const myReq = ++fixReqId;
        try {
          const params = new URLSearchParams({q, limit: '5', lang: 'en'});
          if (state.gpsPos) params.append('lat', state.gpsPos.lat), params.append('lon', state.gpsPos.lng);
          const r = await fetch(`https://photon.komoot.io/api/?${params}`);
          if (!r.ok || myReq !== fixReqId) return;
          const data = await r.json();
          if (myReq !== fixReqId) return;
          fixAcResults = (data.features || []).filter(f => f.properties.street || f.properties.name);
          fixAcIdx = -1;
          if (fixAcResults.length) { list.classList.add('show'); renderFixAc(); }
          else list.classList.remove('show');
        } catch {}
      }, 300);
    }

    function renderFixAc() {
      list.innerHTML = '';
      fixAcResults.forEach((f, i) => {
        const p = f.properties;
        const street = [p.housenumber, p.street || p.name].filter(Boolean).join(' ');
        const sub = [p.city || p.locality, p.state, p.postcode].filter(Boolean).join(', ');
        const item = document.createElement('div');
        item.className = 'addr-ac-item' + (i === fixAcIdx ? ' active' : '');
        item.innerHTML = `<div class="addr-ac-item-main">${esc(street || p.name || '')}</div><div class="addr-ac-item-sub">${esc(sub)}</div>`;
        item.onmousedown = e => { e.preventDefault(); selectFixResult(f); };
        list.appendChild(item);
      });
    }

    function selectFixResult(f) {
      const p = f.properties;
      const street = [p.housenumber, p.street || p.name].filter(Boolean).join(' ');
      const city = p.city || p.locality || p.county || '';
      const st = p.state || '';
      input.value = [street, city, st].filter(Boolean).join(', ');
      list.classList.remove('show');
      fixAcResults = [];
    }

    function onFixKeydown(e) {
      if (!list.classList.contains('show')) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); fixAcIdx = Math.min(fixAcIdx + 1, fixAcResults.length - 1); renderFixAc(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); fixAcIdx = Math.max(fixAcIdx - 1, 0); renderFixAc(); }
      else if (e.key === 'Enter' && fixAcIdx >= 0) { e.preventDefault(); selectFixResult(fixAcResults[fixAcIdx]); }
    }

    input.addEventListener('input', onFixInput);
    input.addEventListener('keydown', onFixKeydown);

    function cleanup() {
      modal.classList.remove('show');
      list.classList.remove('show');
      input.removeEventListener('input', onFixInput);
      input.removeEventListener('keydown', onFixKeydown);
      document.getElementById('fixAddrSkipBtn').onclick = null;
      document.getElementById('fixAddrRetryBtn').onclick = null;
      document.getElementById('fixAddrRemoveBtn').onclick = null;
    }

    document.getElementById('fixAddrSkipBtn').onclick = () => { cleanup(); resolve('skip'); };
    document.getElementById('fixAddrRemoveBtn').onclick = () => { cleanup(); resolve('remove'); };
    document.getElementById('fixAddrRetryBtn').onclick = () => {
      const parts = input.value.split(',').map(s => s.trim());
      addr.street = parts[0] || addr.street;
      addr.city = parts[1] || addr.city;
      addr.state = parts[2] || addr.state || '';
      addr.status = 'pending';
      addr.lat = null;
      addr.lng = null;
      cleanup();
      resolve('retry');
    };
  });
}

// Autocomplete helper
export function setupAutocomplete(inputEl, listEl, onSelect) {
  let timer = null, activeIdx = -1, results = [], reqId = 0;

  inputEl.addEventListener('input', () => {
    clearTimeout(timer);
    const q = inputEl.value.trim();
    if (q.length < 3) { listEl.classList.remove('show'); results = []; return; }
    timer = setTimeout(async () => {
      const myReq = ++reqId;
      try {
        const params = new URLSearchParams({q, limit: '5', lang: 'en'});
        if (state.gpsPos) params.append('lat', state.gpsPos.lat), params.append('lon', state.gpsPos.lng);
        const r = await fetch(`https://photon.komoot.io/api/?${params}`);
        if (!r.ok || myReq !== reqId) return;
        const data = await r.json();
        if (myReq !== reqId) return;
        results = (data.features || []).filter(f => f.properties.street || f.properties.name);
        activeIdx = -1;
        if (results.length) { listEl.classList.add('show'); renderList(); }
        else listEl.classList.remove('show');
      } catch {}
    }, 300);
  });

  inputEl.addEventListener('keydown', e => {
    if (!listEl.classList.contains('show')) {
      if (e.key === 'Enter' && onSelect.onEnter) { e.preventDefault(); onSelect.onEnter(); return; }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); activeIdx = Math.min(activeIdx + 1, results.length - 1); renderList(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); activeIdx = Math.max(activeIdx - 1, 0); renderList(); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIdx >= 0 && results[activeIdx]) pick(results[activeIdx]);
      else if (results.length) pick(results[0]);
    } else if (e.key === 'Escape') { listEl.classList.remove('show'); }
  });

  inputEl.addEventListener('blur', () => setTimeout(() => listEl.classList.remove('show'), 200));

  function renderList() {
    listEl.innerHTML = '';
    results.forEach((f, i) => {
      const p = f.properties;
      const street = [p.housenumber, p.street || p.name].filter(Boolean).join(' ');
      const sub = [p.city || p.locality, p.state, p.postcode, p.country].filter(Boolean).join(', ');
      const item = document.createElement('div');
      item.className = 'addr-ac-item' + (i === activeIdx ? ' active' : '');
      item.innerHTML = `<div class="addr-ac-item-main">${esc(street || p.name || '')}</div><div class="addr-ac-item-sub">${esc(sub)}</div>`;
      item.onmousedown = e => { e.preventDefault(); pick(f); };
      listEl.appendChild(item);
    });
  }

  function pick(f) {
    const p = f.properties;
    const street = [p.housenumber, p.street || p.name].filter(Boolean).join(' ');
    const city = p.city || p.locality || p.county || '';
    const st = p.state || '';
    const zip = p.postcode || '';
    listEl.classList.remove('show');
    results = [];
    onSelect.pick({street, city, state: st, zip, feature: f});
  }
}

export { normalizeState, parseAddressLine };

// Paste section handler
export function parsePastedText() {
  const text = document.getElementById('addrPasteArea').value.trim();
  if (!text) { toast('Nothing to parse'); return; }
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const addresses = lines.map(line => parseAddressLine(line.trim()));
  const missingState = addresses.filter(a => !a.state);
  if (missingState.length === addresses.length) {
    toast('Include a state in each address');
    return;
  }
  if (missingState.length) {
    toast(`${missingState.length} address${missingState.length > 1 ? 'es' : ''} missing state`);
  }
  importAddresses(addresses);
}

// Manual add
export function addManualAddress() {
  const streetEl = document.getElementById('addrManualStreet');
  const cityEl = document.getElementById('addrManualCity');
  const stateEl = document.getElementById('addrManualState');
  const zipEl = document.getElementById('addrManualZip');
  const street = streetEl.value.trim();
  const city = cityEl.value.trim();
  const st = stateEl.value.trim();
  const zip = zipEl.value.trim();
  if (!street) { streetEl.focus(); return; }
  if (!st) { toast('State required'); stateEl.focus(); return; }
  stagedAddresses.push({
    id: stagedAddresses.length + 1,
    street, city, state: st, zip, lat: null, lng: null, status: 'pending'
  });
  streetEl.value = ''; cityEl.value = ''; zipEl.value = ''; streetEl.focus();
  renderAddrPreview();
}

// Confirm button handler
export async function confirmAddresses() {
  if (!stagedAddresses.length) return;
  const btn = document.getElementById('addrConfirmBtn');
  btn.textContent = 'Resolving...'; btn.disabled = true;
  await geocodeStaged();
  btn.textContent = 'Apply Stops'; btn.disabled = false;
  const valid = stagedAddresses.filter(a => a.status === 'ok');
  if (!valid.length) { renderAddrPreview(); return; }
  applyValidStops(valid);
}

// Init file drop zone and tabs
export function initAddressUI() {
  const dropZone = document.getElementById('addrDropZone');
  const fileInput = document.getElementById('addrFileInput');

  dropZone.onclick = () => fileInput.click();
  dropZone.ondragover = e => { e.preventDefault(); dropZone.classList.add('dragover'); };
  dropZone.ondragleave = () => dropZone.classList.remove('dragover');
  dropZone.ondrop = e => {
    e.preventDefault(); dropZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };
  fileInput.onchange = e => { if (e.target.files[0]) processFile(e.target.files[0]); };

  document.querySelectorAll('.addr-tab').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('.addr-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.addr-section').forEach(s => s.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('addr' + tab.dataset.tab.charAt(0).toUpperCase() + tab.dataset.tab.slice(1) + 'Section').classList.add('active');
    };
  });
}
