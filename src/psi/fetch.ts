import { normalizePsiId } from '../shared/normalize';

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

  const tables = Array.isArray(record.experimentalTable) ? record.experimentalTable : [];
  const csvNames = tables
    .map((t) => (t && typeof t === 'object' ? (t as { file_name?: unknown }).file_name : undefined))
    .filter((n): n is string => typeof n === 'string' && n.toLowerCase().endsWith('.csv'))
    .slice(0, MAX_CSV_FILES);
  for (const name of csvNames) {
    const summary = await downloadCsvSummary(fetchImpl, psiId, name);
    if (summary) parts.push(summary);
  }

  const text = parts.join('\n\n');
  if (text.length > MAX_TEXT_CHARS) throw new PsiError('too_long', `${psiId} is too long to read`);
  return { psiId, url: `${PAGE}/${psiId}`, text, fetchedAt: new Date().toISOString() };
}

/** Two-step download: NASA returns a short-lived signed link, which is followed only on the PSI S3 host and never stored. */
async function downloadCsvSummary(fetchImpl: typeof fetch, psiId: string, fileName: string): Promise<string | null> {
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
  const csvRes = await get(fetchImpl, link);
  if (!csvRes.ok) return null;
  const csv = await csvRes.text();
  if (csv.length > MAX_CSV_BYTES) return null;
  return summarizeCsv(fileName, csv);
}

function parseCsv(csv: string): string[][] {
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
    if (count && min && max) lines.push(`Column "${name}" (${fileName}): ${min.s} to ${max.s} across ${count} rows`);
  });
  return lines.join('\n');
}
