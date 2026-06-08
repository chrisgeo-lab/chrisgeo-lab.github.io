// Pure parsers for the address import flow. No DOM, no app state — these
// are exercised in tests as well as the live import path.

/**
 * Inflate an XLSX (zip) file into a name → text map. Skips encrypted entries
 * and entries we can't decompress (we only need worksheet & sharedStrings XML).
 *
 * @param {Uint8Array} data
 * @returns {Promise<Record<string, string>>}
 */
export async function parseZip(data) {
  const files = {};
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
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

/** Parse the `<si><t>…</t></si>` shared-strings table out of XLSX. */
export function parseSharedStrings(xml) {
  const strings = [];
  const regex = /<t[^>]*>([^<]*)<\/t>/g;
  let m; while ((m = regex.exec(xml)) !== null) strings.push(m[1]);
  return strings;
}

/** Parse a `<sheet>` worksheet XML into an array-of-arrays of cell strings. */
export function parseSheetRows(xml, strings) {
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

/**
 * Split a single CSV/TSV line into trimmed cell strings.
 * Comma-delimited lines get RFC-4180 quoted-field handling; other delimiters split naively.
 */
export function parseCSVLine(line, delim) {
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

/**
 * Tokenize a CSV/TSV/PSV blob into rows. Auto-detects tab/pipe delimiters
 * when comma is the request but the header has no commas.
 *
 * @param {string} text
 * @param {string} delimiter  Hinted delimiter. Auto-promoted to '\t' or '|' for the comma case.
 * @returns {string[][]}      Rows (header included). Empty when there are < 2 non-blank lines.
 */
export function parseCSV(text, delimiter = ',') {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  let d = delimiter;
  const headerLine = lines[0];
  if (d === ',' && !headerLine.includes(',') && headerLine.includes('\t')) d = '\t';
  if (d === ',' && !headerLine.includes(',') && headerLine.includes('|')) d = '|';
  return lines.map(l => parseCSVLine(l, d));
}

/**
 * Parse a single XLSX worksheet (`xl/worksheets/sheet1.xml`) into rows.
 * Returns an empty array if the sheet has no data rows.
 *
 * @param {ArrayBuffer|Uint8Array} buffer  Raw .xlsx bytes from FileReader.
 */
export async function parseXLSX(buffer) {
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const zip = await parseZip(data);
  const sharedStrings = parseSharedStrings(zip['xl/sharedStrings.xml'] || '');
  const sheetXml = zip['xl/worksheets/sheet1.xml'] || '';
  return parseSheetRows(sheetXml, sharedStrings);
}
