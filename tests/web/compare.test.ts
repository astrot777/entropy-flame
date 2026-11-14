import { describe, it, expect } from 'vitest';
import { compareRows } from '../../web/src/compare';
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
