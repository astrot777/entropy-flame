// @vitest-environment jsdom
import { it, expect, vi, afterEach } from 'vitest';
import { mountAsk } from '../../web/src/ask';
import { emptyLiveRow } from '../../web/src/sse';

afterEach(() => vi.unstubAllGlobals());
function mount() {
  const box = document.createElement('section');
  const panel = document.createElement('aside');
  const row = emptyLiveRow('PSI-98');
  row.oxygen = { value: '21%', status: 'stated', source: 'https://psi.nasa.gov/', quote: 'Oxygen was 21%.' };
  mountAsk(box, [row], panel);
  box.querySelector('input')!.value = 'Oxygen?';
  box.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
  return { box, panel };
}
it('opens the cited cell in the existing source panel', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ sentences: [{ sentence: '21%', psiId: 'PSI-98', field: 'oxygen' }] })));
  const { box, panel } = mount();
  await vi.waitFor(() => expect(box.textContent).toContain('PSI-98 · Oxygen'));
  box.querySelector<HTMLButtonElement>('.ask-chip')!.click();
  expect(panel.querySelector('blockquote')?.textContent).toBe('Oxygen was 21%.');
});
it('keeps the form usable after a network error', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('private detail')));
  const { box } = mount();
  await vi.waitFor(() => expect(box.textContent).toContain('Please try again.'));
  expect(box.textContent).not.toContain('private detail');
  expect(box.querySelector('button')!.disabled).toBe(false);
});
