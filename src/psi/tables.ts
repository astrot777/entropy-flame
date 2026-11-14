import { normalizePsiId } from '../shared/normalize.js';
import { csvNamesOf, downloadCsv, parseCsv, PsiError } from './fetch.js';

export interface TestTable { file: string; columns: string[]; rows: string[][] }
export interface TestTables { psiId: string; tables: TestTable[] }

const API = 'https://psi.nasa.gov/geode-py/ws';
const MAX_ROWS = 400;
const MAX_CELL = 120;

/** The experimental tables NASA publishes for one investigation, row by row: one row is one test. */
export async function fetchTables(id: string, fetchImpl: typeof fetch = fetch): Promise<TestTables> {
  const psiId = normalizePsiId(id);
  if (!psiId) throw new PsiError('bad_id', 'Not a PSI investigation ID');
  let res: Response;
  try {
    res = await fetchImpl(`${API}/repo/investigations/${psiId}`);
  } catch {
    throw new PsiError('upstream', 'PSI could not be reached');
  }
  if (res.status === 403 || res.status === 404) throw new PsiError('not_found', `${psiId} was not found in PSI`);
  if (!res.ok) throw new PsiError('upstream', `PSI returned status ${res.status}`);
  const record = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  const tables: TestTable[] = [];
  for (const file of csvNamesOf(record)) {
    const csv = await downloadCsv(fetchImpl, psiId, file);
    if (csv === null) continue;
    const all = parseCsv(csv.replace(/^﻿/, ''));
    if (all.length < 2) continue;
    // Headers are trimmed exactly as the table summary trims them, so column names match the source quotes.
    const columns = all[0].map((h) => h.replace(/^﻿/, '').trim());
    const rows = all.slice(1, MAX_ROWS + 1).map((r) => columns.map((_, i) => (r[i] ?? '').trim().slice(0, MAX_CELL)));
    tables.push({ file, columns, rows });
  }
  return { psiId, tables };
}
