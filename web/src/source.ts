// How a cell's evidence is described to the reader. A sentence copied from the PSI record is a quote; a table
// line is a summary Entropy computed from one column; Objectives and Pillar are the model's own words.
import type { Cell, FieldKey } from '../../src/shared/types';
import { unitFromQuote } from './units';

const TABLE_LINE = /^Column "/;
const WITH_UNIT: FieldKey[] = ['oxygen', 'pressure', 'airflow', 'sample'];

/** The heading shown above a cell's evidence. */
export function sourceHeading(field: FieldKey, quote: string): string {
  if (field === 'objectives') return 'Source sentence (the value above is an AI summary of it)';
  if (field === 'pillar') return 'Source sentence (the pillar is a classification the AI model made from it)';
  if (TABLE_LINE.test(quote)) return "From NASA's table (this line is a summary computed by Entropy from one column, not NASA's wording)";
  return 'Source quote, word for word';
}

/** The value with the unit NASA wrote in the table column name, as the catalogue shows it. */
export function cellText(field: FieldKey, cell: Cell): string {
  if (cell.status === 'not stated' || cell.value === null) return 'Not stated';
  const unit = WITH_UNIT.includes(field) ? unitFromQuote(cell.value, cell.quote ?? '') : null;
  return unit ? `${cell.value} ${unit}` : cell.value;
}

/**
 * A caution for a value that cannot be right as written. Entropy never converts or corrects NASA's numbers,
 * so the value stays, with a note. Today this covers one case: an oxygen percentage above 100.
 */
export function oddValueNote(field: FieldKey, cell: Cell): string | null {
  if (field !== 'oxygen' || cell.status === 'not stated' || !cell.value) return null;
  const marked = [...cell.value.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].filter((m) => Number(m[1]) > 100).map((m) => `${m[1]}%`);
  const columnIsPercent = unitFromQuote(cell.value, cell.quote ?? '') === '%';
  const bare = columnIsPercent ? [...cell.value.matchAll(/\d+(?:\.\d+)?/g)].filter((m) => Number(m[0]) > 100).map((m) => `${m[0]}%`) : [];
  const odd = [...new Set([...marked, ...bare])];
  if (!odd.length) return null;
  return `Shown as written in NASA's table. An oxygen percentage above 100 (${odd.join(' and ')}) cannot be a real concentration: it is probably a formatting slip in the source. Entropy does not correct it. Check the PSI record.`;
}
