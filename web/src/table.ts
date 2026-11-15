import { FIELDS, type FieldKey, type Row } from '../../src/shared/types';
import { el } from './dom';
import { LABELS } from './labels';
import { renderCell, type CatalogueHandlers } from './catalogue';

// The catalogue table. Six fields are columns; the other six open under the row, so the whole table
// fits the screen and nothing is left out. Every value, in a column or under the row, opens its NASA source.
const SHOWN: FieldKey[] = ['psiId', 'name', 'pillar', 'fuel', 'oxygen', 'pressure'];
const MORE: FieldKey[] = FIELDS.filter((f) => !SHOWN.includes(f));
const COLUMNS = SHOWN.length + 2;

/** Rows whose extra fields are open. Kept across redraws, so filtering does not close them. */
const open = new Set<string>();

/** Makes one value element open its NASA source on click, Enter or Space. */
function opensSource(node: HTMLElement, row: Row, field: FieldKey, h: CatalogueHandlers): void {
  node.tabIndex = 0;
  node.setAttribute('aria-label', `${LABELS[field]}: open the NASA source`);
  node.addEventListener('click', () => h.onCell(row, field, node));
  node.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); h.onCell(row, field, node); }
  });
}

/** One investigation: the row of main fields, and the row under it that holds the rest. */
function tableRows(row: Row, h: CatalogueHandlers): HTMLTableRowElement[] {
  const id = row.psiId.value ?? '';
  const tr = el('tr', row.unreviewed ? 'live' : '');
  tr.dataset.id = id;
  const pick = el('td', 'pick');
  const box = el('input');
  box.type = 'checkbox';
  box.checked = h.isSelected(id);
  box.setAttribute('aria-label', `Select ${id} to compare`);
  box.addEventListener('change', () => h.onSelect(id, box.checked));
  const view = el('button', 'view3d', '3D');
  view.type = 'button';
  view.title = 'Experiment view: a 3D schematic built from this row';
  view.setAttribute('aria-label', `Open the 3D experiment view for ${id}`);
  view.addEventListener('click', () => h.onView(row));
  pick.append(box, view);
  tr.append(pick);
  for (const f of SHOWN) {
    const td = el('td');
    td.dataset.field = f;
    renderCell(td, row, f);
    if (f !== 'psiId') opensSource(td, row, f, h);
    tr.append(td);
  }

  const detail = el('tr', 'more');
  detail.dataset.id = id;
  detail.id = `more-${id}`;
  const cell = el('td');
  cell.colSpan = COLUMNS;
  const grid = el('div', 'hp-more');
  for (const f of MORE) {
    const fact = el('div', 'hp-fact');
    const value = el('div');
    value.dataset.field = f;
    renderCell(value, row, f);
    opensSource(value, row, f, h);
    fact.append(el('span', 'hp-k', LABELS[f]), value);
    grid.append(fact);
  }
  cell.append(grid);
  detail.append(cell);

  const last = el('td', 'more-cell');
  const toggle = el('button', 'hp-toggle', 'Details');
  toggle.type = 'button';
  toggle.setAttribute('aria-controls', detail.id);
  const set = (on: boolean) => {
    detail.hidden = !on;
    tr.classList.toggle('is-open', on);
    toggle.setAttribute('aria-expanded', String(on));
    toggle.setAttribute('aria-label', `${on ? 'Hide' : 'Show'} the other ${MORE.length} fields of ${id}`);
  };
  toggle.addEventListener('click', () => {
    const on = !open.has(id);
    if (on) open.add(id); else open.delete(id);
    set(on);
  });
  set(open.has(id));
  last.append(toggle);
  tr.append(last);
  return [tr, detail];
}

/** The whole catalogue as one table: a row per investigation. */
export function renderTable(table: HTMLTableElement, rows: Row[], h: CatalogueHandlers): void {
  const head = el('thead');
  const hr = el('tr');
  const first = el('th');
  first.append(el('span', 'sr', 'Compare and 3D view'));
  hr.append(first);
  for (const f of SHOWN) {
    const th = el('th', '', LABELS[f]);
    th.scope = 'col';
    th.dataset.field = f;
    hr.append(th);
  }
  const lastHead = el('th');
  lastHead.append(el('span', 'sr', 'Other fields'));
  hr.append(lastHead);
  head.append(hr);
  const body = el('tbody');
  for (const row of rows) body.append(...tableRows(row, h));
  if (!rows.length) {
    const tr = el('tr');
    const td = el('td', 'empty', 'No investigation matches these filters.');
    td.colSpan = COLUMNS;
    tr.append(td);
    body.append(tr);
  }
  table.replaceChildren(head, body);
}
