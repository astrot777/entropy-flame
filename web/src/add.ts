import { FIELDS, type Cell, type FieldKey, type Row } from '../../src/shared/types';
import { normalizePsiId } from '../../src/shared/normalize';
import { el, setText } from './dom';
import { renderCell } from './catalogue';
import { emptyLiveRow, sseParser } from './sse';

export interface AddHooks { has: (id: string) => boolean; onRow: (row: Row) => void; reveal: (id: string) => void; refresh: () => void }

const MESSAGES: Record<string, string> = {
  bad_id: 'That is not a PSI investigation ID. Try one like PSI-60.',
  not_found: 'PSI has no investigation with that ID.',
  limit: 'Daily live limit reached. The catalogue above still works.',
  upstream: 'The AI service or PSI is unavailable right now. Live Add is turned off until you reload the page.',
  too_long: 'That investigation is too long to read live.',
};

// Combustion investigations in PSI that are not in the reviewed catalogue: good live-Add demos.
const SUGGESTIONS = ['PSI-60', 'PSI-62', 'PSI-115', 'PSI-117', 'PSI-142'];

export function mountAdd(box: HTMLElement, h: AddHooks): void {
  const label = el('label', '', 'Add any PSI investigation live');
  const input = el('input');
  input.id = 'add-id';
  input.placeholder = 'PSI ID or PSI page link, e.g. PSI-60';
  input.autocomplete = 'off';
  label.htmlFor = 'add-id';
  const btn = el('button', 'primary', 'Add');
  const msg = el('span', 'hint');
  msg.setAttribute('role', 'status');
  const chips = el('span', 'hint', 'Try: ');
  for (const s of SUGGESTIONS) {
    const b = el('button', 'chip', s);
    b.type = 'button';
    b.addEventListener('click', () => { input.value = s; void go(); });
    chips.append(b);
  }
  box.append(label, input, btn, chips, msg);

  let busy = false;
  let dead = false;

  async function go() {
    if (busy || dead) return;
    const id = normalizePsiId(input.value);
    if (!id) { setText(msg, MESSAGES.bad_id); return; }
    if (h.has(id)) { setText(msg, `${id} is already in the catalogue.`); h.reveal(id); return; }
    busy = true;
    btn.disabled = true;
    setText(msg, `Reading ${id} from NASA PSI...`);
    const row = emptyLiveRow(id);
    let added = false;
    const started = performance.now();
    try {
      const res = await fetch('/api/add', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) });
      if (!res.ok || !res.body) {
        const code = ((await res.json().catch(() => ({}))) as { code?: string }).code ?? 'upstream';
        throw new Error(code);
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let failed: string | null = null;
      const feed = sseParser((event, data) => {
        const d = data as { field?: FieldKey; cell?: Cell; row?: Row; code?: string };
        if (event === 'field' && d.field && d.cell) {
          if (!added) { h.onRow(row); added = true; h.reveal(id); setText(msg, `Claude is reading ${id}; each value appears once its quote is checked...`); }
          row[d.field] = d.cell;
          const td = document.querySelector<HTMLTableCellElement>(`tr[data-id="${id}"] td[data-field="${d.field}"]`);
          if (td) { renderCell(td, row, d.field); td.classList.add('arrive'); }
        } else if ((event === 'done' || event === 'exists') && d.row) {
          for (const f of FIELDS) row[f] = d.row[f];
          if (!added) { h.onRow(row); added = true; }
        } else if (event === 'error') {
          failed = d.code ?? 'upstream';
        }
      });
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        feed(value);
      }
      if (failed) throw new Error(failed);
      h.refresh();
      h.reveal(id);
      const stated = FIELDS.filter((f) => f !== 'psiId' && row[f].status === 'stated').length;
      setText(msg, `${id} added in ${((performance.now() - started) / 1000).toFixed(1)} s: ${stated} of 11 values have a source quote. Unreviewed, this session only.`);
      input.value = '';
    } catch (e) {
      const code = e instanceof Error && MESSAGES[e.message] ? e.message : 'upstream';
      setText(msg, MESSAGES[code]);
      if (code === 'upstream') { dead = true; input.disabled = true; }
    } finally {
      busy = false;
      btn.disabled = dead;
    }
  }

  btn.addEventListener('click', () => void go());
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') void go(); });
}
