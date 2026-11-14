import { describe, it, expect, vi } from 'vitest';
import { fetchTables } from '../../src/psi/tables';

const S3 = 'https://psi-repo-prod.s3.amazonaws.com/psi-data/PSI-98/x.csv?sig=abc';
const CSV = '﻿Test , Percent O2,Air Flow (cm/s)\nS1,21.5 - 21.7,20\nS2,~ 21.5,20\n,,\n';
function fakeFetch(record: unknown, status = 200) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const u = String(input);
    if (u.includes('/repo/investigations/')) return new Response(JSON.stringify(record), { status });
    if (u.includes('/download')) return new Response(S3);
    return new Response(CSV);
  }) as unknown as typeof fetch;
}

describe('fetchTables', () => {
  it('returns each experimental table with trimmed headers and its rows', async () => {
    const t = await fetchTables('psi-98', fakeFetch({ experimentalTable: [{ file_name: 'PSI-98_table.csv' }] }));
    expect(t.psiId).toBe('PSI-98');
    expect(t.tables).toEqual([{ file: 'PSI-98_table.csv', columns: ['Test', 'Percent O2', 'Air Flow (cm/s)'], rows: [['S1', '21.5 - 21.7', '20'], ['S2', '~ 21.5', '20']] }]);
  });
  it('returns no tables when the record lists none', async () =>
    expect((await fetchTables('PSI-60', fakeFetch({}))).tables).toEqual([]));
  it('rejects a bad id and a missing investigation', async () => {
    await expect(fetchTables('nope', fakeFetch({}))).rejects.toMatchObject({ code: 'bad_id' });
    await expect(fetchTables('PSI-1', fakeFetch({}, 403))).rejects.toMatchObject({ code: 'not_found' });
  });
});
