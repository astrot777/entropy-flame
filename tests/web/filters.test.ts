import { describe, it, expect } from 'vitest';
import { applyFilters } from '../../web/src/filters';
import { FIELDS, type Cell, type Row } from '../../src/shared/types';

const cell = (value: string | null): Cell => ({ value, quote: value, source: 'u', status: value ? 'stated' : 'not stated' });
function row(over: Partial<Record<string, string | null>>): Row {
  const r = {} as Row;
  for (const f of FIELDS) r[f] = cell(over[f] ?? null);
  return r;
}
const rows = [
  row({ psiId: 'PSI-1', pillar: 'Prevention', fuel: 'PMMA', oxygen: '21.5 to 21.7', hardware: 'Cygnus' }),
  row({ psiId: 'PSI-2', pillar: 'Suppression', fuel: 'heptane', oxygen: '0.18 to 0.40', hardware: 'CIR' }),
  row({ psiId: 'PSI-3', pillar: null, fuel: null, oxygen: null }),
];

describe('applyFilters', () => {
  it('keeps only rows whose pillar equals the filter', () =>
    expect(applyFilters(rows, { pillar: 'Prevention' }).map(r => r.psiId.value)).toEqual(['PSI-1']));
  it('matches text case-insensitively across all cell values', () =>
    expect(applyFilters(rows, { text: 'HEPT' }).map(r => r.psiId.value)).toEqual(['PSI-2']));
  it('never matches a null cell for a field filter', () =>
    expect(applyFilters(rows, { fuel: '' }).length).toBe(3) /* empty filter = no filter */);
  it('filters fuel and hardware by substring, ignoring nulls', () => {
    expect(applyFilters(rows, { fuel: 'pmma' }).map(r => r.psiId.value)).toEqual(['PSI-1']);
    expect(applyFilters(rows, { hardware: 'cir' }).map(r => r.psiId.value)).toEqual(['PSI-2']);
  });
  it('filters by oxygen range overlap and drops rows without oxygen', () => {
    expect(applyFilters(rows, { oxygenMin: 20 }).map(r => r.psiId.value)).toEqual(['PSI-1']);
    expect(applyFilters(rows, { oxygenMax: 1 }).map(r => r.psiId.value)).toEqual(['PSI-2']);
  });
});
