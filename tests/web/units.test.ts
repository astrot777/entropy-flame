import { describe, it, expect } from 'vitest';
import { unitFromQuote } from '../../web/src/units';

describe('unitFromQuote', () => {
  it('takes the unit in parentheses from a table column name', () =>
    expect(unitFromQuote('0.1 to 5', 'Column "Flow Velocity (cm/s)" (PSI-68_x.csv): 0.1 to 5 across 8 rows')).toBe('cm/s'));
  it('takes the unit after a semicolon', () =>
    expect(unitFromQuote('0 to 2319.9', 'Column "Ambient pressure; mmHg" (PSI-69_x.csv): 0 to 2319.9 across 274 rows')).toBe('mmHg'));
  it('reads "percent" as %', () =>
    expect(unitFromQuote('2100 to 3400', 'Column "Oxygen Conc (percent)" (PSI-20_x.csv): 2100 to 3400 across 2 rows')).toBe('%'));
  it('returns null when the value already carries words or units', () =>
    expect(unitFromQuote('0.1 to 0.4 mole fraction', 'Column "X (mole)" (a.csv): 0.1 to 0.4 mole fraction')).toBeNull());
  it('returns null for a quote that is not a table line', () =>
    expect(unitFromQuote('20 cm/s', 'air flow velocity of 20 cm/s.')).toBeNull());
  it('returns null when the column name has no unit', () =>
    expect(unitFromQuote('21.5 to 21.7', 'Column "Percent O2" (PSI-98.csv): 21.5 to 21.7 across 2 rows')).toBeNull());
});
