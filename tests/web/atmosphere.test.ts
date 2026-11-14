import { describe, it, expect } from 'vitest';
import { testPoints, CREW_ATMOSPHERES, testsNear, closestTest } from '../../web/src/atmosphere';
import type { TestTables } from '../../src/psi/tables';

const tables = (psiId: string, list: { file: string; columns: string[]; rows: string[][] }[]): TestTables => ({ psiId, tables: list });

describe('testPoints: one point per test, from the oxygen and pressure NASA recorded for it', () => {
  it('reads mole fraction and atm columns (ACME Flame Design)', () => {
    const t = tables('PSI-10', [{ file: 'Normal Flame.csv', columns: ['Test', 'XO2 (init)', 'XO2 (final)', 'pinit (atm)', 'pmean (atm)'], rows: [['1', '0.207128374', '0.2', '1.01184402', '1.0']] }]);
    const [p] = testPoints(t);
    expect(p.o2).toBeCloseTo(20.7128, 3);
    expect(p.atm).toBeCloseTo(1.0118, 3);
    expect(p).toMatchObject({ psiId: 'PSI-10', file: 'Normal Flame.csv', row: 1, o2Text: '0.207128374', pText: '1.01184402', o2Column: 'XO2 (init)', pColumn: 'pinit (atm)' });
  });
  it('reads mmHg and a unit written in the cell', () => {
    const flex = tables('PSI-69', [{ file: 'FLEX.csv', columns: ['O initial ambient composition; mole fraction', 'Ambient pressure; mmHg'], rows: [['0.21', '760']] }]);
    expect(testPoints(flex)[0].atm).toBeCloseTo(1, 3);
    const cfi = tables('PSI-39', [{ file: 'CFI.csv', columns: ['Oxygen', 'Pressure'], rows: [['0.21', '3 atm']] }]);
    expect(testPoints(cfi)[0]).toMatchObject({ o2: 21, atm: 3 });
  });
  it('skips inverse-flame tables, where the oxygen column is the burner stream, not the air around the flame', () => {
    const t = tables('PSI-159', [{ file: 'CFI-G_Inverse Flames.csv', columns: ['XO2', 'approx p (bar)'], rows: [['0.85', '1.1']] }]);
    expect(testPoints(t)).toEqual([]);
  });
  it('skips rows that list several values or leave a cell blank', () => {
    const t = tables('PSI-68', [{ file: 'Flex2.csv', columns: ['Oxygen Mole Fraction', 'Ambient Pressure (atm)'], rows: [['0.17; 0.21', '0.5; 1.0'], ['0.21', ''], ['0.21', '1.0']] }]);
    expect(testPoints(t).map((p) => p.row)).toEqual([3]);
  });
  it('returns nothing for a table without both an oxygen and a pressure column', () =>
    expect(testPoints(tables('PSI-25', [{ file: 'BASS-II.csv', columns: ['Calibrated  initial O2 % by vol'], rows: [['22.2']] }]))).toEqual([]));
});

describe('CREW_ATMOSPHERES: the three atmospheres NASA names in the PSI-20 record', () => {
  it('holds 14.7 psia 21%, 10.2 psia 26.5%, 8.2 psia 34%, with the source sentence', () => {
    expect(CREW_ATMOSPHERES.map((a) => [a.psia, a.o2])).toEqual([[14.7, 21], [10.2, 26.5], [8.2, 34]]);
    for (const a of CREW_ATMOSPHERES) expect(a.quote).toContain(`${a.psia} psia`);
  });
});

describe('testsNear: how many tests ran close to an atmosphere', () => {
  const pts = [
    { o2: 21, atm: 1 }, { o2: 22, atm: 1.03 }, { o2: 34, atm: 0.56 }, { o2: 40, atm: 1 },
  ].map((p, i) => ({ ...p, psiId: 'X', file: 'f', row: i + 1, o2Text: '', pText: '', o2Column: '', pColumn: '' }));
  it('counts tests within 2 oxygen points and 10% of the pressure', () => {
    expect(testsNear(pts, { psia: 14.7, o2: 21 }).length).toBe(2);
    expect(testsNear(pts, { psia: 8.2, o2: 34 }).length).toBe(1);
    expect(testsNear(pts, { psia: 10.2, o2: 26.5 }).length).toBe(0);
  });
  it('names the closest test even when none falls inside the zone', () => {
    const near = [{ o2: 33.6, atm: 0.5 }, { o2: 21, atm: 1 }].map((p, i) => ({ ...p, psiId: i ? 'B' : 'A', file: 'f', row: i + 1, o2Text: '', pText: '', o2Column: '', pColumn: '' }));
    expect(testsNear(near, { psia: 8.2, o2: 34 }).length).toBe(0);
    expect(closestTest(near, { psia: 8.2, o2: 34 })!.psiId).toBe('A');
    expect(closestTest([], { psia: 8.2, o2: 34 })).toBeNull();
  });
});
