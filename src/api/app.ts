import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { Row } from '../shared/types.js';
import { normalizePsiId } from '../shared/normalize.js';
import { PsiError } from '../psi/fetch.js';
import { ingestStream, type Deps } from '../ingest/ingest.js';
import type { Llm } from '../ingest/llm.js';
import type { createLimiter } from './limit.js';
import type { TestTables } from '../psi/tables.js';

export interface ExplainDeps { llm: Llm }
export interface AppDeps {
  ingest: Deps;
  reviewed: Row[];
  limiter: ReturnType<typeof createLimiter>;
  explain?: ExplainDeps;
  /** NASA's experimental tables, row by row, for the test replay of live-added rows. */
  tables?: (psiId: string) => Promise<TestTables>;
}

const STATUS: Record<string, 400 | 404 | 429 | 502> = { bad_id: 400, not_found: 404, limit: 429, upstream: 502, too_long: 502 };

/** A live row lives only in the visitor's session: marked unreviewed, one per PSI ID. */
export function addLiveRow(session: Row[], row: Row): Row[] {
  if (session.some((r) => r.psiId.value === row.psiId.value)) return session;
  return [...session, { ...row, unreviewed: true }];
}

/**
 * The visitor's IP as seen by the hosting proxy. The proxy (Azure App Service front end) appends the real
 * client address as the right-most X-Forwarded-For entry; earlier entries are client-supplied and ignored.
 */
function clientIp(h: (name: string) => string | undefined): string {
  const parts = (h('x-forwarded-for') ?? '').split(',').map((p) => p.trim()).filter(Boolean);
  return (parts.at(-1) ?? '').replace(/:\d+$/, '') || 'unknown';
}

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();

  app.get('/health', (c) => c.json({ ok: true }));

  const tables = deps.tables;
  if (tables) {
    app.get('/tests/:id', async (c) => {
      const psiId = normalizePsiId(c.req.param('id'));
      if (!psiId) return c.json({ code: 'bad_id' }, 400);
      try {
        const body = await tables(psiId);
        // NASA's tables change rarely: let the CDN answer repeat requests instead of calling PSI again.
        c.header('Cache-Control', 'public, max-age=300, s-maxage=86400');
        return c.json(body);
      } catch (e) {
        const code = e instanceof PsiError ? e.code : 'upstream';
        return c.json({ code }, STATUS[code] ?? 502);
      }
    });
  }

  app.post('/add', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ code: 'bad_id' }, 400);
    }
    const raw = body && typeof body === 'object' ? (body as { id?: unknown }).id : undefined;
    const id = typeof raw === 'string' ? normalizePsiId(raw) : null;
    if (!id) return c.json({ code: 'bad_id' }, 400);

    const existing = deps.reviewed.find((r) => r.psiId.value === id);
    if (existing) {
      return streamSSE(c, async (s) => { await s.writeSSE({ event: 'exists', data: JSON.stringify({ row: existing }) }); });
    }

    if (!(await deps.limiter.allow(clientIp((n) => c.req.header(n))))) return c.json({ code: 'limit' }, 429);

    let doc;
    try {
      doc = await deps.ingest.fetchDoc(id);
    } catch (e) {
      const code = e instanceof PsiError ? e.code : 'upstream';
      return c.json({ code }, STATUS[code] ?? 502);
    }

    return streamSSE(c, async (s) => {
      try {
        for await (const ev of ingestStream(id, { fetchDoc: async () => doc, llm: deps.ingest.llm })) {
          if (ev.type === 'field') await s.writeSSE({ event: 'field', data: JSON.stringify({ field: ev.field, cell: ev.cell }) });
          else await s.writeSSE({ event: 'done', data: JSON.stringify({ row: { ...ev.row, unreviewed: true } }) });
        }
      } catch (e) {
        await s.writeSSE({ event: 'error', data: JSON.stringify({ code: e instanceof PsiError ? e.code : 'upstream' }) });
      }
    });
  });

  return app;
}
