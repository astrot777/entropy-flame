// The markers of the space map. Every value is read from the project's own data files and carries the file it
// came from; a value the files do not hold is the literal string NA. Nothing here is invented.
// Marker positions are a layout over the globe, not locations: these experiments have no place on Earth.
import type { FieldKey, Row } from '../../../src/shared/types';
import type { TestTables } from '../../../src/psi/tables';
import { cellText } from '../source';
import { closestTest, CREW_ATMOSPHERES, testPoints, testsNear } from '../atmosphere';

export const NA = 'غير متوفر';
export interface MapField { name: string; value: string; source: string }
export interface MapMarker {
  id: string; label: string; tab: string; lat: number; lon: number; radiusFromEarth: number;
  kind: 'earth' | 'moon'; fields: MapField[];
}
export interface AccuracyFile { reviewedAt: string; marks: { id: string; cells: Record<string, boolean> }[] }

const BEAM = 26;
const INV = 'data/investigations.json';
const REVIEW = 'data/review/accuracy.json';
const SHOWN: [FieldKey, string][] = [
  ['type', 'Type'], ['pillar', 'Pillar'], ['fuel', 'Fuel'], ['sample', 'Sample'], ['oxygen', 'Oxygen'],
  ['pressure', 'Pressure'], ['airflow', 'Airflow'], ['hardware', 'Hardware'], ['sensors', 'Sensors'],
];

/** An even spread over the sphere (a golden-angle spiral), kept away from the poles. */
export function layout(n: number, i: number): { lat: number; lon: number } {
  const y = n === 1 ? 0 : 0.8 - (1.6 * i) / (n - 1);
  const lat = (Math.asin(y) * 180) / Math.PI;
  const lon = ((((i * 137.50776405) % 360) + 540) % 360) - 180;
  return { lat, lon };
}

export function tabsOf(markers: MapMarker[]): string[] {
  return [...new Set(markers.map((m) => m.tab))];
}

export function buildMarkers(rows: Row[], tables: TestTables[], accuracy: AccuracyFile | null): MapMarker[] {
  const name = (id: string) => rows.find((r) => r.psiId.value === id)?.name.value ?? '';
  const place = (list: Omit<MapMarker, 'lat' | 'lon' | 'radiusFromEarth' | 'kind'>[]): MapMarker[] =>
    list.map((m, i) => ({ ...m, ...layout(list.length, i), radiusFromEarth: BEAM, kind: 'earth' as const }));

  const investigations = place(rows.map((r) => ({
    id: `inv-${r.psiId.value}`,
    label: `${r.psiId.value} ${r.name.value ?? ''}`.trim(),
    tab: 'Investigations',
    fields: SHOWN.map(([key, label]) => ({ name: label, value: r[key].status === 'stated' ? cellText(key, r[key]) : NA, source: INV })),
  })));

  const tests = place(tables.flatMap((t) => t.tables.map((table, i) => {
    const source = `data/tests/${t.psiId}.json`;
    return {
      id: `tests-${t.psiId}-${i}`,
      label: `${t.psiId} ${name(t.psiId)}`.trim(),
      tab: 'Tests',
      fields: [
        { name: 'Table file', value: table.file, source },
        { name: 'Tests (rows)', value: String(table.rows.length), source },
        { name: 'Columns', value: String(table.columns.length), source },
      ],
    };
  })));

  const stated = rows.reduce((n, r) => n + Object.values(r).filter((c) => typeof c === 'object' && c !== null && 'status' in c && c.status === 'stated').length, 0);
  const cells = rows.reduce((n, r) => n + Object.values(r).filter((c) => typeof c === 'object' && c !== null && 'status' in c).length, 0);
  const marks = accuracy ? accuracy.marks.flatMap((m) => Object.entries(m.cells).map(([field, ok]) => ({ id: m.id, field, ok }))) : [];
  const wrong = marks.filter((m) => !m.ok).map((m) => `${m.id} ${m.field}`);
  const review: MapField[] = accuracy
    ? [
      { name: 'Reviewed on', value: accuracy.reviewedAt, source: REVIEW },
      { name: 'Cells checked', value: String(marks.length), source: REVIEW },
      { name: 'Correct', value: String(marks.filter((m) => m.ok).length), source: REVIEW },
      { name: 'Marked wrong', value: wrong.length ? wrong.join(', ') : 'none', source: REVIEW },
    ]
    : ['Reviewed on', 'Cells checked', 'Correct', 'Marked wrong'].map((n) => ({ name: n, value: NA, source: REVIEW }));

  const points = tables.flatMap(testPoints);
  const atmospheres = CREW_ATMOSPHERES.map((a) => {
    const near = testsNear(points, a).length;
    const c = near === 0 ? closestTest(points, a) : null;
    return {
      id: `res-atm-${a.psia}`,
      label: `${a.psia} psia, ${a.o2}% oxygen`,
      tab: 'Results',
      fields: [
        { name: 'Named in', value: `${a.psiId} record`, source: INV },
        { name: 'Tests inside the zone', value: points.length ? String(near) : NA, source: 'data/tests/*.json' },
        { name: 'Closest test', value: c ? `${c.psiId}: ${c.o2Text}, ${c.pText}` : near > 0 ? 'inside the zone' : NA, source: 'data/tests/*.json' },
      ],
    };
  });

  const results = place([
    { id: 'res-catalogue', label: 'Catalogue', tab: 'Results', fields: [
      { name: 'Investigations', value: String(rows.length), source: INV },
      { name: 'Values with a NASA source', value: String(stated), source: INV },
      { name: 'Not stated', value: String(cells - stated), source: INV },
    ] },
    { id: 'res-review', label: 'Hand review', tab: 'Results', fields: review },
    ...atmospheres,
  ]);

  return [...investigations, ...tests, ...results];
}
