import type { Cell, FieldKey, Row } from '../../src/shared/types';
import { applyFilters, type Filters } from './filters';
import { openPanel } from './sourcePanel';
import { el, setText } from './dom';
import { renderCompare } from './compare';
import { mountAsk } from './ask';
import { mountAdd } from './add';
import { mountAbout } from './about';
import { openExperiment } from './experiment';
import { mountAtmosphereMap } from './atmap';
import { mountJourney } from './journey';
import { renderTable } from './table';
import { mountPlanet } from './planet';

interface DataFile { meta: { generatedAt: string; generatedBy: string; source: string }; rows: Row[] }

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const tbl = $<HTMLTableElement>('tbl');
const addCard = el('section', 'card add-card');
addCard.id = 'add';
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
  onCell: (row: Row, field: FieldKey, td: HTMLElement) => {
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
  onView: (row: Row) => { void openExperiment(row); },
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
    [String(stated), 'values with a NASA source'],
    [String(cells.length - stated), 'not stated'],
  ];
  for (const [n, label] of items) {
    const d = el('div');
    d.append(el('b', '', n), document.createTextNode(label));
    stats.append(d);
  }
}

let firstRender = true;
function draw() {
  const rows = applyFilters(allRows(), filters);
  renderTable(tbl, rows, handlers);
  if (!status.classList.contains('error')) setText(status, rows.length ? '' : 'No investigation matches these filters.');
  renderStats();
}

/** Redraws the table. After the first draw, rows glide to their new places where the browser supports it. */
export function render() {
  const start = (document as Document & { startViewTransition?: (cb: () => void) => unknown }).startViewTransition;
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (firstRender || calm || typeof start !== 'function') { firstRender = false; draw(); return; }
  start.call(document, draw);
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

  const cabin = el('select');
  cabin.setAttribute('aria-label', 'Oxygen compared with ISS cabin air');
  for (const [v, t] of [['', 'Oxygen vs ISS cabin: any'], ['above', 'More oxygen than ISS cabin'], ['like', 'Oxygen like ISS cabin']]) {
    const o = el('option', '', t);
    o.value = v;
    cabin.append(o);
  }
  cabin.addEventListener('change', () => { filters.cabinOxygen = (cabin.value || undefined) as Filters['cabinOxygen']; render(); });

  compareBtn = el('button', 'primary', 'Compare');
  compareBtn.disabled = true;
  compareBtn.addEventListener('click', () => {
    const rows = allRows().filter((r) => selected.has(r.psiId.value ?? ''));
    renderCompare(compareBox, rows);
    compareBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  c.append(search, pillar, cabin, fuel, hw, compareBtn, el('span', 'hint', 'Tick 2 to 4 rows to compare'));
}

function buildFooter(meta: DataFile['meta']) {
  const f = $('footer');
  f.replaceChildren();
  const src = el('p');
  const a = el('a', '', 'NASA Physical Sciences Informatics (PSI), combustion science');
  a.href = 'https://psi.nasa.gov/';
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  src.append(document.createTextNode('Data: '), a, document.createTextNode(`. Pulled ${meta.generatedAt.slice(0, 10)}. See About for the hand-checked accuracy.`));
  f.append(
    src,
    el('p', '', meta.generatedBy),
    el('p', '', 'Numbers keep the units written in the source and are never converted. Objectives are an AI summary and Pillar is an AI classification; every other value is copied from its quote.'),
  );
}

// Page 1: the clip, the menu and the motion live in planet.ts; the search box here is the catalogue's own.
function mountHero() {
  mountPlanet();
  // The search box in the hero is the catalogue's own search: it fills that box and goes to the table.
  $('hero-search').addEventListener('submit', (e) => {
    e.preventDefault();
    const box = document.querySelector<HTMLInputElement>('#controls input[type="search"]');
    if (box) {
      box.value = $<HTMLInputElement>('hero-q').value;
      box.dispatchEvent(new Event('input'));
    }
    $('table').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

async function load() {
  buildControls();
  setText(status, 'Loading investigations...');
  try {
    const res = await fetch('investigations.json');
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as DataFile;
    reviewed = data.rows;
    mountAsk($('ask'), allRows, panel);
    buildFooter(data.meta);
    render();
    void mountAbout($('about'), data.meta.generatedAt.slice(0, 10));
    const names = Object.fromEntries(data.rows.map((r) => [r.psiId.value ?? '', r.name.value ?? '']));
    void mountAtmosphereMap($('atmap'), data.rows.map((r) => r.psiId.value ?? ''), names);
  } catch {
    status.className = 'status error';
    setText(status, 'The investigation data could not be loaded. Refresh the page; if this persists, the data file is missing from this deployment.');
  }
  $('add-slot').append(addCard);
  mountAdd(addCard, {
    has: (id: string) => allRows().some((r) => r.psiId.value === id),
    onRow: (row: Row) => { live.push(row); render(); },
    refresh: () => render(),
    reveal: (id: string) => document.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
  });
}

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') panel.hidden = true; });

// The looping clip on the benefits page plays only while it is on screen, and not at all under reduced motion.
const clip = document.getElementById('kb-video') as HTMLVideoElement | null;
if (clip && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) clip.play().catch(() => { /* autoplay refused: the first frame stays */ });
    else clip.pause();
  }, { threshold: 0.15 }).observe(clip);
}
mountJourney($('journey'));
mountHero();
void load();
