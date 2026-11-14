import { describe, it, expect } from 'vitest';
import { buildReplay, rowForStep } from '../../web/src/scene/replay';
import { buildSceneSpec } from '../../web/src/scene/spec';
import { FIELDS, type Cell, type Row } from '../../src/shared/types';
import type { TestTables } from '../../src/psi/tables';

const cell = (value: string | null, quote?: string): Cell =>
  ({ value, quote: value === null ? null : quote ?? value, source: 'u', status: value === null ? 'not stated' : 'stated' });
function row(over: Record<string, Cell>): Row {
  const r = {} as Row;
  for (const f of FIELDS) r[f] = over[f] ?? cell(null);
  r.psiId = cell('PSI-68');
  return r;
}
const F = 'PSI-68_Experimental table_Flex2.csv';
const tables: TestTables = {
  psiId: 'PSI-68',
  tables: [
    { file: 'other.csv', columns: ['A'], rows: [['1']] },
    { file: F, columns: ['Test', 'Initial Droplet Diameter (mm)', 'Flow Velocity (cm/s)', 'Notes'],
      rows: [['T1', '1.5', '0.1', 'x'], ['T2', '5', '', 'y'], ['', '', '', 'only a note'], ['T3', '3', '5', '']] },
  ],
};
const r = row({
  sample: cell('1.5 to 5', `Column "Initial Droplet Diameter (mm)" (${F}): 1.5 to 5 across 3 rows`),
  airflow: cell('0.1 to 5', `Column "Flow Velocity (cm/s)" (${F}): 0.1 to 5 across 2 rows`),
  fuel: cell('heptane', 'burning heptane droplets'),
});

describe('buildReplay', () => {
  it('makes one step per test row, from the columns the cells were quoted from', () => {
    const replay = buildReplay(r, tables)!;
    expect(replay.file).toBe(F);
    expect(replay.columns).toEqual({ sample: 'Initial Droplet Diameter (mm)', airflow: 'Flow Velocity (cm/s)' });
    expect(replay.steps.map((s) => s.label)).toEqual(['Test T1', 'Test T2', 'Test T3']);
    expect(replay.steps[1].values).toEqual({ sample: '5', airflow: '' });
    expect(replay.steps[0].row).toBe(1);
    expect(replay.steps[2].row).toBe(4);
  });
  it('returns null when no cell was quoted from a table', () =>
    expect(buildReplay(row({ fuel: cell('heptane', 'burning heptane') }), tables)).toBeNull());
  it('returns null when the quoted table is not available', () =>
    expect(buildReplay(r, { psiId: 'PSI-68', tables: [] })).toBeNull());
});

describe('rowForStep', () => {
  it('puts one test in the row: stated values with their column units, missing ones Not stated', () => {
    const replay = buildReplay(r, tables)!;
    const spec = buildSceneSpec(rowForStep(r, replay, replay.steps[1]));
    expect(spec.parts.sample).toEqual({ stated: true, text: '5 mm' });
    expect(spec.sample.sizes).toEqual([0.005]);
    expect(spec.parts.airflow).toEqual({ stated: false, text: 'Not stated' });
    expect(spec.parts.fuel.text).toBe('heptane');
  });
  it('gives the airflow speed of that test', () => {
    const replay = buildReplay(r, tables)!;
    expect(buildSceneSpec(rowForStep(r, replay, replay.steps[2])).airflow).toMatchObject({ min: 5, max: 5 });
  });
});
