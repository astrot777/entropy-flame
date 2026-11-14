import { FIELDS, type FieldKey, type Row } from '../../src/shared/types';
import { el, setText } from './dom';
import { LABELS } from './labels';

const NUMERIC: FieldKey[] = ['oxygen', 'pressure', 'airflow'];

export interface CatalogueHandlers {
  onCell: (row: Row, field: FieldKey, td: HTMLTableCellElement) => void;
  onSelect: (psiId: string, selected: boolean) => void;
  isSelected: (psiId: string) => boolean;
}

export function renderCell(td: HTMLTableCellElement, row: Row, field: FieldKey): void {
  const c = row[field];
  td.replaceChildren();
  td.className = field === 'psiId' ? 'id' : `cell${c.status === 'not stated' ? ' ns' : ''}${NUMERIC.includes(field) ? ' num' : ''}`;
  if (c.status === 'not stated') { setText(td, 'Not stated'); return; }
  if (field === 'pillar' && c.value) { td.append(el('span', `pill ${c.value}`, c.value)); return; }
  const text = c.value ?? '';
  if (text.length > 90) td.append(el('span', 'clamp', text));
  else setText(td, text);
  if (field === 'psiId' && row.unreviewed) td.append(el('span', 'badge', 'Unreviewed'));
}

export function renderRow(row: Row, h: CatalogueHandlers): HTMLTableRowElement {
  const id = row.psiId.value ?? '';
  const tr = el('tr', row.unreviewed ? 'live' : '');
  tr.dataset.id = id;
  const pick = el('td');
  const box = el('input');
  box.type = 'checkbox';
  box.checked = h.isSelected(id);
  box.setAttribute('aria-label', `Select ${id} to compare`);
  box.addEventListener('change', () => h.onSelect(id, box.checked));
  pick.append(box);
  tr.append(pick);
  for (const f of FIELDS) {
    const td = el('td');
    td.dataset.field = f;
    renderCell(td, row, f);
    if (f !== 'psiId') td.addEventListener('click', () => h.onCell(row, f, td));
    tr.append(td);
  }
  return tr;
}

export function renderCatalogue(table: HTMLTableElement, rows: Row[], h: CatalogueHandlers): void {
  table.replaceChildren();
  const head = el('thead');
  const hr = el('tr');
  hr.append(el('th', '', ''));
  for (const f of FIELDS) hr.append(el('th', '', LABELS[f]));
  head.append(hr);
  const body = el('tbody');
  for (const row of rows) body.append(renderRow(row, h));
  table.append(head, body);
}
