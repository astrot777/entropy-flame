import { describe, it, expect } from 'vitest';
import { compareRows, rangeChart } from '../../web/src/compare';
import { FIELDS, type Cell, type Row } from '../../src/shared/types';

const cell = (value: string | null): Cell => ({ value, quote: value, source: 'u', status: value ? 'stated' : 'not stated' });
function row(over: Partial<Record<string, string | null>>): Row {
  const r = {} as Row;
  for (const f of FIELDS) r[f] = cell(over[f] === undefined ? 'x' : over[f]!);
  return r;
}
const state = (res: ReturnType<typeof compareRows>, f: string) => res.find((e) => e.field === f)?.state;

describe('compareRows', () => {
  it('marks equal hardware as same, ignoring case and spacing', () =>
    expect(state(compareRows([row({ hardware: 'CIR' }), row({ hardware: 'cir ' }), row({ hardware: 'CIR' })]), 'hardware')).toBe('same'));
  it('marks differing fuel as different', () =>
    expect(state(compareRows([row({ fuel: 'PMMA' }), row({ fuel: 'heptane' })]), 'fuel')).toBe('different'));
  it('marks a field not-stated when any row lacks it', () =>
    expect(state(compareRows([row({ oxygen: '21%' }), row({ oxygen: '21%' }), row({ oxygen: null })]), 'oxygen')).toBe('not-stated'));
  it('always returns 12 entries in FIELDS order', () =>
    expect(compareRows([row({}), row({})]).map((e) => e.field)).toEqual([...FIELDS]));
});

describe('rangeChart: the stated ranges of the selected investigations on one scale', () => {
  const quoted = (value: string, column: string): Cell => ({ value, quote: `Column "${column}" (a.csv): ${value} across 9 rows`, source: 'u', status: 'stated' });
  const a = row({ psiId: 'PSI-10', oxygen: '0.2 to 0.4 mole fraction' });
  const b = row({ psiId: 'PSI-98', oxygen: null });
  b.oxygen = quoted('21.5 to 21.7', 'Percent O2');
  const c = row({ psiId: 'PSI-21', oxygen: null, pressure: null });
  it('puts mole fractions and percentages on one percent scale', () => {
    const chart = rangeChart([a, b], 'oxygen');
    expect(chart.bars.map((x) => x.range)).toEqual([{ lo: 20, hi: 40 }, { lo: 21.5, hi: 21.7 }]);
    expect(chart.reference).toBe(21);
    expect(chart.max).toBe(50);
  });
  it('keeps the value as NASA wrote it next to the bar', () =>
    expect(rangeChart([a, b], 'oxygen').bars[0].text).toBe('0.2 to 0.4 mole fraction'));
  it('says which investigation is highest and which go above cabin air', () =>
    expect(rangeChart([a, b], 'oxygen').finding).toBe('Highest stated oxygen: PSI-10, up to 40 %. Above ISS cabin air: PSI-10.'));
  it('gives no bar, and says so, when a value is not stated', () => {
    const chart = rangeChart([a, c], 'oxygen');
    expect(chart.bars[1].range).toBeNull();
    expect(chart.finding).toContain('1 of 2 has no comparable value.');
    expect(rangeChart([c], 'pressure').finding).toBe('None of the selected investigations states a comparable pressure value.');
  });
});
