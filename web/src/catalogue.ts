// The catalogue as cards: each investigation shows its name and three headline values (fuel, oxygen,
// pressure); "Details" opens the rest. Every value is clickable and opens its NASA source.
import type { FieldKey, Row } from '../../src/shared/types';
import { el, setText } from './dom';
import { LABELS } from './labels';
import { unitFromQuote } from './units';
import { oddValueNote } from './source';
import { cabinCheck } from './cabin';

const NUMERIC: FieldKey[] = ['oxygen', 'pressure', 'airflow'];
const HEADLINE: FieldKey[] = ['fuel', 'oxygen', 'pressure'];
const MORE: FieldKey[] = ['objectives', 'sample', 'airflow', 'hardware', 'sensors'];
const expanded = new Set<string>();

export interface CatalogueHandlers {
  onCell: (row: Row, field: FieldKey, cell: HTMLElement) => void;
  onSelect: (psiId: string, selected: boolean) => void;
  isSelected: (psiId: string) => boolean;
  onView: (row: Row) => void;
}

/** Fills one value element. Also used by live Add, which fills a card value by value. */
export function renderCell(td: HTMLElement, row: Row, field: FieldKey): void {
  const c = row[field];
  td.replaceChildren();
  td.className = field === 'psiId' ? 'id' : `cell${c.status === 'not stated' ? ' ns' : ''}${NUMERIC.includes(field) ? ' num' : ''}`;
  if (c.status === 'not stated') { setText(td, 'Not stated'); return; }
  if (field === 'pillar' && c.value) { td.append(el('span', `pill ${c.value}`, c.value)); return; }
  const text = c.value ?? '';
  if (text.length > 90) td.append(el('span', 'clamp', text));
  else setText(td, text);
  const unit = NUMERIC.includes(field) || field === 'sample' ? unitFromQuote(text, c.quote ?? '') : null;
  if (unit) td.append(el('span', 'unit', ` ${unit}`));
  if (oddValueNote(field, c)) td.append(el('span', 'badge', 'Check source'));
  const cab = cabinCheck(field, c);
  if (cab) td.append(el('span', `cab ${cab.verdict}`, cab.label));
  if (field === 'psiId' && row.unreviewed) td.append(el('span', 'badge', 'Unreviewed'));
}

function value(row: Row, field: FieldKey, h: CatalogueHandlers, tag: 'div' | 'span' | 'h3' | 'p' = 'div'): HTMLElement {
  const v = el(tag);
  v.dataset.field = field;
  renderCell(v, row, field);
  if (field !== 'psiId') {
    v.tabIndex = 0;
    v.setAttribute('role', 'button');
    v.setAttribute('aria-label', `${LABELS[field]}: open the NASA source`);
    v.addEventListener('click', () => h.onCell(row, field, v));
    v.addEventListener('keydown', (e) => {
      const k = (e as KeyboardEvent).key;
      if (k === 'Enter' || k === ' ') { e.preventDefault(); h.onCell(row, field, v); }
    });
  }
  return v;
}

function stat(row: Row, field: FieldKey, h: CatalogueHandlers): HTMLElement {
  const box = el('div', 'stat');
  box.append(el('span', 'k', LABELS[field]), value(row, field, h));
  return box;
}

export function renderCard(row: Row, h: CatalogueHandlers): HTMLElement {
  const id = row.psiId.value ?? '';
  const card = el('article', `card${row.unreviewed ? ' live' : ''}`);
  card.dataset.id = id;

  const top = el('div', 'card-top');
  top.append(value(row, 'psiId', h, 'span'), value(row, 'pillar', h, 'span'));
  const name = value(row, 'name', h, 'h3');
  const type = value(row, 'type', h, 'p');
  type.classList.add('card-type');

  const stats = el('div', 'card-stats');
  for (const f of HEADLINE) stats.append(stat(row, f, h));

  const more = el('div', 'card-more');
  for (const f of MORE) more.append(stat(row, f, h));
  more.hidden = !expanded.has(id);

  const foot = el('div', 'card-foot');
  const pick = el('label', 'card-pick');
  const box = el('input');
  box.type = 'checkbox';
  box.checked = h.isSelected(id);
  box.setAttribute('aria-label', `Select ${id} to compare`);
  box.addEventListener('change', () => { h.onSelect(id, box.checked); card.classList.toggle('picked', box.checked); });
  pick.append(box, document.createTextNode(' Compare'));
  card.classList.toggle('picked', box.checked);
  const details = el('button', 'card-details', more.hidden ? 'Details' : 'Less');
  details.type = 'button';
  details.setAttribute('aria-expanded', String(!more.hidden));
  details.addEventListener('click', () => {
    more.hidden = !more.hidden;
    if (more.hidden) expanded.delete(id); else expanded.add(id);
    setText(details, more.hidden ? 'Details' : 'Less');
    details.setAttribute('aria-expanded', String(!more.hidden));
  });
  const view = el('button', 'view3d', '3D');
  view.type = 'button';
  view.title = 'Experiment view: a 3D schematic built from this investigation';
  view.setAttribute('aria-label', `Open the 3D experiment view for ${id}`);
  view.addEventListener('click', () => h.onView(row));
  foot.append(pick, details, view);

  card.append(top, name, type, stats, more, foot);
  return card;
}

/** Draws the cards, then the tail element (the live-Add card), which keeps its state between renders. */
export function renderCatalogue(grid: HTMLElement, rows: Row[], h: CatalogueHandlers, tail?: HTMLElement): void {
  grid.replaceChildren(...rows.map((row) => renderCard(row, h)));
  if (tail) grid.append(tail);
}
