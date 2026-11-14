// Saves NASA's experimental tables for the catalogue investigations as static files (data/tests/<ID>.json),
// so the test replay does not depend on PSI being reachable.
// Usage: npx tsx scripts/build-tests.ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fetchTables } from '../src/psi/tables.js';
import type { Row } from '../src/shared/types.js';

const rows = (JSON.parse(readFileSync('data/investigations.json', 'utf8')) as { rows: Row[] }).rows;
mkdirSync('data/tests', { recursive: true });
for (const row of rows) {
  const id = row.psiId.value!;
  try {
    const t = await fetchTables(id);
    writeFileSync(`data/tests/${id}.json`, JSON.stringify(t) + '\n');
    console.log(id, t.tables.map((x) => `${x.rows.length} rows`).join(', ') || 'no tables');
  } catch (e) {
    console.log(id, 'failed:', (e as Error).message);
  }
}
