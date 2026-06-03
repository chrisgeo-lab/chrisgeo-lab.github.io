const US_STATES = new Set(['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC']);
const US_STATE_NAMES = {'alabama':'AL','alaska':'AK','arizona':'AZ','arkansas':'AR','california':'CA','colorado':'CO','connecticut':'CT','delaware':'DE','florida':'FL','georgia':'GA','hawaii':'HI','idaho':'ID','illinois':'IL','indiana':'IN','iowa':'IA','kansas':'KS','kentucky':'KY','louisiana':'LA','maine':'ME','maryland':'MD','massachusetts':'MA','michigan':'MI','minnesota':'MN','mississippi':'MS','missouri':'MO','montana':'MT','nebraska':'NE','nevada':'NV','newhampshire':'NH','newjersey':'NJ','newmexico':'NM','newyork':'NY','northcarolina':'NC','northdakota':'ND','ohio':'OH','oklahoma':'OK','oregon':'OR','pennsylvania':'PA','rhodeisland':'RI','southcarolina':'SC','southdakota':'SD','tennessee':'TN','texas':'TX','utah':'UT','vermont':'VT','virginia':'VA','washington':'WA','westvirginia':'WV','wisconsin':'WI','wyoming':'WY','districtofcolumbia':'DC'};

export function normalizeState(s) {
  if (!s) return '';
  const upper = s.trim().toUpperCase();
  if (US_STATES.has(upper)) return upper;
  const key = s.trim().toLowerCase().replace(/\s+/g, '');
  return US_STATE_NAMES[key] || s.trim();
}

export function parseAddressLine(line) {
  let parts;
  if (line.includes('\t')) parts = line.split('\t');
  else if (line.includes('|')) parts = line.split('|');
  else if (line.includes(',')) parts = line.split(',');
  else if (/\s{3,}/.test(line)) parts = line.split(/\s{3,}/);
  else parts = null;

  if (parts) {
    parts = parts.map(p => p.trim()).filter(Boolean);
    let street = '', city = '', st = '', zip = '';
    if (parts.length >= 4) {
      street = parts[0]; city = parts[1]; st = normalizeState(parts[2]); zip = parts[3].replace(/[^\d-]/g, '');
    } else if (parts.length === 3) {
      street = parts[0]; city = parts[1];
      if (/^\d{5}(-\d{4})?$/.test(parts[2].trim())) zip = parts[2].trim();
      else st = normalizeState(parts[2]);
    } else if (parts.length === 2) {
      street = parts[0]; city = parts[1];
    } else {
      street = parts[0];
    }
    return {street, city, state: st, zip, lat: null, lng: null};
  }

  // No delimiter detected — try to parse "123 Main St Springfield IL 62701" format
  const zipMatch = line.match(/\s(\d{5}(?:-\d{4})?)\s*$/);
  let zip = '';
  let remaining = line;
  if (zipMatch) {
    zip = zipMatch[1];
    remaining = line.slice(0, zipMatch.index).trim();
  }

  // Try to find state abbreviation or name at end
  const words = remaining.split(/\s+/);
  let st = '';
  if (words.length >= 3) {
    const last = words[words.length - 1];
    if (US_STATES.has(last.toUpperCase())) {
      st = last.toUpperCase();
      words.pop();
    } else {
      const twoWord = words.slice(-2).join('').toLowerCase();
      if (US_STATE_NAMES[twoWord]) {
        st = US_STATE_NAMES[twoWord];
        words.pop(); words.pop();
      }
    }
  }

  // Treat entire remaining as street (geocoder will resolve city)
  return {street: words.join(' '), city: '', state: st, zip, lat: null, lng: null};
}
