import { toast } from './utils.js';
import { parseXLSX, parseCSV } from './import-parsers.js';
import { parseAddressLine, normalizeState } from './address-parse.js';

/**
 * Process uploaded file (CSV, TSV, or Excel).
 * Delegates to appropriate parser based on extension.
 * @param {File} file - Uploaded file
 * @param {Function} onImport - Callback(addresses[]) when parsing complete
 */
export function processFile(file, onImport) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'xlsx' || ext === 'xls') {
    processExcel(file, onImport);
  } else {
    const reader = new FileReader();
    reader.onload = e => parseCSVText(e.target.result, ext === 'tsv' ? '\t' : ',', onImport);
    reader.readAsText(file);
  }
}

/**
 * Process Excel file (.xlsx, .xls).
 * @param {File} file - Excel file
 * @param {Function} onImport - Callback(addresses[]) when parsing complete
 */
function processExcel(file, onImport) {
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const rows = await parseXLSX(e.target.result);
      if (rows.length < 2) { toast('No data rows found'); return; }
      const addresses = parseRows(rows[0], rows.slice(1));
      onImport(addresses);
    } catch (err) {
      console.error('Excel parse error:', err);
      toast('Couldn\'t parse Excel file — try CSV instead');
    }
  };
  reader.readAsArrayBuffer(file);
}

/**
 * Parse CSV/TSV text into addresses.
 * @param {string} text - CSV/TSV content
 * @param {string} delimiter - ',' or '\t'
 * @param {Function} onImport - Callback(addresses[]) when parsing complete
 */
export function parseCSVText(text, delimiter, onImport) {
  const rows = parseCSV(text, delimiter);
  if (!rows.length) { toast('No data rows found'); return; }
  const addresses = parseRows(rows[0], rows.slice(1));
  onImport(addresses);
}

/**
 * Parse rows into address objects with intelligent column detection.
 * @param {string[]} headers - Column headers
 * @param {Array<Array<string>>} dataRows - Data rows
 * @returns {Array<{street, city, state, zip, lat, lng}>}
 */
export function parseRows(headers, dataRows) {
  const h = headers.map(s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, ''));
  const streetCol = h.findIndex(c => c === 'street' || c === 'address' || c === 'streetaddress' || c === 'addr' || c === 'location');
  const cityCol = h.findIndex(c => c === 'city' || c === 'town' || c === 'municipality');
  const stateCol = h.findIndex(c => c === 'state' || c === 'st' || c === 'province');
  const zipCol = h.findIndex(c => c === 'zip' || c === 'zipcode' || c === 'postalcode' || c === 'postal');
  const latCol = h.findIndex(c => c === 'lat' || c === 'latitude');
  const lngCol = h.findIndex(c => c === 'lng' || c === 'lon' || c === 'longitude' || c === 'long');

  // Fallback: no street column → use positional heuristic
  if (streetCol === -1) {
    if (headers.length >= 3) {
      return dataRows.map(r => ({
        street: r[0] || '',
        city: r[1] || '',
        state: normalizeState(r[2] || ''),
        zip: (r[3] || '').replace(/[^\d-]/g, ''),
        lat: null,
        lng: null
      }));
    } else if (headers.length >= 2) {
      return dataRows.map(r => ({
        street: r[0] || '',
        city: r[1] || '',
        state: '',
        zip: '',
        lat: null,
        lng: null
      }));
    } else {
      toast('No "street" or "address" column found');
      return [];
    }
  }

  const results = dataRows.map(row => {
    const street = row[streetCol] || '';
    let city = cityCol >= 0 ? (row[cityCol] || '') : '';
    let st = stateCol >= 0 ? normalizeState(row[stateCol] || '') : '';
    const zip = zipCol >= 0 ? (row[zipCol] || '').replace(/[^\d-]/g, '') : '';

    // Heuristic: if no city column but street has comma, split it
    if (!city) {
      const parts = street.split(',');
      if (parts.length >= 2) {
        return {
          street: parts[0].trim(),
          city: parts[1].trim(),
          state: normalizeState(parts[2]?.trim() || '') || st,
          zip,
          lat: null,
          lng: null
        };
      }
    }

    const lat = latCol >= 0 ? parseFloat(row[latCol]) : null;
    const lng = lngCol >= 0 ? parseFloat(row[lngCol]) : null;
    return {
      street,
      city,
      state: st,
      zip,
      lat: isNaN(lat) ? null : lat,
      lng: isNaN(lng) ? null : lng
    };
  }).filter(r => r.street);

  if (stateCol === -1 && !results.some(r => r.state)) {
    toast('No state column found — some addresses may not resolve');
  }

  return results;
}

/**
 * Parse pasted text (one address per line) into address objects.
 * @param {string} text - Pasted text with newline-separated addresses
 * @returns {Array<{street, city, state, zip, lat, lng}>}
 */
export function parsePastedText(text) {
  if (!text || !text.trim()) {
    toast('Nothing to parse');
    return [];
  }

  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const addresses = lines.map(line => parseAddressLine(line.trim()));
  const missingState = addresses.filter(a => !a.state);

  if (missingState.length === addresses.length) {
    toast('Include a state in each address');
    return [];
  }

  if (missingState.length) {
    toast(`${missingState.length} address${missingState.length > 1 ? 'es' : ''} missing state`);
  }

  return addresses;
}
