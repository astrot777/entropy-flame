import { FIELDS, type FieldKey, type Row } from '../../src/shared/types';
import { normalizeText } from '../../src/shared/normalize';
import { el, setText } from './dom';
import { LABELS } from './labels';
import { cellText } from './source';
import { CABIN, oxygenPercent, pressureAtm, type Range } from './cabin';

export type FieldState = 'same' | 'different' | 'not-stated';

export function compareRows(rows: Row[]): { field: FieldKey; state: FieldState }[] {
  return FIELDS.map((field) => {
    const values = rows.map((r) => r[field].value);
    if (values.some((v) => v === null)) return { field, state: 'not-stated' as const };
    const set = new Set(values.map((v) => normalizeText(v as string)));
    return { field, state: set.size === 1 ? ('same' as const) : ('different' as const) };
  });
}

export interface Bar { psiId: string; name: string; text: string; range: Range | null }
export interface BarChart { title: string; unit: string; reference: number; referenceLabel: string; max: number; bars: Bar[]; finding: string }

const round = (v: number) => (Math.round(v * 100) / 100).toString();
/** The axis end: the next multiple of step above the largest value, so the ticks are round numbers. */
const niceMax = (top: number, step: number) => Math.ceil((top * 1.04) / step) * step;

/** The numbers behind one range chart: each investigation's stated range on a shared scale, and what it shows. */
export function rangeChart(rows: Row[], field: 'oxygen' | 'pressure'): BarChart {
  const oxygen = field === 'oxygen';
  const reference = oxygen ? CABIN.oxygenPercent : 1;
  const bars: Bar[] = rows.map((r) => ({
    psiId: r.psiId.value ?? '', name: r.name.value ?? '', text: cellText(field, r[field]),
    range: oxygen ? oxygenPercent(r[field]) : pressureAtm(r[field]),
  }));
  const withRange = bars.filter((b): b is Bar & { range: Range } => b.range !== null);
  const top = Math.max(reference, ...withRange.map((b) => b.range.hi));
  const unit = oxygen ? '%' : 'atm';
  let finding: string;
  if (!withRange.length) finding = `None of the selected investigations states a comparable ${field} value.`;
  else {
    const highest = withRange.reduce((a, b) => (b.range.hi > a.range.hi ? b : a));
    const above = withRange.filter((b) => b.range.hi > reference * (oxygen ? 1.12 : 1.05)).map((b) => b.psiId);
    const missing = bars.length - withRange.length;
    finding = `Highest stated ${field}: ${highest.psiId}, up to ${round(highest.range.hi)} ${unit}. `
      + (above.length ? `Above ISS cabin air: ${above.join(', ')}.` : 'None goes above ISS cabin air.')
      + (missing ? ` ${missing} of ${bars.length} ${missing === 1 ? 'has' : 'have'} no comparable value.` : '');
  }
  return {
    title: oxygen ? 'Oxygen' : 'Pressure', unit, reference,
    referenceLabel: oxygen ? `ISS cabin ${CABIN.oxygenPercent}%` : `ISS cabin ${CABIN.pressurePsia} psia`,
    max: niceMax(top, oxygen ? 10 : top <= 2 ? 0.5 : 1), bars, finding,
  };
}

const STATE_LABEL: Record<FieldState, string> = { same: 'Same', different: 'Different', 'not-stated': 'Not stated' };
const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500'];
const SVG = 'http://www.w3.org/2000/svg';

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, text?: string): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  return e;
}

function drawChart(c: BarChart): HTMLElement {
  const box = el('div', 'cmp-chart');
  box.append(el('h3', '', `${c.title} (${c.unit}, converted only to compare)`));
  const W = 560, ROW = 54, L = 150, R = 24, T = 26;
  const H = T + c.bars.length * ROW + 30;
  const x = (v: number) => L + (v / c.max) * (W - L - R);
  const chart = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `${c.title} ranges of the selected investigations. ${c.finding}` });
  for (let i = 0; i <= 4; i++) {
    const v = (c.max / 4) * i;
    chart.append(svg('line', { x1: x(v), x2: x(v), y1: T, y2: H - 30, class: 'grid' }));
    chart.append(svg('text', { x: x(v), y: H - 12, class: 'tick', 'text-anchor': 'middle' }, round(v)));
  }
  chart.append(svg('line', { x1: x(c.reference), x2: x(c.reference), y1: T - 8, y2: H - 30, class: 'ref' }));
  chart.append(svg('text', { x: x(c.reference) + 6, y: T - 10, class: 'ref-label' }, c.referenceLabel));
  c.bars.forEach((b, i) => {
    const y = T + i * ROW + 14;
    chart.append(svg('text', { x: 0, y: y + 5, class: 'bar-id' }, b.psiId));
    chart.append(svg('text', { x: 0, y: y + 22, class: 'bar-name' }, b.name.length > 20 ? `${b.name.slice(0, 19)}.` : b.name));
    if (!b.range) {
      chart.append(svg('text', { x: L, y: y + 10, class: 'bar-none' }, b.text === 'Not stated' ? 'Not stated' : 'No comparable unit'));
      return;
    }
    const x1 = x(b.range.lo), x2 = Math.max(x(b.range.hi), x1 + 8);
    chart.append(svg('rect', { x: x1, y, width: x2 - x1, height: 14, rx: 4, fill: SERIES[i % SERIES.length] }));
    chart.append(svg('text', { x: L, y: y + 32, class: 'bar-text' }, b.text.length > 54 ? `${b.text.slice(0, 53)}.` : b.text));
  });
  box.append(chart, el('p', 'cmp-finding', c.finding));
  return box;
}

export function renderCompare(box: HTMLElement, rows: Row[]): void {
  box.replaceChildren();
  box.hidden = false;
  const head = el('div', 'compare-head');
  const close = el('button', '', 'Close comparison');
  close.addEventListener('click', () => { box.hidden = true; });
  head.append(el('h2', '', `Comparing ${rows.length} investigations`), close);

  const charts = el('div', 'cmp-charts');
  charts.append(drawChart(rangeChart(rows, 'oxygen')), drawChart(rangeChart(rows, 'pressure')));
  const chartNote = el('p', 'hint', 'Each bar is the range NASA states, on one shared scale. The text under a bar is the value as NASA wrote it. The dashed line is ISS cabin air.');

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
  box.append(head, charts, chartNote, el('h3', 'cmp-sub', 'Every field, as written'), hint, wrap);
}
