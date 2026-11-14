// One Node process for Azure App Service: serves the built dashboard and the API on PORT.
import { readFileSync } from 'node:fs';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createApp } from './app';
import { createLimiter, memoryStore } from './limit';
import { fetchInvestigation } from '../psi/fetch';
import { anthropicLlm, type Effort } from '../ingest/llm';
import type { Row } from '../shared/types';

const apiKey = process.env.LLM_API_KEY ?? process.env.ANTHROPIC_API_KEY ?? '';
if (!apiKey) console.warn('LLM_API_KEY is not set: live Add will answer "upstream".');
const model = process.env.LLM_MODEL || 'claude-opus-5-5';
const effort = (process.env.LLM_EFFORT || 'low') as Effort;
const dailyLimit = Number(process.env.DAILY_LIMIT || 200);
const webDir = process.env.WEB_DIR || 'dist/web';
const dataFile = process.env.DATA_FILE || 'data/investigations.json';

const reviewed = (JSON.parse(readFileSync(dataFile, 'utf8')) as { rows: Row[] }).rows;

const api = createApp({
  ingest: { fetchDoc: (id) => fetchInvestigation(id), llm: anthropicLlm({ apiKey, model, effort }) },
  reviewed,
  limiter: createLimiter({ store: memoryStore(), perIpPerDay: Math.max(5, Math.floor(dailyLimit / 10)), globalPerDay: dailyLimit }),
});

const app = new Hono();
app.route('/api', api);
app.use('/*', serveStatic({ root: webDir }));
app.get('*', serveStatic({ path: `${webDir}/index.html` }));

const port = Number(process.env.PORT || 8787);
serve({ fetch: app.fetch, port }, () => console.log(`Entropy on http://localhost:${port} (model ${model}, ${reviewed.length} reviewed rows)`));
