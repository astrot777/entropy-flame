import { describe, it, expect, vi } from 'vitest';
import { createApp, addLiveRow, type AppDeps } from '../../src/api/app';
import { createLimiter, memoryStore } from '../../src/api/limit';
import { PsiError, type PsiDocument } from '../../src/psi/fetch';
import { FIELDS, type Row } from '../../src/shared/types';
import type { Llm } from '../../src/ingest/llm';

function row(id: string): Row {
  const r = {} as Row;
  for (const f of FIELDS) r[f] = { value: f === 'psiId' ? id : null, quote: null, source: 'u', status: f === 'psiId' ? 'stated' : 'not stated' };
  return r;
}
const doc = (id: string): PsiDocument => ({ psiId: id, url: `https://psi.nasa.gov/physci/repo/data/investigations/${id}`, text: 'Flames of propane burned.', fetchedAt: 'now' });
const post = (body: unknown, ip = '1.1.1.1') => ({ method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify(body) });
function parseSse(text: string) {
  return text.trim().split(/\n\n+/).map((block) => {
    const event = /^event: (.*)$/m.exec(block)?.[1];
    const data = /^data: (.*)$/m.exec(block)?.[1];
    return { event, data: data ? JSON.parse(data) : null };
  });
}
function makeDeps(perIpPerDay = 50): AppDeps {
  const llm: Llm = { stream: vi.fn(async function* () { yield '{"field":"fuel","value":"propane","quote":"Flames of propane burned"}\n'; }) };
  return {
    ingest: { fetchDoc: vi.fn(async (id: string) => { if (id === 'PSI-404') throw new PsiError('not_found', 'x'); return doc(id); }), llm },
    reviewed: [row('PSI-159')],
    limiter: createLimiter({ store: memoryStore(), perIpPerDay, globalPerDay: 1000 }),
  };
}

describe('POST /add', () => {
  it('400 bad_id for a malformed id', async () => {
    const app = createApp(makeDeps());
    expect((await app.request('/add', post({ id: 'x; y' }))).status).toBe(400);
  });
  it('streams field events then done for a new id', async () => {
    const app = createApp(makeDeps());
    const res = await app.request('/add', post({ id: 'PSI-9' }));
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const events = parseSse(await res.text());
    expect(events.length).toBeGreaterThan(1);
    expect(events.slice(0, -1).every((e) => e.event === 'field')).toBe(true);
    expect(events.at(-1)?.event).toBe('done');
    expect(events.at(-1)?.data.row.psiId.value).toBe('PSI-9');
  });
  it('returns the reviewed row and does not call the model for a reviewed id', async () => {
    const deps = makeDeps();
    const app = createApp(deps);
    const res = await app.request('/add', post({ id: 'psi-159' }));
    expect(res.status).toBe(200);
    expect(parseSse(await res.text())[0]).toMatchObject({ event: 'exists' });
    expect(deps.ingest.llm.stream).not.toHaveBeenCalled();
  });
  it('404 not_found when PSI has no such investigation', async () => {
    const app = createApp(makeDeps());
    expect((await app.request('/add', post({ id: 'PSI-404' }))).status).toBe(404);
  });
  it('429 limit after the cap', async () => {
    const app = createApp(makeDeps(1));
    await (await app.request('/add', post({ id: 'PSI-9' }))).text();
    expect((await app.request('/add', post({ id: 'PSI-8' }))).status).toBe(429);
  });
  it('never leaks the key', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test-secret';
    const app = createApp(makeDeps());
    expect(await (await app.request('/add', post({ id: 'PSI-9' }))).text()).not.toContain('sk-test-secret');
  });
  it('rejects a body without an id', async () => {
    const app = createApp(makeDeps());
    expect((await app.request('/add', { method: 'POST', body: 'not json' })).status).toBe(400);
  });
});

describe('addLiveRow', () => {
  it('marks unreviewed and ignores a duplicate psiId', () => {
    const once = addLiveRow([], row('PSI-9'));
    expect(once[0].unreviewed).toBe(true);
    expect(addLiveRow(once, row('PSI-9'))).toHaveLength(1);
  });
});
