import { describe, it, expect } from 'vitest';
import { momentAt, testTime, timeColumns } from '../../web/src/scene/timeline';

const FLEX = ['FLEX Test #', 'Fuel', 'Droplet initial diameter; mm', 'Visible flame extinction diameter; mm', 'Burning rate; mm', 'Burn time; s', 'Test end'];
const SAFFIRE2 = ['Sample Length', 'Ignition Power (W)', 'Ignition Time (s)', 'Burn Time (s)', '?-g Burn Length', '?-g Spread Length', '1-g Burn Length'];
const BASS = ['Test #', 'Calibrated  initial O2 % by vol', 'Calibrated final O2 % by vol'];
const DESIGN = ['Flame Type', 'Day', 'Fuel', 'Test', 'Xfuel', 'mfuel (mg/s)', 'XO2 (init)', 'XO2 (final)', 'pinit (atm)', 'pfinal (atm)', 'pmean (atm)'];
const SAMER = ['Sample Type', 'SAME Test #', 'Inlet velocity (cm/s)', 'Duration (sec)', 'Primary aging time (sec)'];
const CFI = ['Fuel', 'Test', ' XO2 before test', 'XO2  after test', 'Hot ignition', 'burn time (sec)'];

describe('timeColumns', () => {
  it('finds the droplet, burn-time and ending columns of FLEX', () =>
    expect(timeColumns(FLEX)).toMatchObject({ burn: 5, sizeFrom: 2, sizeTo: 3, ending: 6 }));
  it('finds ignition, burn time, sample length and the microgravity burn length of SAFFIRE-II', () =>
    expect(timeColumns(SAFFIRE2)).toMatchObject({ ignition: 2, burn: 3, sampleLength: 0, burnLength: 4 }));
  it('finds oxygen before and after', () => {
    expect(timeColumns(BASS)).toMatchObject({ o2From: 1, o2To: 2 });
    expect(timeColumns(CFI)).toMatchObject({ o2From: 2, o2To: 3, burn: 5 });
  });
  it('finds oxygen and pressure at the start and the end of a Flame Design test', () =>
    expect(timeColumns(DESIGN)).toMatchObject({ o2From: 6, o2To: 7, pFrom: 8, pTo: 9 }));
  it('finds the test duration of SAME-R, and not its aging time', () => expect(timeColumns(SAMER).duration).toBe(3));
  it('does not mistake a burning rate for a burn time', () => expect(timeColumns(['Burning rate; mm']).burn).toBeUndefined());
});

describe('testTime', () => {
  it('reads one FLEX test', () => {
    const t = testTime(FLEX, ['2', 'Methanol', '1.86', '0.94', '0.6', '5', 'Extinction'])!;
    expect(t.burnS).toBe(5);
    expect(t.size).toMatchObject({ from: 1.86, to: 0.94, unit: 'mm' });
    expect(t.ending).toBe('Extinction');
  });
  it('keeps the test when the extinction diameter is blank, without a size change', () => {
    const t = testTime(FLEX, ['4', 'Methanol', '2.06', '', '0.6', '7.64', 'Extinction'])!;
    expect(t.burnS).toBe(7.64);
    expect(t.size).toBeUndefined();
  });
  it('reads ignition, burn time and burned fraction of a SAFFIRE-II test', () => {
    const t = testTime(SAFFIRE2, ['29 cm', '80 W', '9.2 s', '145 s', '29 cm', '2.1 mm/s', 'Complete'])!;
    expect(t).toMatchObject({ ignitionS: 9.2, burnS: 145, burnedFraction: 1 });
  });
  it('reads a test that did not burn: no burn time, burned fraction 0', () => {
    const t = testTime(SAFFIRE2, ['29 cm', '80 W', '9.2 s', 'Insignificant', '~ 0', 'n/a', 'Complete'])!;
    expect(t).toMatchObject({ ignitionS: 9.2, burnS: null, burnedFraction: 0 });
  });
  it('gives no burned fraction when a cell holds two samples (5 and 24 cm)', () => {
    const t = testTime(SAFFIRE2, ['5 and 24 cm', '80 W', '9.2 s', '140 s', '5 cm & 0 (note 2)', 'n/a (Nomex)', '~ 0 (Nomex)'])!;
    expect(t.burnS).toBe(140);
    expect(t.burnedFraction).toBeUndefined();
    const u = testTime(SAFFIRE2, ['5 & 24 cm', '80 W', '9.2 s', '140 s', '5 cm & 0', '', ''])!;
    expect(u.burnedFraction).toBeUndefined();
  });
  it('reads oxygen before and after with no burn time', () =>
    expect(testTime(BASS, ['B2', '22.2', '1.6'])!.oxygen).toMatchObject({ from: 22.2, to: 1.6 }));
  it('reads oxygen and pressure from start to end, with the pressure unit', () => {
    const t = testTime(DESIGN, ['Normal', '1', 'C2H4', '3', '0.25', '1.5', '0.387', '0.352', '1.01', '1.29', '1.15'])!;
    expect(t.oxygen).toMatchObject({ from: 0.387, to: 0.352 });
    expect(t.pressure).toMatchObject({ from: 1.01, to: 1.29, unit: 'atm' });
  });
  it('reads a stated test duration', () => expect(testTime(SAMER, ['Kapton', '12', '10', '60', '720'])!.durationS).toBe(60));
  it('returns null for a row with nothing that changes over the test', () => {
    expect(testTime(BASS, ['B9', '', ''])).toBeNull();
    expect(testTime(['Test', 'Material'], ['S1', 'SIBAL'])).toBeNull();
  });
});

describe('momentAt', () => {
  const t = testTime(SAFFIRE2, ['29 cm', '80 W', '10 s', '90 s', '14.5 cm', '', ''])!;
  it('starts before ignition and ends after the flame is out', () => {
    expect(momentAt(t, 0)).toMatchObject({ phase: 'igniting', seconds: 0, total: 100 });
    expect(momentAt(t, 1)).toMatchObject({ phase: 'out', seconds: 100, burned: 0.5 });
  });
  it('burns between ignition and the end of the burn time', () => {
    const m = momentAt(t, 0.55); // 55 s: 45 s into a 90 s burn
    expect(m.phase).toBe('burning');
    expect(m.seconds).toBeCloseTo(55);
    expect(m.burned).toBeCloseTo(0.25);
  });
  it('runs a clock over a stated duration and moves pressure in a straight line', () => {
    const same = testTime(SAMER, ['Kapton', '12', '10', '60', '720'])!;
    expect(momentAt(same, 0.5)).toMatchObject({ phase: 'running', seconds: 30, total: 60 });
    const d = testTime(DESIGN, ['Normal', '1', 'C2H4', '3', '0.25', '1.5', '0.4', '0.3', '1', '2', '1.5'])!;
    expect(momentAt(d, 0.5).pressure).toBeCloseTo(1.5);
    expect(momentAt(d, 1).phase).toBe('out');
  });
  it('moves size and oxygen in a straight line between the two values NASA gives', () => {
    const flex = testTime(FLEX, ['2', 'Methanol', '2', '1', '0.6', '5', 'Extinction'])!;
    expect(momentAt(flex, 0.5).size).toBeCloseTo(1.5);
    const bass = testTime(BASS, ['B2', '22', '2'])!;
    expect(momentAt(bass, 0.25).oxygen).toBeCloseTo(17);
    expect(momentAt(bass, 0.25).phase).toBe('running');
  });
});
