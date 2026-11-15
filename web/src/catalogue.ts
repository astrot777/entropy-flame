// The catalogue as cards, written for a mixed audience: plain-language labels, the reason NASA ran the
// experiment up front, and three headline values. "More" opens the rest. Every value is clickable and
// opens its NASA source. Cards are grouped by fire-safety pillar.
import type { FieldKey, Row } from '../../src/shared/types';
import { el, setText } from './dom';
import { LABELS } from './labels';
import { unitFromQuote } from './units';
import { oddValueNote } from './source';
import { cabinCheck } from './cabin';

const NUMERIC: FieldKey[] = ['oxygen', 'pressure', 'airflow'];
const HEADLINE: FieldKey[] = ['fuel', 'oxygen', 'pressure'];
const MORE: FieldKey[] = ['sample', 'airflow', 'hardware', 'sensors', 'type'];
const expanded = new Set<string>();

/** Plain-language labels for the cards, with a one-line explanation shown on hover. The field itself is unchanged. */
export const PLAIN: Partial<Record<FieldKey, { label: string; help: string }>> = {
  objectives: { label: 'Why NASA ran it', help: 'A short AI summary of the goal NASA states for this experiment. Select it to read NASA\'s own sentence.' },
  fuel: { label: 'What burned', help: 'The fuel or material that was burned.' },
  oxygen: { label: 'Oxygen in the air', help: 'How much of the surrounding gas was oxygen. Normal air, on Earth and on the space station, is 21% oxygen.' },
  pressure: { label: 'Air pressure', help: 'The pressure of the gas around the flame. Sea level on Earth, and the space station cabin, is 1 atm (14.7 psia).' },
  sample: { label: 'The sample', help: 'The shape and size of what was burned.' },
  airflow: { label: 'Air movement', help: 'How fast the air moved past the flame. "Quiescent" means still air.' },
  hardware: { label: 'Where it ran', help: 'The facility or equipment the experiment used.' },
  sensors: { label: 'How it was measured', help: 'The instruments that recorded the experiment.' },
  type: { label: 'Kind of study', help: 'Whether it ran in microgravity or on the ground.' },
};

/** The three fire-safety pillars of the challenge, in plain words. The pillar of each card is an AI classification. */
export const PILLARS: { key: string; title: string; text: string }[] = [
  { key: 'Prevention', title: 'Prevention', text: 'How materials catch fire and how flames spread, so a fire can be stopped before it starts.' },
  { key: 'Detection', title: 'Detection', text: 'How smoke and particles behave, so a fire is noticed early.' },
  { key: 'Suppression', title: 'Suppression', text: 'How flames go out, so a fire can be put out.' },
  { key: '', title: 'Not classified', text: 'The record did not support a pillar.' },
];

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
    v.setAttribute('aria-label', `${PLAIN[field]?.label ?? LABELS[field]}: open the NASA source`);
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
  const k = el('span', 'k', PLAIN[field]?.label ?? LABELS[field]);
  if (PLAIN[field]) k.title = PLAIN[field]!.help;
  box.append(k, value(row, field, h));
  return box;
}

/** How many of a row's 12 facts have a NASA source. */
export function statedCount(row: Row): number {
  return Object.values(row).filter((c) => typeof c === 'object' && c !== null && 'status' in c && c.status === 'stated').length;
}

