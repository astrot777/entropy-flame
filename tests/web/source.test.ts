import { describe, it, expect } from 'vitest';
import { cellText, oddValueNote, sourceHeading } from '../../web/src/source';
import type { Cell } from '../../src/shared/types';

const cell = (value: string | null, quote?: string): Cell =>
  ({ value, quote: value === null ? null : quote ?? value, source: 'u', status: value === null ? 'not stated' : 'stated' });
const TABLE = 'Column "Oxygen Conc (percent)" (PSI-20_x.csv): 21; 25; 26.5; 34; 40; 2100%; 3400% (18 rows)';

describe('sourceHeading: what kind of evidence a quote is', () => {
  it('calls a sentence from the record a word-for-word quote', () =>
    expect(sourceHeading('airflow', 'air flow velocity of 20 cm/s.')).toBe('Source quote, word for word'));
  it('says a table line is a summary computed by Entropy, not NASA wording', () => {
    const h = sourceHeading('oxygen', TABLE);
    expect(h).toMatch(/table/i);
    expect(h).toMatch(/computed by Entropy/);
    expect(h).not.toMatch(/word for word/);
  });
  it('says the Objectives value is an AI summary', () => expect(sourceHeading('objectives', 'To study flames.')).toMatch(/AI summary/));
  it('says the Pillar is a classification, not a quoted value', () => expect(sourceHeading('pillar', 'Cool flames.')).toMatch(/classification/));
});

describe('oddValueNote: values that cannot be right as written', () => {
  it('flags an oxygen percentage above 100 and names the values', () => {
    const note = oddValueNote('oxygen', cell('21; 25; 26.5; 34; 40; 2100%; 3400%', TABLE))!;
    expect(note).toContain('2100%');
    expect(note).toContain('3400%');
    expect(note).toMatch(/as written/i);
  });
  it('flags a bare range whose unit comes from a percent column', () =>
    expect(oddValueNote('oxygen', cell('2100 to 3400', 'Column "Oxygen Conc (percent)" (a.csv): 2100 to 3400 across 2 rows'))).not.toBeNull());
  it('does not flag ordinary oxygen values', () => {
    expect(oddValueNote('oxygen', cell('21.5 to 21.7', 'Column "Percent O2" (a.csv): 21.5 to 21.7 across 2 rows'))).toBeNull();
    expect(oddValueNote('oxygen', cell('0.21 mole fraction'))).toBeNull();
    expect(oddValueNote('oxygen', cell('21% to 40%'))).toBeNull();
  });
  it('does not flag other fields or empty cells', () => {
    expect(oddValueNote('pressure', cell('757.7', 'Column "Ambient pressure; mmHg" (a.csv): 757.7'))).toBeNull();
    expect(oddValueNote('oxygen', cell(null))).toBeNull();
  });
});

describe('cellText: a value with the unit NASA wrote', () => {
  it('adds the unit from the table column name', () =>
    expect(cellText('pressure', cell('1.01 to 1.29', 'Column "pinit (atm)" (a.csv): 1.01 to 1.29 across 207 rows'))).toBe('1.01 to 1.29 atm'));
  it('leaves a value that already carries its unit', () => expect(cellText('airflow', cell('20 cm/s'))).toBe('20 cm/s'));
  it('adds no unit to text fields', () =>
    expect(cellText('fuel', cell('Methanol', 'Column "Fuel (type)" (a.csv): Methanol (3 rows)'))).toBe('Methanol'));
  it('reads Not stated for an empty cell', () => expect(cellText('oxygen', cell(null))).toBe('Not stated'));
});
