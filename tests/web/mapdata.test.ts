import { describe, it, expect } from 'vitest';
import { buildMarkers, layout, NA, tabsOf } from '../../web/src/scene/mapdata';
import { FIELDS, type Cell, type Row } from '../../src/shared/types';
import type { TestTables } from '../../src/psi/tables';

const cell = (value: string | null, quote?: string): Cell =>
  ({ value, quote: value === null ? null : quote ?? value, source: 'u', status: value === null ? 'not stated' : 'stated' });
function row(over: Record<string, string | null>): Row {
  const r = {} as Row;
  for (const f of FIELDS) r[f] = cell(over[f] ?? null);
  return r;
}
const rows = [
  row({ psiId: 'PSI-98', name: 'SAFFIRE-I', type: 'Microgravity Investigation', airflow: '20 cm/s' }),
  row({ psiId: 'PSI-69', name: 'FLEX', fuel: 'Methanol' }),
];
const tables: TestTables[] = [
  { psiId: 'PSI-69', tables: [{ file: 'PSI-69_Experimental table_FLEX.csv', columns: ['O initial ambient composition; mole fraction', 'Ambient pressure; mmHg'], rows: [['0.21', '760'], ['0.21', '757.7'], ['0.3', '760']] }] },
];
const accuracy = { reviewedAt: '2026-11-14', marks: [{ id: 'PSI-98', cells: { name: true, fuel: false } }] };

describe('buildMarkers: the map shows only what the project files hold', () => {
  const markers = buildMarkers(rows, tables, accuracy);
  it('has the three tabs, named by the data', () => expect(tabsOf(markers)).toEqual(['Investigations', 'Tests', 'Results']));
  it('makes one marker per investigation, with stated values word for word', () => {
    const m = markers.find((x) => x.id === 'inv-PSI-98')!;
    expect(m).toMatchObject({ label: 'PSI-98 SAFFIRE-I', tab: 'Investigations', kind: 'earth' });
    expect(m.fields.find((f) => f.name === 'Airflow')).toMatchObject({ value: '20 cm/s', source: 'data/investigations.json' });
  });
  it('writes the not-available string for a value the catalogue does not state, never a guess', () => {
    const m = markers.find((x) => x.id === 'inv-PSI-98')!;
    expect(m.fields.find((f) => f.name === 'Oxygen')!.value).toBe(NA);
    expect(NA).toBe('غير متوفر');
  });
  it('makes one marker per NASA test table, with its real row and column counts', () => {
    const m = markers.find((x) => x.tab === 'Tests')!;
    expect(m.label).toBe('PSI-69 FLEX');
    expect(m.fields).toEqual(expect.arrayContaining([
      { name: 'Table file', value: 'PSI-69_Experimental table_FLEX.csv', source: 'data/tests/PSI-69.json' },
      { name: 'Tests (rows)', value: '3', source: 'data/tests/PSI-69.json' },
      { name: 'Columns', value: '2', source: 'data/tests/PSI-69.json' },
    ]));
  });
  it('reports the hand review exactly as the review file records it', () => {
    const m = markers.find((x) => x.id === 'res-review')!;
    expect(m.fields).toEqual(expect.arrayContaining([
      { name: 'Reviewed on', value: '2026-11-14', source: 'data/review/accuracy.json' },
      { name: 'Cells checked', value: '2', source: 'data/review/accuracy.json' },
      { name: 'Correct', value: '1', source: 'data/review/accuracy.json' },
      { name: 'Marked wrong', value: 'PSI-98 fuel', source: 'data/review/accuracy.json' },
    ]));
  });
  it('counts tests near each crew atmosphere from the tables', () => {
    const iss = markers.find((x) => x.id === 'res-atm-14.7')!;
    expect(iss.fields.find((f) => f.name === 'Tests inside the zone')!.value).toBe('2');
  });
  it('says not available for the review when there is no review file', () => {
    const m = buildMarkers(rows, tables, null).find((x) => x.id === 'res-review')!;
    expect(m.fields.every((f) => f.value === NA)).toBe(true);
  });
  it('uses no Moon markers: nothing in the project data belongs on the Moon', () =>
    expect(markers.some((m) => m.kind === 'moon')).toBe(false));
});

describe('layout: markers along one orbit at the space station inclination', () => {
  it('never goes above 51.6 degrees of latitude', () => {
    for (let i = 0; i < 19; i++) expect(Math.abs(layout(19, i).lat)).toBeLessThanOrEqual(51.6 + 1e-9);
  });
  it('gives every marker its own valid latitude and longitude', () => {
    const pts = Array.from({ length: 19 }, (_, i) => layout(19, i));
    for (const p of pts) { expect(Math.abs(p.lat)).toBeLessThanOrEqual(90); expect(Math.abs(p.lon)).toBeLessThanOrEqual(180); }
    expect(new Set(pts.map((p) => `${p.lat.toFixed(2)},${p.lon.toFixed(2)}`)).size).toBe(19);
  });
});
