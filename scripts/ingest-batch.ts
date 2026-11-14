// Written with Claude (Anthropic) as an SI coding assistant; reviewed by the team.
// Usage: npx tsx --env-file=.env scripts/ingest-batch.ts data/ids.txt --out data/investigations.json
import { readFileSync, writeFileSync } from 'node:fs';
import { fetchInvestigation } from '../src/psi/fetch';
import { anthropicLlm, type Effort } from '../src/ingest/llm';
import { runBatch } from '../src/ingest/ingest';

const [idsPath, flag, outPath] = process.argv.slice(2);
if (!idsPath || flag !== '--out' || !outPath) {
  console.error('Usage: ingest-batch <ids.txt> --out <investigations.json>');
  process.exit(2);
}
const apiKey = process.env.LLM_API_KEY ?? process.env.ANTHROPIC_API_KEY;
const model = process.env.LLM_MODEL || 'claude-opus-5-5';
const effort = (process.env.LLM_EFFORT || 'low') as Effort;
if (!apiKey) {
  console.error('LLM_API_KEY is not set (put it in .env).');
  process.exit(2);
}
const ids = readFileSync(idsPath, 'utf8').split(/\r?\n/).map((l) => l.replace(/#.*/, '').trim()).filter(Boolean);
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const todo = only ? ids.filter((i) => only.includes(i)) : ids;

const started = Date.now();
const { rows, errors } = await runBatch(todo, { fetchDoc: (id) => fetchInvestigation(id), llm: anthropicLlm({ apiKey, model, effort }) });
rows.sort((a, b) => Number(a.psiId.value!.slice(4)) - Number(b.psiId.value!.slice(4)));
const meta = {
  generatedAt: new Date().toISOString(),
  generatedBy: `Extracted by ${model} (Anthropic Claude, an SI model) from NASA PSI records, then every cell checked by code against its source quote. Not reviewed by a person unless marked reviewed.`,
  source: 'NASA Physical Sciences Informatics (PSI), https://psi.nasa.gov',
};
writeFileSync(outPath, JSON.stringify({ meta, rows }, null, 2) + '\n');
writeFileSync(outPath.replace(/investigations\.json$/, 'ingest-errors.json'), JSON.stringify(errors, null, 2) + '\n');
const stated = rows.reduce((n, r) => n + Object.values(r).filter((c) => typeof c === 'object' && c && 'status' in c && c.status === 'stated').length, 0);
console.log(`${rows.length} rows, ${errors.length} errors, ${stated} stated cells, ${Math.round((Date.now() - started) / 1000)} s`);
for (const e of errors) console.log('error', e.id, e.code);
