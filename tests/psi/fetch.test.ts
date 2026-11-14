import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fetchInvestigation, summarizeCsv, PsiError, MAX_TEXT_CHARS } from '../../src/psi/fetch';

const fixture = readFileSync(new URL('../fixtures/psi-159.json', import.meta.url), 'utf8');
const S3 = 'https://psi-repo-prod.s3.amazonaws.com/psi-data/PSI-159/x.csv?sig=abc';
const CSV = 'Fuel, XO2 before test,approx p (bar),Comments\nethane,0.3939,0.94,ok\nethane,0.2100,1.10,\n';

function fakeFetch(routes: (url: string) => Response | Promise<Response>) {
  return vi.fn(async (input: RequestInfo | URL) => routes(String(input))) as unknown as typeof fetch;
}
function happy(url: string): Response {
  if (url.includes('/repo/investigations/PSI-159')) return new Response(fixture, { status: 200 });
  if (url.includes('/studies/PSI-159/download')) return new Response(S3, { status: 200 });
  if (url.startsWith('https://psi-repo-prod.s3.amazonaws.com/')) return new Response(CSV, { status: 200 });
  return new Response('no', { status: 500 });
}
async function code(p: Promise<unknown>) {
  try { await p; return 'resolved'; } catch (e) { return e instanceof PsiError ? e.code : `other:${String(e)}`; }
}

describe('fetchInvestigation', () => {
  it('builds a document from the PSI record', async () => {
    const doc = await fetchInvestigation('psi-159', fakeFetch(happy));
    expect(doc.psiId).toBe('PSI-159');
    expect(doc.url).toBe('https://psi.nasa.gov/physci/repo/data/investigations/PSI-159');
    expect(doc.text).toMatch(/cool diffusion flames/i);
    expect(doc.text).toContain('Column "XO2 before test"');
    expect(doc.text).not.toContain('sig=abc');
    expect(Number.isNaN(Date.parse(doc.fetchedAt))).toBe(false);
  });
  it('maps 404 and 403 to not_found', async () => {
    expect(await code(fetchInvestigation('PSI-159', fakeFetch(() => new Response('x', { status: 404 }))))).toBe('not_found');
    expect(await code(fetchInvestigation('PSI-159', fakeFetch(() => new Response('x', { status: 403 }))))).toBe('not_found');
  });
  it('maps 500 and network errors to upstream', async () => {
    expect(await code(fetchInvestigation('PSI-159', fakeFetch(() => new Response('x', { status: 500 }))))).toBe('upstream');
    expect(await code(fetchInvestigation('PSI-159', fakeFetch(() => { throw new TypeError('net'); })))).toBe('upstream');
  });
  it('rejects a bad id before any request', async () => {
    const f = fakeFetch(happy);
    expect(await code(fetchInvestigation('nope', f))).toBe('bad_id');
    expect(f).not.toHaveBeenCalled();
  });
  it('rejects text longer than MAX_TEXT_CHARS', async () => {
    const big = JSON.stringify({ ...JSON.parse(fixture), approach: 'x'.repeat(MAX_TEXT_CHARS + 1) });
    const f = fakeFetch((u) => u.includes('/repo/investigations/') ? new Response(big) : happy(u));
    expect(await code(fetchInvestigation('PSI-159', f))).toBe('too_long');
  });
  it('refuses a download link on another host', async () => {
    const f = fakeFetch((u) => u.includes('/download') ? new Response('https://evil.example/x.csv') : happy(u));
    expect(await code(fetchInvestigation('PSI-159', f))).toBe('upstream');
  });
  it('never puts the upstream body in the error message', async () => {
    const f = fakeFetch(() => new Response('SECRET-BODY', { status: 500 }));
    try { await fetchInvestigation('PSI-159', f); } catch (e) { expect(String((e as Error).message)).not.toContain('SECRET-BODY'); }
  });
});

describe('summarizeCsv', () => {
  const psi98 = 'Test,Material,Percent O2,Air Flow (cm/s)\nS1,SIBAL Fabric,21.5 - 21.7,20\nS2,SIBAL Fabric,~ 21.5,20\nNote: values approximate,,,\n';
  it('gives min and max of a numeric column with its row count', () => {
    expect(summarizeCsv('PSI-98.csv', psi98)).toContain('Column "Percent O2" (PSI-98.csv): 21.5 to 21.7 across 2 rows');
  });
  it('omits columns with no numbers', () => {
    expect(summarizeCsv('PSI-98.csv', psi98)).not.toContain('"Material"');
  });
  it('strips a byte-order mark and stray header spaces', () => {
    const out = summarizeCsv('PSI-25.csv', '﻿PI , Calibrated initial O2 % by vol\n1,22.2\n2,22.4\n');
    expect(out).toContain('Column "PI" (PSI-25.csv): 1 to 2 across 2 rows');
    expect(out).toContain('Column "Calibrated initial O2 % by vol" (PSI-25.csv): 22.2 to 22.4 across 2 rows');
  });
  it('keeps the source number text, no unit conversion', () => {
    expect(summarizeCsv('a.csv', 'XO2\n0.3939\n0.2100\n')).toContain('0.2100 to 0.3939');
  });
  it('does not treat dates as numbers', () => {
    expect(summarizeCsv('a.csv', 'Date\n2019-03-05\n2019-04-01\n')).not.toContain('"Date"');
  });
});
