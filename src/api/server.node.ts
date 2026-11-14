// One Node process for Azure App Service: serves the built dashboard and the API on PORT.
import { readFileSync } from 'node:fs';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createApp } from './app.js';
import { createLimiter, memoryStore } from './limit.js';
import { fetchInvestigation } from '../psi/fetch.js';
import { createLlm, type Effort } from '../ingest/llm.js';
import { fetchTables } from '../psi/tables.js';
import type { Row } from '../shared/types.js';

const apiKey = process.env.LLM_API_KEY ?? '';
if (!apiKey) console.warn('LLM_API_KEY is not set: live Add will answer "upstream".');
const model = process.env.LLM_MODEL || '';
if (!model) console.warn('LLM_MODEL is not set: live Add will answer "upstream".');
const effort = (process.env.LLM_EFFORT || 'low') as Effort;
const dailyLimit = Number(process.env.DAILY_LIMIT || 200);
const webDir = process.env.WEB_DIR || 'dist/web';
const dataFile = process.env.DATA_FILE || 'data/investigations.json';

const reviewed = (JSON.parse(readFileSync(dataFile, 'utf8')) as { rows: Row[] }).rows;

const api = createApp({
  ingest: { fetchDoc: (id) => fetchInvestigation(id), llm: createLlm({ apiKey, model, effort }) },
  reviewed,
  tables: (id) => fetchTables(id),
  readLimiter: createLimiter({ store: memoryStore(), perIpPerDay: 60, globalPerDay: 1500 }),
  limiter: createLimiter({ store: memoryStore(), perIpPerDay: Math.max(5, Math.floor(dailyLimit / 10)), globalPerDay: dailyLimit }),
});

const app = new Hono();
app.route('/api', api);
app.use('/*', serveStatic({ root: webDir }));
app.get('*', serveStatic({ path: `${webDir}/index.html` }));

const port = Number(process.env.PORT || 8787);
serve({ fetch: app.fetch, port }, () => console.log(`Entropy on http://localhost:${port} (model ${model}, ${reviewed.length} reviewed rows)`));
