import type { Cell, FieldKey, Row } from '../shared/types.js';
import { normalizePsiId } from '../shared/normalize.js';
import { PsiError, type PsiDocument } from '../psi/fetch.js';
import type { Llm } from './llm.js';
import { extractFields } from './extract.js';
import { verifyField, verifyRow, type RawField } from './verify.js';

export interface Deps { fetchDoc: (id: string) => Promise<PsiDocument>; llm: Llm }
export type IngestEvent = { type: 'field'; field: FieldKey; cell: Cell } | { type: 'done'; row: Row };

/** Fetch, stream the model's fields through verification one by one, then finish with the full 12-cell row. */
export async function* ingestStream(id: string, deps: Deps): AsyncGenerator<IngestEvent> {
  const psiId = normalizePsiId(id);
  if (!psiId) throw new PsiError('bad_id', 'Not a PSI investigation ID');
  const doc = await deps.fetchDoc(psiId);
  const raws: RawField[] = [];
  for await (const raw of extractFields(doc, deps.llm)) {
    if (raws.some((r) => r.field === raw.field)) continue;
    raws.push(raw);
    yield { type: 'field', field: raw.field, cell: verifyField(raw, doc) };
  }
  yield { type: 'done', row: fillFromRecord(verifyRow(raws, doc), doc) };
}

const RECORD_FIELDS: [FieldKey, RegExp][] = [
  ['name', /^Acronym: (.+)$/m],
  ['type', /^Project type: (.+)$/m],
];

/** Name and type sit in fixed fields of the PSI record; when the model leaves them empty, take them from there. */
export function fillFromRecord(row: Row, doc: PsiDocument): Row {
  const out = { ...row };
  for (const [field, re] of RECORD_FIELDS) {
    if (out[field].status === 'stated') continue;
    const m = re.exec(doc.text);
    if (m) out[field] = verifyField({ field, value: m[1].trim(), quote: m[0].trim() }, doc);
  }
  return out;
}

export async function ingestOne(id: string, deps: Deps): Promise<Row> {
  for await (const ev of ingestStream(id, deps)) if (ev.type === 'done') return ev.row;
  throw new PsiError('upstream', 'Ingest ended without a result');
}

/** Sequential, never throws: failures are returned as { id, code }. */
export async function runBatch(ids: string[], deps: Deps): Promise<{ rows: Row[]; errors: { id: string; code: string }[] }> {
  const rows: Row[] = [];
  const errors: { id: string; code: string }[] = [];
  for (const id of ids) {
    try {
      rows.push(await ingestOne(id, deps));
    } catch (e) {
      errors.push({ id, code: e instanceof PsiError ? e.code : 'upstream' });
    }
  }
  return { rows, errors };
}
