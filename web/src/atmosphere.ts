// "Tested atmospheres": every test in NASA's experimental tables that records both the oxygen and the
// pressure around the flame becomes one point. The three crew atmospheres come from a NASA sentence in the
// PSI-20 record. Units are converted only to place points on one chart; the values shown stay as NASA wrote them.
import type { TestTables } from '../../src/psi/tables';
import type { Cell } from '../../src/shared/types';
import { oxygenPercent, pressureAtm } from './cabin';

export interface TestPoint {
  psiId: string; file: string; row: number;
  /** Oxygen in percent and pressure in atm, for placing the point only. */
  o2: number; atm: number;
  /** The cells and columns exactly as NASA wrote them. */
  o2Text: string; pText: string; o2Column: string; pColumn: string;
}
export interface CrewAtmosphere { psia: number; o2: number; label: string; quote: string; psiId: string }

const PSI20_QUOTE = 'NASA - considered atmosphere for human space missions will be examined: 14.7 psia, 21 % oxygen: 10.2 psia, 26.5 %; and 8.2 psia, 34 % oxygen.';
export const CREW_ATMOSPHERES: CrewAtmosphere[] = [
  { psia: 14.7, o2: 21, label: 'ISS cabin air', quote: PSI20_QUOTE, psiId: 'PSI-20' },
  { psia: 10.2, o2: 26.5, label: 'NASA-considered crew atmosphere', quote: PSI20_QUOTE, psiId: 'PSI-20' },
  { psia: 8.2, o2: 34, label: 'NASA-considered crew atmosphere', quote: PSI20_QUOTE, psiId: 'PSI-20' },
];
export const PSIA_PER_ATM = 14.696;

const OXYGEN_COLUMN = /\bO2\b|XO2|oxygen|^O initial/i;
const NOT_AMBIENT_OXYGEN = /final|after|flow|mg\/s|CO2/i;
const PRESSURE_COLUMN = /pressure|^p\s*init|^approx p\b/i;
const NOT_START_PRESSURE = /final|mean/i;
const SINGLE = /^[~≈]?\s*\d+(?:\.\d+)?\s*[a-z%]*$/i;

const asCell = (column: string, file: string, text: string): Cell =>
  ({ value: text, quote: `Column "${column}" (${file}): ${text}`, source: '', status: 'stated' });

/** One point per test that states a single oxygen value and a single pressure value. */
export function testPoints(t: TestTables): TestPoint[] {
  const out: TestPoint[] = [];
  for (const table of t.tables) {
    // In an inverse flame the oxygen flows from the burner; the oxygen column is not the air around the flame.
    if (/inverse/i.test(table.file)) continue;
    const oi = table.columns.findIndex((c) => OXYGEN_COLUMN.test(c) && !NOT_AMBIENT_OXYGEN.test(c));
    const pi = table.columns.findIndex((c) => PRESSURE_COLUMN.test(c) && !NOT_START_PRESSURE.test(c));
    if (oi < 0 || pi < 0) continue;
    const o2Column = table.columns[oi];
    const pColumn = table.columns[pi];
    table.rows.forEach((cells, r) => {
      const o2Text = (cells[oi] ?? '').trim();
      const pText = (cells[pi] ?? '').trim();
      if (!SINGLE.test(o2Text) || !SINGLE.test(pText)) return;
      const o2 = oxygenPercent(asCell(o2Column, table.file, o2Text));
      const atm = pressureAtm(asCell(pColumn, table.file, pText));
      if (!o2 || !atm) return;
      out.push({ psiId: t.psiId, file: table.file, row: r + 1, o2: o2.lo, atm: atm.lo, o2Text, pText, o2Column, pColumn });
    });
  }
  return out;
}

/** Tests within 2 oxygen points and 10% of the pressure of an atmosphere. */
export function testsNear(points: TestPoint[], a: { psia: number; o2: number }): TestPoint[] {
  const atm = a.psia / PSIA_PER_ATM;
  return points.filter((p) => Math.abs(p.o2 - a.o2) <= 2 && Math.abs(p.atm - atm) <= 0.1 * atm);
}

/** The single test closest to an atmosphere, measured in the same units as the "near" zone. */
export function closestTest(points: TestPoint[], a: { psia: number; o2: number }): TestPoint | null {
  const atm = a.psia / PSIA_PER_ATM;
  let best: TestPoint | null = null;
  let bestD = Infinity;
  for (const p of points) {
    const d = Math.hypot((p.o2 - a.o2) / 2, (p.atm - atm) / (0.1 * atm));
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}
