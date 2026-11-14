import { normalizePsiId } from '../shared/normalize.js';

export interface PsiDocument { psiId: string; url: string; text: string; fetchedAt: string }

export type PsiErrorCode = 'bad_id' | 'not_found' | 'upstream' | 'too_long';
export class PsiError extends Error {
  constructor(public code: PsiErrorCode, message: string) {
    super(message);
    this.name = 'PsiError';
  }
}

export const MAX_TEXT_CHARS = 60_000;
const MAX_CSV_FILES = 6;
const MAX_CSV_BYTES = 2_000_000;
const API = 'https://psi.nasa.gov/geode-py/ws';
const PAGE = 'https://psi.nasa.gov/physci/repo/data/investigations';
const S3_HOST = 'psi-repo-prod.s3.amazonaws.com';

const TEXT_FIELDS: [string, string][] = [
  ['title', 'Title'],
  ['investigationAcronym', 'Acronym'],
  ['objective', 'Objectives'],
  ['approach', 'Approach'],
  ['hypothesis', 'Hypothesis'],
  ['researchImpacts', 'Research impacts'],
  ['projectType', 'Project type'],
  ['flightProgram', 'Flight program'],
  ['experimentHardware', 'Experiment hardware'],
  ['researchArea', 'Research area'],
  ['subResearchArea', 'Sub research area'],
];

async function get(fetchImpl: typeof fetch, url: string): Promise<Response> {
  try {
    return await fetchImpl(url);
  } catch {
    throw new PsiError('upstream', 'PSI could not be reached');
  }
}

/** Fetches one PSI investigation and builds its plain-text document, with table summaries appended. */
export async function fetchInvestigation(id: string, fetchImpl: typeof fetch = fetch): Promise<PsiDocument> {
  const psiId = normalizePsiId(id);
  if (!psiId) throw new PsiError('bad_id', 'Not a PSI investigation ID');

  const res = await get(fetchImpl, `${API}/repo/investigations/${psiId}`);
  if (res.status === 403 || res.status === 404) throw new PsiError('not_found', `${psiId} was not found in PSI`);
  if (!res.ok) throw new PsiError('upstream', `PSI returned status ${res.status}`);
  let record: Record<string, unknown>;
  try {
    record = (await res.json()) as Record<string, unknown>;
  } catch {
    throw new PsiError('upstream', 'PSI returned an unreadable response');
  }

  const parts: string[] = [];
  for (const [key, label] of TEXT_FIELDS) {
    const v = record[key];
    if (typeof v === 'string' && v.trim()) parts.push(`${label}: ${v.trim()}`);
  }

  for (const name of csvNamesOf(record)) {
    const summary = await downloadCsvSummary(fetchImpl, psiId, name);
    if (summary) parts.push(summary);
  }

  const text = parts.join('\n\n');
  if (text.length > MAX_TEXT_CHARS) throw new PsiError('too_long', `${psiId} is too long to read`);
  return { psiId, url: `${PAGE}/${psiId}`, text, fetchedAt: new Date().toISOString() };
}

/**
 * Asks NASA for a short-lived signed download link to one PSI file. The link is accepted only on the PSI S3 host,
 * and it is never stored or logged. Returns null when NASA has no such file.
 */
export async function signedLink(fetchImpl: typeof fetch, psiId: string, fileName: string): Promise<string | null> {
  const q = new URLSearchParams({ file: fileName, version: '1', redirect: 'false' });
  const linkRes = await get(fetchImpl, `${API}/studies/${psiId}/download?${q}`);
  if (!linkRes.ok) return null;
  const link = (await linkRes.text()).trim().replace(/^"|"$/g, '');
  let parsed: URL;
  try {
    parsed = new URL(link);
  } catch {
    throw new PsiError('upstream', 'PSI returned an invalid download link');
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== S3_HOST) {
    throw new PsiError('upstream', 'PSI returned a download link on an unexpected host');
  }
  return link;
}

/** Downloads one experimental-table CSV through a signed link. Returns null when it is missing or too large. */
export async function downloadCsv(fetchImpl: typeof fetch, psiId: string, fileName: string): Promise<string | null> {
  const link = await signedLink(fetchImpl, psiId, fileName);
  if (!link) return null;
  const csvRes = await get(fetchImpl, link);
  if (!csvRes.ok) return null;
  const csv = await csvRes.text();
  return csv.length > MAX_CSV_BYTES ? null : csv;
}

