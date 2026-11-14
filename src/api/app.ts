// Written with Claude (Anthropic) as an SI coding assistant; reviewed by the team.
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { Row } from '../shared/types';
import { normalizePsiId } from '../shared/normalize';
import { PsiError } from '../psi/fetch';
import { ingestStream, type Deps } from '../ingest/ingest';
import type { Llm } from '../ingest/llm';
import type { createLimiter } from './limit';

export interface ExplainDeps { llm: Llm }
export interface AppDeps { ingest: Deps; reviewed: Row[]; limiter: ReturnType<typeof createLimiter>; explain?: ExplainDeps }

const STATUS: Record<string, 400 | 404 | 429 | 502> = { bad_id: 400, not_found: 404, limit: 429, upstream: 502, too_long: 502 };

/** A live row lives only in the visitor's session: marked unreviewed, one per PSI ID. */
export function addLiveRow(session: Row[], row: Row): Row[] {
  if (session.some((r) => r.psiId.value === row.psiId.value)) return session;
  return [...session, { ...row, unreviewed: true }];
}

function clientIp(h: (name: string) => string | undefined): string {
  return (h('x-forwarded-for') ?? '').split(',')[0].trim().replace(/:\d+$/, '') || 'unknown';
}

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();

  app.get('/health', (c) => c.json({ ok: true }));

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
