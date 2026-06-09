// Pure parser tests — no DOM, no app state.
import { describe, it, expect } from './runner.js';
import { parseCSV, parseCSVLine, parseSharedStrings, parseSheetRows } from '../js/import-parsers.js';

describe('parseCSVLine', () => {
  it('splits a comma-delimited line', () => {
    const cells = parseCSVLine('123 Main St,Boston,MA,02101', ',');
    expect(cells.length).toBe(4);
    expect(cells[0]).toBe('123 Main St');
    expect(cells[2]).toBe('MA');
  });

  it('respects quoted commas in CSV', () => {
    const cells = parseCSVLine('"Smith, John","Boston, MA",1', ',');
    expect(cells[0]).toBe('Smith, John');
    expect(cells[1]).toBe('Boston, MA');
    expect(cells[2]).toBe('1');
  });

  it('splits a tab-delimited line', () => {
    const cells = parseCSVLine('a\tb\tc', '\t');
    expect(cells).toEqual(['a', 'b', 'c']);
  });
});

describe('parseCSV', () => {
  it('returns empty array when input has fewer than 2 non-blank lines', () => {
    expect(parseCSV('').length).toBe(0);
    expect(parseCSV('only one line').length).toBe(0);
  });

  it('returns header + data rows', () => {
    const rows = parseCSV('street,city\n1 Main,Boston\n2 Elm,Springfield', ',');
    expect(rows.length).toBe(3);
    expect(rows[0]).toEqual(['street', 'city']);
    expect(rows[1]).toEqual(['1 Main', 'Boston']);
  });

  it('promotes "," to "\\t" when the comma header has none but tabs are present', () => {
    const text = 'street\tcity\n1 Main\tBoston\n2 Elm\tSpringfield';
    const rows = parseCSV(text, ',');
    expect(rows[1]).toEqual(['1 Main', 'Boston']);
  });

  it('promotes "," to "|" when the comma header has none but pipes are present', () => {
    const text = 'street|city\n1 Main|Boston';
    const rows = parseCSV(text, ',');
    expect(rows[1]).toEqual(['1 Main', 'Boston']);
  });
});

describe('parseSharedStrings', () => {
  it('extracts <t> elements from a sharedStrings xml blob', () => {
    const xml = '<sst><si><t>hello</t></si><si><t>world</t></si></sst>';
    expect(parseSharedStrings(xml)).toEqual(['hello', 'world']);
  });

  it('returns empty array on empty input', () => {
    expect(parseSharedStrings('').length).toBe(0);
  });
});

describe('parseSheetRows', () => {
  it('parses inline numeric values into rows', () => {
    const xml = '<sheet><row><c r="A1"><v>10</v></c><c r="B1"><v>20</v></c></row></sheet>';
    const rows = parseSheetRows(xml, []);
    expect(rows.length).toBe(1);
    expect(rows[0]).toEqual(['10', '20']);
  });

  it('resolves shared-string indices via the strings table', () => {
    const xml = '<sheet><row><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row></sheet>';
    const rows = parseSheetRows(xml, ['hello', 'world']);
    expect(rows[0]).toEqual(['hello', 'world']);
  });

  it('drops fully-blank rows', () => {
    const xml = '<sheet><row><c r="A1"><v>10</v></c></row><row></row></sheet>';
    const rows = parseSheetRows(xml, []);
    expect(rows.length).toBe(1);
  });
});
