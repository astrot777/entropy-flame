import type { Cell, FieldKey, Row } from '../../src/shared/types';
import { applyFilters, type Filters } from './filters';
import { renderCatalogue } from './catalogue';
import { openPanel } from './sourcePanel';
import { el, setText } from './dom';
import { renderCompare } from './compare';
import { mountAdd } from './add';

interface DataFile { meta: { generatedAt: string; generatedBy: string; source: string }; rows: Row[] }

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const table = $<HTMLTableElement>('catalogue');
const panel = $('panel');
const status = $('status');
const compareBox = $('compare');

let reviewed: Row[] = [];
export const live: Row[] = [];
const selected = new Set<string>();
const filters: Filters = {};
let compareBtn: HTMLButtonElement;
let lastCell: HTMLElement | null = null;

export const allRows = () => [...reviewed, ...live];

const handlers = {
  onCell: (row: Row, field: FieldKey, td: HTMLTableCellElement) => {
    lastCell?.classList.remove('sel');
    td.classList.add('sel');
    lastCell = td;
    openPanel(panel, row, field);
  },
  onSelect: (id: string, on: boolean) => {
    if (on) selected.add(id); else selected.delete(id);
    updateCompareButton();
  },
  isSelected: (id: string) => selected.has(id),
};

function updateCompareButton() {
  const n = selected.size;
  compareBtn.disabled = n < 2 || n > 4;
  setText(compareBtn, n ? `Compare (${n})` : 'Compare');
}

const isCell = (c: unknown): c is Cell => typeof c === 'object' && c !== null && 'status' in c;

function renderStats() {
  const rows = allRows();
  const cells = rows.flatMap((r) => Object.values(r).filter(isCell));
  const stated = cells.filter((c) => c.status === 'stated').length;
  const stats = $('stats');
  stats.replaceChildren();
  const items: [string, string][] = [
    [String(rows.length), 'investigations'],
    [String(stated), 'values with a source quote'],
    [String(cells.length - stated), 'not stated'],
  ];
  for (const [n, label] of items) {
    const d = el('div');
    d.append(el('b', '', n), document.createTextNode(label));
    stats.append(d);
  }
}

export function render() {
  const rows = applyFilters(allRows(), filters);
  renderCatalogue(table, rows, handlers);
  if (!status.classList.contains('error')) setText(status, rows.length ? '' : 'No investigation matches these filters.');
  renderStats();
}

function buildControls() {
  const c = $('controls');
  const search = el('input', 'grow');
  search.type = 'search';
  search.placeholder = 'Search every value (fuel, hardware, sensor...)';
  search.setAttribute('aria-label', 'Search');
  search.addEventListener('input', () => { filters.text = search.value; render(); });

  const pillar = el('select');
  pillar.setAttribute('aria-label', 'Pillar');
  for (const [v, t] of [['', 'All pillars'], ['Prevention', 'Prevention'], ['Detection', 'Detection'], ['Suppression', 'Suppression']]) {
    const o = el('option', '', t);
    o.value = v;
    pillar.append(o);
  }
  pillar.addEventListener('change', () => { filters.pillar = pillar.value || undefined; render(); });

  const fuel = el('input');
  fuel.placeholder = 'Fuel';
  fuel.setAttribute('aria-label', 'Fuel');
  fuel.addEventListener('input', () => { filters.fuel = fuel.value || undefined; render(); });

  const hw = el('input');
  hw.placeholder = 'Hardware';
  hw.setAttribute('aria-label', 'Hardware');
  hw.addEventListener('input', () => { filters.hardware = hw.value || undefined; render(); });

  compareBtn = el('button', 'primary', 'Compare');
  compareBtn.disabled = true;
  compareBtn.addEventListener('click', () => {
    const rows = allRows().filter((r) => selected.has(r.psiId.value ?? ''));
    renderCompare(compareBox, rows);
    compareBox.scrollIntoView({ behavior: 'smooth' });
  });
  c.append(search, pillar, fuel, hw, compareBtn, el('span', 'hint', 'Tick 2 to 4 rows to compare'));
}

function buildFooter(meta: DataFile['meta']) {
  const f = $('footer');
  f.replaceChildren();
  const src = el('p');
  const a = el('a', '', 'NASA Physical Sciences Informatics (PSI), combustion science');
  a.href = 'https://psi.nasa.gov/';
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  src.append(document.createTextNode('Data: '), a, document.createTextNode(`. Pulled ${meta.generatedAt.slice(0, 10)}. Rows reviewed by a person: 0.`));
  f.append(
    src,
    el('p', '', meta.generatedBy),
    el('p', '', 'Numbers keep the units written in the source and are never converted. Objectives are an AI summary; every other value is copied from its quote.'),
  );
}

async function load() {
  buildControls();
  setText(status, 'Loading investigations...');
  try {
    const res = await fetch('investigations.json');
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as DataFile;
    reviewed = data.rows;
    buildFooter(data.meta);
    render();
  } catch {
    status.className = 'status error';
    setText(status, 'The investigation data could not be loaded. Refresh the page; if this persists, the data file is missing from this deployment.');
  }
  mountAdd($('add'), {
    has: (id: string) => allRows().some((r) => r.psiId.value === id),
    onRow: (row: Row) => { live.push(row); render(); },
    refresh: () => render(),
    reveal: (id: string) => document.querySelector(`tr[data-id="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
  });
}

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') panel.hidden = true; });
void load();
