// Vercel entry: the same API as src/api/server.node.ts, served under /api.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { createApp } from '../src/api/app.js';
import { createLimiter, memoryStore } from '../src/api/limit.js';
import { fetchInvestigation } from '../src/psi/fetch.js';
import { createLlm, type Effort } from '../src/ingest/llm.js';
import { fetchTables } from '../src/psi/tables.js';
import type { Row } from '../src/shared/types.js';

const reviewed = (JSON.parse(readFileSync(join(process.cwd(), 'data/investigations.json'), 'utf8')) as { rows: Row[] }).rows;
const dailyLimit = Number(process.env.DAILY_LIMIT || 200);

const api = createApp({
  ingest: {
    fetchDoc: (id) => fetchInvestigation(id),
    llm: createLlm({
      apiKey: process.env.LLM_API_KEY ?? '',
      model: process.env.LLM_MODEL ?? '',
      effort: (process.env.LLM_EFFORT || 'low') as Effort,
    }),
  },
  reviewed,
  tables: (id) => fetchTables(id),
  readLimiter: createLimiter({ store: memoryStore(), perIpPerDay: 60, globalPerDay: 1500 }),
  limiter: createLimiter({ store: memoryStore(), perIpPerDay: Math.max(5, Math.floor(dailyLimit / 10)), globalPerDay: dailyLimit }),
});

const app = new Hono().basePath('/api');
app.route('/', api);

export const GET = handle(app);
export const POST = handle(app);