async function downloadCsvSummary(fetchImpl: typeof fetch, psiId: string, fileName: string): Promise<string | null> {
  const csv = await downloadCsv(fetchImpl, psiId, fileName);
  return csv === null ? null : summarizeCsv(fileName, csv);
}

/** The names of the experimental-table CSV files a PSI record lists. */
export function csvNamesOf(record: Record<string, unknown>): string[] {
  const tables = Array.isArray(record.experimentalTable) ? record.experimentalTable : [];
  return tables
    .map((t) => (t && typeof t === 'object' ? (t as { file_name?: unknown }).file_name : undefined))
    .filter((n): n is string => typeof n === 'string' && n.toLowerCase().endsWith('.csv'))
    .slice(0, MAX_CSV_FILES);
}

export function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (quoted) {
      if (c === '"' && csv[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && csv[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const NUM = String.raw`-?\d+(?:\.\d+)?(?:[eE]-?\d+)?`;
const NUMERIC_CELL = new RegExp(String.raw`^[~≈<>]?\s*(${NUM})(?:\s*(?:-|–|to)\s*(${NUM}))?\s*%?$`);

/** Deterministic table summary: for each column holding numbers, its min and max (source text kept) and row count. */
export function summarizeCsv(fileName: string, csv: string): string {
  const rows = parseCsv(csv.replace(/^﻿/, ''));
  if (rows.length === 0) return `Table "${fileName}" is empty.`;
  const header = rows[0].map((h) => h.replace(/^﻿/, '').trim());
  const body = rows.slice(1);
  const lines = [`Table "${fileName}" has ${body.length} rows.`];
  header.forEach((name, col) => {
    if (!name) return;
    let min: { n: number; s: string } | null = null;
    let max: { n: number; s: string } | null = null;
    let count = 0;
    for (const r of body) {
      const m = NUMERIC_CELL.exec((r[col] ?? '').trim());
      if (!m) continue;
      count++;
      for (const s of [m[1], m[2]].filter(Boolean) as string[]) {
        const n = Number(s);
        if (!min || n < min.n) min = { n, s };
        if (!max || n > max.n) max = { n, s };
      }
    }
    const filled = body.map((r) => (r[col] ?? '').trim()).filter(Boolean);
    // A range is honest only when most cells are single numbers. A range taken from 2 cells of 18 would
    // describe those 2 cells, not the column.
    if (count && min && max && count * 2 >= filled.length) {
      lines.push(`Column "${name}" (${fileName}): ${min.s} to ${max.s} across ${count} rows`);
      return;
    }
    const listed = valueList(filled);
    if (listed) {
      lines.push(`Column "${name}" (${fileName}): ${listed} (${filled.length} rows)`);
      return;
    }
    const text = textSummary(name, filled);
    if (text) lines.push(`Column "${name}" (${fileName}): ${text}`);
  });
  return lines.join('\n');
}

const MAX_LIST_VALUES = 12;

/**
 * For a column whose cells hold lists of numbers ("21; 26.5; 40"): every distinct value, exactly as written,
 * smallest first. Null when a cell holds anything that is not a number, or there are too many values to list.
 */
function valueList(cells: string[]): string | null {
  const tokens = cells.flatMap((c) => c.split(';')).map((t) => t.trim()).filter(Boolean);
  if (!tokens.length || !tokens.every((t) => NUMERIC_CELL.test(t))) return null;
  const distinct = [...new Set(tokens)];
  if (distinct.length > MAX_LIST_VALUES) return null;
  const first = (t: string) => Number(NUMERIC_CELL.exec(t)![1]);
  return distinct.sort((a, b) => first(a) - first(b)).join('; ');
}

const NOT_DESCRIPTIVE = /^(test|test id|run|id|no\.?|#|date|time|day|comments?|notes?|file|filename|remarks?)$/i;
const MAX_TEXT_VALUE = 80;
const MAX_LISTED = 5;

/** Distinct values of a short-text column (for example the material burned), or null for ID, date and note columns. */
function textSummary(name: string, values: string[]): string | null {
  if (!values.length || NOT_DESCRIPTIVE.test(name)) return null;
  if (values.some((v) => v.length > MAX_TEXT_VALUE)) return null;
  const distinct = [...new Set(values)];
  if (distinct.length === values.length && values.length > 20) return null;
  const listed = distinct.slice(0, MAX_LISTED).join('; ');
  const more = distinct.length > MAX_LISTED ? `; and ${distinct.length - MAX_LISTED} more values` : '';
  return `${listed}${more} (${values.length} rows)`;
}
