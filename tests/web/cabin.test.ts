import { describe, it, expect } from 'vitest';
import { cabinCheck, oxygenPercent, pressureAtm, CABIN } from '../../web/src/cabin';
import type { Cell } from '../../src/shared/types';

const cell = (value: string | null, quote?: string): Cell =>
  ({ value, quote: value === null ? null : quote ?? value, source: 'u', status: value === null ? 'not stated' : 'stated' });
const col = (name: string, value: string) => cell(value, `Column "${name}" (a.csv): ${value} across 9 rows`);

describe('CABIN: the ISS reference values', () => {
  it('is 21% oxygen at 14.7 psia (1 atm)', () => {
    expect(CABIN.oxygenPercent).toBe(21);
    expect(CABIN.pressurePsia).toBe(14.7);
  });
});

describe('oxygenPercent: oxygen as a percentage, for comparison only', () => {
  it('reads a percent range', () => expect(oxygenPercent(col('Percent O2', '21.5 to 21.7'))).toEqual({ lo: 21.5, hi: 21.7 }));
  it('turns a mole fraction into a percent', () => {
    expect(oxygenPercent(cell('0.1 to 0.4 mole fraction'))).toEqual({ lo: 10, hi: 40 });
    expect(oxygenPercent(col('XO2 (init)', '0.198048193 to 0.4'))).toEqual({ lo: 19.8048193, hi: 40 });
  });
  it('ignores the 2 in "O2" and "N2"', () =>
    expect(oxygenPercent(cell('~21% O2 with N2; ~30% O2 with N2'))).toEqual({ lo: 21, hi: 30 }));
  it('leaves out percentages above 100, which cannot be real', () =>
    expect(oxygenPercent(col('Oxygen Conc (percent)', '21; 25; 26.5; 34; 40; 2100%; 3400%'))).toEqual({ lo: 21, hi: 40 }));
  it('gives null for Not stated', () => expect(oxygenPercent(cell(null))).toBeNull());
});

describe('pressureAtm: pressure in atmospheres, for comparison only', () => {
  it('uses the unit from the column name', () => {
    expect(pressureAtm(col('pinit (atm)', '0.931972789 to 1.29695676'))).toEqual({ lo: 0.931972789, hi: 1.29695676 });
    const mm = pressureAtm(col('Ambient pressure; mmHg', '0 to 2319.9'))!;
    expect(mm.lo).toBe(0);
    expect(mm.hi).toBeCloseTo(3.0525, 3);
    expect(pressureAtm(col('approx p (bar)', '0.50665 to 3.0399'))!.hi).toBeCloseTo(3.0, 2);
  });
  it('reads units written next to each number and skips numbers with no pressure unit', () => {
    const p = pressureAtm(cell('14.7 psia, 21 % oxygen: 10.2 psia, 26.5 %; and 8.2 psia'))!;
    expect(p.lo).toBeCloseTo(8.2 / 14.696, 3);
    expect(p.hi).toBeCloseTo(1.0003, 3);
    expect(pressureAtm(cell('1 atm; 1.25 atm; 2 atm; 3 atm; 5 atm; and 2 more values'))).toEqual({ lo: 1, hi: 5 });
    expect(pressureAtm(cell('0.5 atm to 3.0 atm'))).toEqual({ lo: 0.5, hi: 3 });
  });
  it('gives null when no pressure unit is known', () => expect(pressureAtm(cell('0 to 5'))).toBeNull());
});

describe('cabinCheck: where a stated value sits against ISS cabin air', () => {
  it('says above, below, like cabin air, or a range that crosses it', () => {
    expect(cabinCheck('oxygen', col('Percent O2', '21.5 to 21.7'))!.verdict).toBe('like');
    expect(cabinCheck('oxygen', cell('~30% O2'))!.verdict).toBe('above');
    expect(cabinCheck('oxygen', col('Percent O2', '12 to 15'))!.verdict).toBe('below');
    expect(cabinCheck('oxygen', cell('0.1 to 0.4 mole fraction'))!.verdict).toBe('crosses');
    expect(cabinCheck('pressure', cell('0.5 atm to 3.0 atm'))!.verdict).toBe('crosses');
    expect(cabinCheck('pressure', cell('14.7 psia'))!.verdict).toBe('like');
  });
  it('writes a short label and an explanation that shows any unit change', () => {
    const c = cabinCheck('pressure', col('Ambient pressure; mmHg', '0 to 2319.9'))!;
    expect(c.label).toBe('Below to above ISS cabin');
    expect(c.detail).toContain('3.05 atm');
    expect(c.detail).toContain('14.7 psia');
  });
  it('compares only oxygen and pressure, and only stated values', () => {
    expect(cabinCheck('airflow', cell('20 cm/s'))).toBeNull();
    expect(cabinCheck('oxygen', cell(null))).toBeNull();
  });
});
