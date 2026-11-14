import { describe, it, expect } from 'vitest';
import { buildSceneSpec } from '../../web/src/scene/spec';
import { FIELDS, type Cell, type Row } from '../../src/shared/types';

const cell = (value: string | null, quote?: string): Cell =>
  ({ value, quote: value === null ? null : quote ?? value, source: 'u', status: value === null ? 'not stated' : 'stated' });
function row(over: Record<string, Cell>): Row {
  const r = {} as Row;
  for (const f of FIELDS) r[f] = over[f] ?? cell(null);
  r.psiId = cell('PSI-1');
  return r;
}

describe('buildSceneSpec: sample shape', () => {
  const shape = (value: string, quote?: string) => buildSceneSpec(row({ sample: cell(value, quote) })).sample.shape;
  it('reads a sheet from length and width', () => expect(shape('approximately 0.94 meters long and 0.4 meters wide')).toBe('sheet'));
  it('reads a sheet from "5 cm x 29 cm"', () => expect(shape('9 samples, each 5 cm x 29 cm')).toBe('sheet'));
  it('reads a sphere from a droplet-diameter column', () =>
    expect(shape('1.5 to 5', 'Column "Initial Droplet Diameter (mm)" (a.csv): 1.5 to 5 across 8 rows')).toBe('sphere'));
  it('reads a sphere before a burner in "spherical porous burner"', () => expect(shape('spherical porous burner')).toBe('sphere'));
  it('reads a burner', () => expect(shape('porous circular burners of 25  and 50 mm diameter')).toBe('burner'));
  it('takes the first shape NASA lists', () => expect(shape('rods, spherical section, slabs, films, and fabric sheets')).toBe('rod'));
  it('reads dust as particles', () => expect(shape('Arizona Red Dust (ARD)')).toBe('particles'));
  it('falls back to a generic marker', () => expect(shape('something else')).toBe('generic'));
  it('marks a missing sample as not stated', () => expect(buildSceneSpec(row({})).sample.stated).toBe(false));
});

describe('buildSceneSpec: sample sizes (metres, for proportions only)', () => {
  const sizes = (value: string, quote?: string) => buildSceneSpec(row({ sample: cell(value, quote) })).sample.sizes;
  it('reads metres', () => expect(sizes('approximately 0.94 meters long and 0.4 meters wide')).toEqual([0.94, 0.4]));
  it('shares one unit across "25 and 50 mm"', () => expect(sizes('porous circular burners of 25  and 50 mm diameter')).toEqual([0.025, 0.05]));
  it('ignores a count that is not a size', () => expect(sizes('9 samples, each 5 cm x 29 cm')).toEqual([0.05, 0.29]));
  it('takes the unit from the table column for a bare range', () =>
    expect(sizes('1.5 to 5', 'Column "Initial Droplet Diameter (mm)" (a.csv): 1.5 to 5 across 8 rows')).toEqual([0.0015, 0.005]));
  it('returns no sizes when none are written', () => expect(sizes('spherical porous burner')).toEqual([]));
});

describe('buildSceneSpec: airflow', () => {
  const flow = (value: string | null, quote?: string) => buildSceneSpec(row({ airflow: cell(value, quote) })).airflow;
  it('reads a single speed', () => expect(flow('20 cm/s')).toMatchObject({ stated: true, quiescent: false, min: 20, max: 20 }));
  it('reads a range with units in the text', () => expect(flow('5.4 cm/s to 65 cm/s')).toMatchObject({ min: 5.4, max: 65 }));
  it('reads a range whose unit is in the column name', () =>
    expect(flow('0.1 to 5', 'Column "Flow Velocity (cm/s)" (a.csv): 0.1 to 5 across 8 rows')).toMatchObject({ min: 0.1, max: 5 }));
  it('reads quiescent as stated, with no flow', () => expect(flow('quiescent')).toMatchObject({ stated: true, quiescent: true, min: null }));
  it('marks missing airflow as not stated', () => expect(flow(null)).toMatchObject({ stated: false, quiescent: false, min: null, max: null }));
});

describe('buildSceneSpec: sensors, gravity and part labels', () => {
  it('lists instruments word for word from the value', () =>
    expect(buildSceneSpec(row({ sensors: cell('cameras, radiometers, photomultiplier tubes, and thermocouples') })).sensors)
      .toEqual(['cameras', 'radiometers', 'photomultiplier tubes', 'thermocouples']));
  it('keeps an unrecognised sensor value as one item', () =>
    expect(buildSceneSpec(row({ sensors: cell('M-pass') })).sensors).toEqual(['M-pass']));
  it('has no sensors when not stated', () => expect(buildSceneSpec(row({})).sensors).toEqual([]));
  it('reads gravity from the type cell', () => {
    expect(buildSceneSpec(row({ type: cell('Microgravity Investigation') })).gravity).toBe('micro');
    expect(buildSceneSpec(row({ type: cell('Ground Investigation') })).gravity).toBe('ground');
    expect(buildSceneSpec(row({})).gravity).toBeNull();
  });
  it('labels every part with its value and source unit, or Not stated', () => {
    const s = buildSceneSpec(row({
      pressure: cell('0 to 2319.9', 'Column "Ambient pressure; mmHg" (a.csv): 0 to 2319.9 across 274 rows'),
      fuel: cell('PMMA'),
    }));
    expect(s.parts.pressure).toEqual({ stated: true, text: '0 to 2319.9 mmHg' });
    expect(s.parts.fuel).toEqual({ stated: true, text: 'PMMA' });
    expect(s.parts.oxygen).toEqual({ stated: false, text: 'Not stated' });
  });
});
