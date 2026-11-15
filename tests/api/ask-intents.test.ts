import { describe, it, expect } from 'vitest';
import { answerIntent, askCatalogue, parseIntent } from '../../src/api/ask';
import { FIELDS, type Cell, type Row } from '../../src/shared/types';

const cell = (value: string | null, quote?: string): Cell =>
  ({ value, quote: value === null ? null : quote ?? value, source: 'u', status: value === null ? 'not stated' : 'stated' });
function row(over: Record<string, string | null>): Row {
  const r = {} as Row;
  for (const f of FIELDS) r[f] = cell(over[f] ?? null);
  return r;
}
const col = (name: string, value: string) => cell(value, `Column "${name}" (a.csv): ${value} across 9 rows`);
const rows = [
  row({ psiId: 'PSI-10', name: 'ACME', fuel: 'C2H4', oxygen: '0.2 to 0.4 mole fraction', pressure: '0.9 atm to 1.3 atm' }),
  row({ psiId: 'PSI-98', name: 'SAFFIRE-I', fuel: 'cotton on fiberglass', airflow: '20 cm/s' }),
  row({ psiId: 'PSI-20', name: 'BRE', fuel: 'CH4', pressure: '14.7 psia' }),
  row({ psiId: 'PSI-21', name: 'CLD', fuel: 'methane' }),
];
rows[1].oxygen = col('Percent O2', '21.5 to 21.7');
rows[2].oxygen = col('Oxygen Conc (percent)', '21; 34; 40; 2100%');

describe('parseIntent', () => {
  it('reads the first JSON object in the model output', () =>
    expect(parseIntent('sure\n{"intent":"rank","field":"oxygen","order":"highest"}\n')).toEqual({ intent: 'rank', field: 'oxygen', order: 'highest' }));
  it('returns null for text that holds no valid intent', () => {
    expect(parseIntent('The highest oxygen is 40%.')).toBeNull();
    expect(parseIntent('{"intent":"rank","field":"colour","order":"highest"}')).toBeNull();
  });
});

describe('answerIntent: every answer is computed by code from catalogue cells', () => {
  it('ranks oxygen across units, shows each value as written, and reports ties', () => {
    const a = answerIntent({ intent: 'rank', field: 'oxygen', order: 'highest' }, rows);
    expect(a.kind).toBe('answer');
    expect(a.cells.slice(0, 2)).toEqual([{ psiId: 'PSI-10', field: 'oxygen' }, { psiId: 'PSI-20', field: 'oxygen' }]);
    expect(a.text).toContain('"0.2 to 0.4 mole fraction"');
    expect(a.text).toContain('tie');
  });
  it('leaves Not stated out of a ranking and says so', () => {
    const a = answerIntent({ intent: 'rank', field: 'oxygen', order: 'highest' }, rows);
    expect(a.text).toContain('1 of 4 investigations does not state oxygen and is left out: PSI-21.');
  });
  it('ignores a value that cannot be real, and says so', () =>
    expect(answerIntent({ intent: 'rank', field: 'oxygen', order: 'highest' }, rows).text).toContain('PSI-20 also lists a percentage above 100'));
  it('ranks the lowest pressure', () => {
    const a = answerIntent({ intent: 'rank', field: 'pressure', order: 'lowest' }, rows);
    expect(a.cells[0]).toEqual({ psiId: 'PSI-10', field: 'pressure' });
    expect(a.text).toContain('2 of 4 investigations do not state pressure and are left out: PSI-98, PSI-21.');
  });
  it('counts the investigations that do not state a field and names them', () => {
    const a = answerIntent({ intent: 'count', field: 'airflow', status: 'not_stated' }, rows);
    expect(a.text).toBe('3 of 4 investigations do not state airflow: PSI-10, PSI-20, PSI-21.');
    expect(a.cells.length).toBe(3);
  });
  it('finds stated values by a word, in one field or in any', () => {
    expect(answerIntent({ intent: 'find', field: 'fuel', text: 'cotton' }, rows).cells).toEqual([{ psiId: 'PSI-98', field: 'fuel' }]);
    expect(answerIntent({ intent: 'find', field: 'any', text: 'METHANE' }, rows).cells).toEqual([{ psiId: 'PSI-21', field: 'fuel' }]);
    expect(answerIntent({ intent: 'find', field: 'fuel', text: 'kerosene' }, rows)).toMatchObject({ kind: 'none', cells: [] });
  });
  it('looks up named cells and says Not stated where the catalogue has none', () => {
    const a = answerIntent({ intent: 'lookup', ids: ['PSI-98'], fields: ['fuel', 'pressure'] }, rows);
    expect(a.text).toContain('PSI-98 SAFFIRE-I, fuel: "cotton on fiberglass".');
    expect(a.text).toContain('PSI-98 SAFFIRE-I, pressure: Not stated.');
  });
  it('compares two named investigations field by field', () => {
    const a = answerIntent({ intent: 'compare', ids: ['PSI-10', 'PSI-98'] }, rows);
    expect(a.kind).toBe('answer');
    expect(a.text).toContain('Fuel: PSI-10 "C2H4" | PSI-98 "cotton on fiberglass"');
    expect(a.text).toContain('Pressure: PSI-10 "0.9 atm to 1.3 atm" | PSI-98 Not stated');
  });
  it('asks one clarifying question when a comparison names fewer than two known investigations', () => {
    expect(answerIntent({ intent: 'compare', ids: [] }, rows)).toMatchObject({ kind: 'clarify', cells: [] });
    expect(answerIntent({ intent: 'compare', ids: ['PSI-10', 'PSI-999'] }, rows).kind).toBe('clarify');
    expect(answerIntent({ intent: 'clarify', need: 'which_investigations' }, rows).text).toMatch(/Which two investigations/);
  });
  it('says the catalogue holds no dates instead of guessing a latest test', () =>
    expect(answerIntent({ intent: 'unsupported', topic: 'dates' }, rows)).toMatchObject({ kind: 'unsupported', cells: [] }));
});

describe('askCatalogue', () => {
  const llm = (text: string) => ({ async *stream() { yield text; } });
  it('never passes model wording or numbers through: only the intent is used', async () => {
    const a = await askCatalogue('highest oxygen?', rows, llm('{"intent":"rank","field":"oxygen","order":"highest"} The answer is 99%.'));
    expect(a.text).not.toContain('99');
    expect(a.cells[0].psiId).toBe('PSI-10');
  });
  it('asks the user to rephrase when the model output is not an intent', async () =>
    expect((await askCatalogue('?', rows, llm('I think it is 40%.'))).kind).toBe('clarify'));
});
