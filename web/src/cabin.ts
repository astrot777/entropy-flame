// "Compared with ISS cabin air": where a stated oxygen or pressure value sits against the air on the
// International Space Station. NASA's technical brief on habitable atmospheres gives the ISS cabin as
// 14.7 psia with 21% oxygen. Units are converted here only to compare; the value shown stays as NASA wrote it.
// This is a comparison of conditions, not a fire-risk score.
import type { Cell } from '../../src/shared/types';
import { unitFromQuote } from './units';

export const CABIN = {
  oxygenPercent: 21,
  pressurePsia: 14.7,
  source: 'https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-003-habitable-atmosphere.pdf',
};
/** "Like cabin air" bands. Entropy's own choice, stated wherever the result is shown. */
const OXYGEN_BAND = { lo: 19.5, hi: 23.5 };
const PRESSURE_BAND = { lo: 0.95, hi: 1.05 };

export interface Range { lo: number; hi: number }
export type Verdict = 'like' | 'above' | 'below' | 'crosses';
export interface CabinCheck { verdict: Verdict; label: string; detail: string }

// A number not glued to a letter, so the 2 in "O2" or "N2" is not read.
const NUMBER = /(?<![A-Za-z\d.])\d+(?:\.\d+)?/g;
const tidy = (n: number) => Number(n.toPrecision(12));
const span = (n: number[]): Range | null => (n.length ? { lo: Math.min(...n), hi: Math.max(...n) } : null);

/** Oxygen as a percentage. Mole fractions (every number at most 1) are turned into percent. */
export function oxygenPercent(cell: Cell): Range | null {
  if (cell.status === 'not stated' || !cell.value) return null;
  const n = (cell.value.match(NUMBER) ?? []).map(Number);
  if (!n.length) return null;
  const fraction = n.every((v) => v <= 1);
  return span((fraction ? n.map((v) => tidy(v * 100)) : n).filter((v) => v <= 100));
}

const TO_ATM: Record<string, number> = { psia: 1 / 14.696, psi: 1 / 14.696, atm: 1, mmhg: 1 / 760, torr: 1 / 760, kpa: 1 / 101.325, bar: 1 / 1.01325 };

/** Pressure in atmospheres. Uses the unit written next to each number, or else the table column's unit. */
export function pressureAtm(cell: Cell): Range | null {
  if (cell.status === 'not stated' || !cell.value) return null;
  const tokens = [...cell.value.matchAll(/(?<![A-Za-z\d.])(\d+(?:\.\d+)?)\s*(psia|psi|atm|mmhg|torr|kpa|bar)?\b/gi)]
    .map((m) => ({ n: Number(m[1]), unit: m[2]?.toLowerCase() }));
  const withUnit = tokens.filter((t) => t.unit);
  if (withUnit.length) return span(withUnit.map((t) => tidy(t.n * TO_ATM[t.unit!])));
  const column = unitFromQuote(cell.value, cell.quote ?? '')?.toLowerCase().replace(/\s/g, '');
  if (!column || !(column in TO_ATM)) return null;
  return span(tokens.map((t) => tidy(t.n * TO_ATM[column])));
}

function verdictOf(r: Range, band: Range): { verdict: Verdict; label: string } {
  if (r.lo >= band.lo && r.hi <= band.hi) return { verdict: 'like', label: 'Like ISS cabin' };
  if (r.lo > band.hi) return { verdict: 'above', label: 'Above ISS cabin' };
  if (r.hi < band.lo) return { verdict: 'below', label: 'Below ISS cabin' };
  if (r.lo < band.lo && r.hi > band.hi) return { verdict: 'crosses', label: 'Below to above ISS cabin' };
  return { verdict: 'crosses', label: r.hi > band.hi ? 'Cabin level to above' : 'Below to cabin level' };
}

const fmt = (v: number) => (Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2)).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
const rangeText = (r: Range, unit: string) => (r.lo === r.hi ? `${fmt(r.lo)} ${unit}` : `${fmt(r.lo)} to ${fmt(r.hi)} ${unit}`);

/** Where a stated oxygen or pressure value sits against ISS cabin air; null for other fields or no value. */
export function cabinCheck(field: string, cell: Cell): CabinCheck | null {
  if (field === 'oxygen') {
    const r = oxygenPercent(cell);
    if (!r) return null;
    const v = verdictOf(r, OXYGEN_BAND);
    return { ...v, detail: `Stated oxygen, as a percentage for this comparison: ${rangeText(r, '%')}. ISS cabin air: ${CABIN.oxygenPercent}% oxygen at ${CABIN.pressurePsia} psia. "Like cabin" means ${OXYGEN_BAND.lo} to ${OXYGEN_BAND.hi}%.` };
  }
  if (field === 'pressure') {
    const r = pressureAtm(cell);
    if (!r) return null;
    const v = verdictOf(r, PRESSURE_BAND);
    return { ...v, detail: `Stated pressure, in atmospheres for this comparison: ${rangeText(r, 'atm')}. ISS cabin air: ${CABIN.pressurePsia} psia (1 atm). "Like cabin" means ${PRESSURE_BAND.lo} to ${PRESSURE_BAND.hi} atm.` };
  }
  return null;
}
