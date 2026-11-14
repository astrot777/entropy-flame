// The honesty core: a cell is kept only if its quote appears in the source text.
import { FIELDS, type Cell, type FieldKey, type Row } from '../shared/types.js';
import { normalizeText } from '../shared/normalize.js';
import type { PsiDocument } from '../psi/fetch.js';

export interface RawField { field: FieldKey; value: string | null; quote: string | null }
export const PILLARS = ['Prevention', 'Detection', 'Suppression'] as const;
const MIN_QUOTE_CHARS = 4;

function notStated(doc: PsiDocument): Cell {
  return { value: null, quote: null, source: doc.url, status: 'not stated' };
}

export function verifyField(raw: RawField, doc: PsiDocument): Cell {
  if (raw.field === 'psiId') return { value: doc.psiId, quote: doc.url, source: doc.url, status: 'stated' };
  const value = typeof raw.value === 'string' ? raw.value.trim() : '';
  const quote = typeof raw.quote === 'string' ? raw.quote.trim() : '';
  const nQuote = normalizeText(quote);
  if (!value || nQuote.length < MIN_QUOTE_CHARS) return notStated(doc);
  if (!normalizeText(doc.text).includes(nQuote)) return notStated(doc);

  if (raw.field === 'pillar') {
    const pillar = PILLARS.find((p) => p.toLowerCase() === value.toLowerCase());
    return pillar ? { value: pillar, quote, source: doc.url, status: 'stated' } : notStated(doc);
  }
  if (raw.field !== 'objectives' && !nQuote.includes(normalizeText(value))) return notStated(doc);
  return { value, quote, source: doc.url, status: 'stated' };
}

export function verifyRow(raws: RawField[], doc: PsiDocument): Row {
  const row = {} as Row;
  for (const field of FIELDS) {
    const raw = raws.find((r) => r.field === field);
    row[field] = field === 'psiId' || raw ? verifyField(raw ?? { field, value: null, quote: null }, doc) : notStated(doc);
  }
  return row;
}