export function renderCard(row: Row, h: CatalogueHandlers, index = 0): HTMLElement {
  const id = row.psiId.value ?? '';
  const card = el('article', `card${row.unreviewed ? ' live' : ''}`);
  card.dataset.id = id;
  card.style.setProperty('--i', String(index));
  card.style.setProperty('view-transition-name', `card-${id.replace(/[^a-zA-Z0-9]/g, '')}`);

  const top = el('div', 'card-top');
  top.append(value(row, 'psiId', h, 'span'), value(row, 'pillar', h, 'span'));
  const name = value(row, 'name', h, 'h3');

  const why = el('div', 'card-why');
  const whyLabel = el('span', 'k', PLAIN.objectives!.label);
  whyLabel.title = PLAIN.objectives!.help;
  whyLabel.append(el('span', 'ai-tag', 'AI summary'));
  why.append(whyLabel, value(row, 'objectives', h));

  const stats = el('div', 'card-stats');
  for (const f of HEADLINE) stats.append(stat(row, f, h));

  const moreWrap = el('div', `card-more${expanded.has(id) ? ' open' : ''}`);
  const more = el('div', 'card-more-inner');
  for (const f of MORE) more.append(stat(row, f, h));
  moreWrap.append(more);

  const n = statedCount(row);
  const trust = el('div', 'card-trust');
  trust.title = 'How many of the 12 facts on this card have a NASA sentence or table line behind them.';
  const bar = el('span', 'trust-bar');
  const fill = el('span');
  fill.style.width = `${(n / 12) * 100}%`;
  bar.append(fill);
  trust.append(bar, el('span', 'trust-text', `${n} of 12 facts have a NASA source`));

  const foot = el('div', 'card-foot');
  const pick = el('label', 'card-pick');
  const box = el('input');
  box.type = 'checkbox';
  box.checked = h.isSelected(id);
  box.setAttribute('aria-label', `Select ${id} to compare`);
  box.addEventListener('change', () => { h.onSelect(id, box.checked); card.classList.toggle('picked', box.checked); });
  pick.append(box, document.createTextNode(' Compare'));
  card.classList.toggle('picked', box.checked);
  const details = el('button', 'card-details', expanded.has(id) ? 'Less' : 'More');
  details.type = 'button';
  details.setAttribute('aria-expanded', String(expanded.has(id)));
  details.addEventListener('click', () => {
    const open = !moreWrap.classList.contains('open');
    moreWrap.classList.toggle('open', open);
    if (open) expanded.add(id); else expanded.delete(id);
    setText(details, open ? 'Less' : 'More');
    details.setAttribute('aria-expanded', String(open));
  });
  const view = el('button', 'view3d', '3D view');
  view.type = 'button';
  view.title = 'A 3D schematic built from this investigation';
  view.setAttribute('aria-label', `Open the 3D experiment view for ${id}`);
  view.addEventListener('click', () => h.onView(row));
  foot.append(pick, details, view);

  card.append(top, name, why, stats, moreWrap, trust, foot);
  return card;
}

/** One word for the empty space at the end of each group. Read down the page they make one sentence. */
export const GAP_WORDS = ['WE', 'BURN', 'HERE', 'WE FLY', 'TO MARS'];

function gapWord(i: number): HTMLElement {
  const word = GAP_WORDS[i % GAP_WORDS.length];
  const w = el('div', 'gap-word');
  w.append(el('span', 'word', word));
  w.style.setProperty('--n', String(word.length)); // the letter count sizes the word to the space it gets
  w.setAttribute('aria-hidden', 'true');
  return w;
}

/** How many columns a word should span: the empty rest of the last row, or a whole row when the row is full. */
export function gapSpan(cards: number, columns: number): number {
  if (columns < 1) return 1;
  const used = cards % columns;
  return used === 0 ? columns : columns - used;
}

/** Stretches each group's word over the empty space its grid has right now. Call after a draw and on resize. */
export function fitGapWords(box: HTMLElement): void {
  for (const grid of box.querySelectorAll<HTMLElement>('.cards')) {
    const word = grid.querySelector<HTMLElement>('.gap-word');
    if (!word) continue;
    const columns = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length;
    word.style.gridColumn = `span ${gapSpan(grid.children.length - 1, columns)}`;
  }
}

/** Draws the cards in pillar groups, then the tail element (the live-Add card), which keeps its state between renders. */
export function renderCatalogue(box: HTMLElement, rows: Row[], h: CatalogueHandlers, tail?: HTMLElement): void {
  const sections: HTMLElement[] = [];
  let index = 0;
  for (const p of PILLARS) {
    const group = rows.filter((r) => (r.pillar.status === 'stated' ? r.pillar.value : '') === p.key);
    if (!group.length) continue;
    const section = el('section', 'group');
    const head = el('div', 'group-head');
    const title = el('h3', '', p.title);
    title.append(el('span', 'group-count', String(group.length)));
    head.append(title, el('p', '', p.text));
    const grid = el('div', 'cards');
    for (const row of group) grid.append(renderCard(row, h, index++));
    grid.append(gapWord(sections.length));
    section.append(head, grid);
    sections.push(section);
  }
  if (tail) {
    const section = el('section', 'group');
    const head = el('div', 'group-head');
    head.append(el('h3', '', 'Add another'), el('p', '', 'Any other investigation in NASA PSI can be read live. It is marked Unreviewed and is not saved.'));
    const grid = el('div', 'cards');
    grid.append(tail, gapWord(sections.length));
    section.append(head, grid);
    sections.push(section);
  }
  box.replaceChildren(...sections);
  fitGapWords(box);
}
