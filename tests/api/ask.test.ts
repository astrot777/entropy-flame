import { it, expect, vi } from 'vitest';
import { createApp } from '../../src/api/app';
import { createLimiter, memoryStore } from '../../src/api/limit';
import { emptyLiveRow } from '../../web/src/sse';

const row = emptyLiveRow('PSI-98');
row.oxygen = { status: 'stated', value: '21%', source: 'private-source', quote: 'private-quote' };
const line = (sentence: string, field = 'oxygen', psiId = 'PSI-98') => JSON.stringify({ sentence, field, psiId });
function setup(lines: string[], cap = 10) {
  const stream = vi.fn(async function* () {
    const raw = lines.join('\n');
    yield raw.slice(0, 9); yield raw.slice(9);
  });
  const app = createApp({ reviewed: [row], ingest: { llm: { stream }, fetchDoc: vi.fn() },
    limiter: createLimiter({ store: memoryStore(), perIpPerDay: cap, globalPerDay: cap }) });
  const post = (question: unknown) => app.request('/ask', { method: 'POST', body: JSON.stringify({ question }) });
  return { stream, post, app };
}
it('returns grounded evidence only and sends no source metadata', async () => {
  const { post, stream } = setup(['bad', line('21%'), line('121%'), line('-21%'), line('21% is safe'), line('21%', 'fuel'), line('21%', 'oxygen', 'PSI-99')]);
  const response = await post('What oxygen level was reported?');
  expect(response.status).toBe(200);
  expect((await response.json()).sentences).toEqual([{ sentence: '21%', field: 'oxygen', psiId: 'PSI-98' }]);
  const prompt = JSON.stringify(stream.mock.calls);
  expect(prompt).toContain('21%');
  expect(prompt).not.toMatch(/private-source|private-quote|unreviewed/);
});
it('gives the exact fallback when nothing survives', async () => {
  expect(await (await setup([line('25%')]).post('Oxygen?')).json()).toEqual({ answer: 'Not stated in the catalogue.', sentences: [] });
});
it('rejects blank, non-text and oversized questions before the model', async () => {
  const { post, stream } = setup([]);
  for (const q of ['  ', false, 'a'.repeat(301)]) expect((await post(q)).status).toBe(400);
  expect(stream).not.toHaveBeenCalled();
});
it('shares the quota with live Add', async () => {
  const { post, app } = setup([], 1);
  expect((await post('a'.repeat(300))).status).toBe(200);
  expect((await app.request('/add', { method: 'POST', body: JSON.stringify({ id: 'PSI-99' }) })).status).toBe(429);
});
