import { it, expect, vi } from 'vitest';
import { createApp } from '../../src/api/app';
import { createLimiter, memoryStore } from '../../src/api/limit';
import { emptyLiveRow } from '../../web/src/sse';

const row = emptyLiveRow('PSI-98');
row.oxygen = { status: 'stated', value: '21%', source: 'private-source', quote: 'private-quote' };
function setup(output: string, cap = 10) {
  const stream = vi.fn(async function* () { yield output.slice(0, 9); yield output.slice(9); });
  const app = createApp({ reviewed: [row], ingest: { llm: { stream }, fetchDoc: vi.fn() },
    limiter: createLimiter({ store: memoryStore(), perIpPerDay: cap, globalPerDay: cap }) });
  const post = (question: unknown) => app.request('/ask', { method: 'POST', body: JSON.stringify({ question }) });
  return { stream, post, app };
}
it('answers from catalogue cells and sends no cell values, quotes or sources to the model', async () => {
  const { post, stream } = setup('{"intent":"rank","field":"oxygen","order":"highest"}');
  const response = await post('What is the highest oxygen?');
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.cells).toEqual([{ psiId: 'PSI-98', field: 'oxygen' }]);
  expect(body.text).toContain('"21%"');
  const prompt = JSON.stringify(stream.mock.calls);
  expect(prompt).toContain('PSI-98');
  expect(prompt).not.toMatch(/private-source|private-quote|21%/);
});
it('asks to rephrase when the model returns anything other than an intent', async () => {
  const body = await (await setup('The oxygen was 25%.').post('Oxygen?')).json();
  expect(body.kind).toBe('clarify');
  expect(body.text).not.toContain('25');
});
it('rejects blank, non-text and oversized questions before the model', async () => {
  const { post, stream } = setup('');
  for (const q of ['  ', false, 'a'.repeat(301)]) expect((await post(q)).status).toBe(400);
  expect(stream).not.toHaveBeenCalled();
});
it('shares the quota with live Add', async () => {
  const { post, app } = setup('', 1);
  expect((await post('a'.repeat(300))).status).toBe(200);
  expect((await app.request('/add', { method: 'POST', body: JSON.stringify({ id: 'PSI-99' }) })).status).toBe(429);
});
