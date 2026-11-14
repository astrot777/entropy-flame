import { FIELDS, type FieldKey, type Row } from '../../src/shared/types';
import { normalizeText } from '../../src/shared/normalize';
import { el, setText } from './dom';
import { LABELS } from './labels';
import { cellText } from './source';

export type FieldState = 'same' | 'different' | 'not-stated';

export function compareRows(rows: Row[]): { field: FieldKey; state: FieldState }[] {
  return FIELDS.map((field) => {
    const values = rows.map((r) => r[field].value);
    if (values.some((v) => v === null)) return { field, state: 'not-stated' as const };
    const set = new Set(values.map((v) => normalizeText(v as string)));
    return { field, state: set.size === 1 ? ('same' as const) : ('different' as const) };
  });
}

const STATE_LABEL: Record<FieldState, string> = { same: 'Same', different: 'Different', 'not-stated': 'Not stated' };

export function renderCompare(box: HTMLElement, rows: Row[]): void {
  box.replaceChildren();
  box.hidden = false;
  const head = el('div', 'compare-head');
  const close = el('button', '', 'Close comparison');
  close.addEventListener('click', () => { box.hidden = true; });
  head.append(el('h2', '', `Comparing ${rows.length} investigations`), close);
  const wrap = el('div', 'table-wrap');
  const table = el('table');
  table.style.minWidth = '0';
  const hr = el('tr');
  hr.append(el('th', '', 'Field'), el('th', '', ''));
  for (const r of rows) hr.append(el('th', '', `${r.psiId.value} ${r.name.value ?? ''}`));
  const thead = el('thead');
  thead.append(hr);
  const tbody = el('tbody');
  for (const { field, state } of compareRows(rows)) {
    if (field === 'psiId') continue;
    const tr = el('tr');
    tr.dataset.state = state;
    tr.append(el('td', '', LABELS[field]));
    const s = el('td');
    s.append(el('span', `state ${state}`, STATE_LABEL[state]));
    tr.append(s);
    for (const r of rows) {
      const td = el('td', r[field].status === 'not stated' ? 'cell ns' : 'cell');
      setText(td, cellText(field, r[field]));
      tr.append(td);
    }
    tbody.append(tr);
  }
  table.append(thead, tbody);
  wrap.append(table);
  const hint = el('p', 'hint', 'Same and Different compare the text as NASA wrote it. Units are not converted, so two ways of writing the same quantity show as Different.');
  box.append(head, hint, wrap);
}
