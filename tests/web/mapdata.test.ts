import { describe, it, expect } from 'vitest';
import { buildMarkers, platformOf, tabsOf } from '../../web/src/scene/mapdata';
import { FIELDS, type Cell, type Row } from '../../src/shared/types';

const cell = (value: string | null, quote?: string): Cell =>
  ({ value, quote: value === null ? null : quote ?? value, source: 'u', status: value === null ? 'not stated' : 'stated' });
function row(over: Record<string, string | null>): Row {
  const r = {} as Row;
  for (const f of FIELDS) r[f] = cell(over[f] ?? null);
  return r;
}
const rows = [
  row({ psiId: 'PSI-10', name: 'ACME', pillar: 'Prevention', fuel: 'C2H4', hardware: 'ACME, Combustion Integrated Rack (CIR)' }),
  row({ psiId: 'PSI-69', name: 'FLEX', pillar: 'Suppression', fuel: 'Methanol', hardware: 'Combustion Integrated Rack (CIR)-Fluids and Combustion Facility (FCF)' }),
  row({ psiId: 'PSI-98', name: 'SAFFIRE-I', pillar: 'Prevention', hardware: 'Saffire 1 enclosure in Cygnus', airflow: '20 cm/s' }),
  row({ psiId: 'PSI-47', name: 'DAFT', hardware: 'TSI P-Trak' }),
  row({ psiId: 'PSI-60', name: 'Live one' }),
];
rows[4].unreviewed = true;

describe('platformOf: the group a marker sits in is the hardware its record states', () => {
  it('groups by words that are inside the stated hardware value', () => {
    expect(platformOf(rows[0])).toEqual({ label: 'Combustion Integrated Rack', stated: true });
    expect(platformOf(rows[1]).label).toBe('Combustion Integrated Rack');
    expect(platformOf(rows[2]).label).toBe('Cygnus');
  });
  it('uses the stated value itself when it names no shared facility', () => expect(platformOf(rows[3])).toEqual({ label: 'TSI P-Trak', stated: true }));
  it('says Not stated when the record states no hardware, never a guess', () => expect(platformOf(rows[4])).toEqual({ label: 'Not stated', stated: false }));
});

describe('buildMarkers: one marker per investigation, nothing invented', () => {
  const markers = buildMarkers(rows);
  it('makes a marker for every row, including live ones marked Unreviewed', () => {
    expect(markers.map((m) => m.psiId)).toEqual(['PSI-10', 'PSI-69', 'PSI-98', 'PSI-47', 'PSI-60']);
    expect(markers[4].unreviewed).toBe(true);
    expect(markers[0].unreviewed).toBe(false);
  });
  it('lists all 12 facts, with Not stated where the catalogue has none', () => {
    const m = markers[2];
    expect(m.fields.map((f) => f.key)).toEqual([...FIELDS]);
    expect(m.fields.find((f) => f.key === 'airflow')).toMatchObject({ value: '20 cm/s', stated: true });
    expect(m.fields.find((f) => f.key === 'oxygen')).toMatchObject({ value: 'Not stated', stated: false });
  });
  it('counts stated and not stated cells from the row itself', () => {
    expect(markers[2]).toMatchObject({ stated: 5, notStated: 7 });
    for (const m of markers) expect(m.stated + m.notStated).toBe(12);
  });
  it('carries the fuel for the hover label, or Not stated', () => {
    expect(markers[0].fuel).toBe('C2H4');
    expect(markers[2].fuel).toBe('Not stated');
  });
  it('keeps the markers of one platform next to each other on the ring', () => {
    expect(markers[0].group).toBe(markers[1].group);
    const gap = Math.abs(markers[0].angle - markers[1].angle);
    const other = Math.abs(markers[0].angle - markers[2].angle);
    expect(gap).toBeLessThan(other);
  });
  it('gives every marker its own place', () => expect(new Set(markers.map((m) => m.angle.toFixed(4))).size).toBe(5));
  it('offers All plus the pillars the data holds as marker sets', () =>
    expect(tabsOf(markers)).toEqual(['All', 'Prevention', 'Suppression', 'Pillar not stated']));
  it('places no marker on the Moon', () => expect(markers.every((m) => m.kind === 'earth')).toBe(true));
});
