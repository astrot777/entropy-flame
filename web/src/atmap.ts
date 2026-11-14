// The atmosphere map: every NASA test that records oxygen and pressure, against the crew atmospheres NASA names.
import type { TestTables } from '../../src/psi/tables';
import { el } from './dom';
import { closestTest, CREW_ATMOSPHERES, PSIA_PER_ATM, testPoints, testsNear } from './atmosphere';

const SVG = 'http://www.w3.org/2000/svg';
const COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#9085e9']; // the palette's steps for a dark surface
const W = 820, H = 380, M = { l: 60, r: 20, t: 16, b: 50 };
const X = { lo: 0, hi: 5.25 }, Y = { lo: 10, hi: 42 };
const sx = (v: number) => M.l + ((v - X.lo) / (X.hi - X.lo)) * (W - M.l - M.r);
const sy = (v: number) => H - M.b - ((v - Y.lo) / (Y.hi - Y.lo)) * (H - M.t - M.b);

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, text?: string): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  return e;
}

async function loadTables(psiId: string): Promise<TestTables | null> {
  try {
    const res = await fetch(`tests/${psiId}.json`);
    return res.ok ? ((await res.json()) as TestTables) : null;
  } catch {
    return null;
  }
}

export async function mountAtmosphereMap(box: HTMLElement, psiIds: string[], names: Record<string, string>): Promise<void> {
  const all = (await Promise.all(psiIds.map(loadTables))).filter((t): t is TestTables => !!t);
  const points = all.flatMap(testPoints);
  if (!points.length) return;
  const series = [...new Set(points.map((p) => p.psiId))];
  const color = (id: string) => COLORS[series.indexOf(id) % COLORS.length];

  box.replaceChildren();
  const head = el('div', 'atmap-head');
  head.append(el('p', 'atmap-kicker', 'Tested atmospheres'), el('h2', '', 'Where NASA tested fire, against the air crews will breathe'));
  head.append(el('p', 'atmap-lead', `Each dot is one test from NASA's experimental tables that records both the oxygen and the pressure around the flame: ${points.length} tests in ${series.length} investigations. Diamonds are the crew atmospheres NASA names in the PSI-20 record.`));

  const body = el('div', 'atmap-body');
  const plot = el('div', 'atmap-plot');
  const chart = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Scatter chart of ${points.length} NASA fire tests by pressure and oxygen, with three crew atmospheres marked` });

  // Grid and axes: recessive.
  for (let x = 0; x <= 5; x += 1) {
    chart.append(svg('line', { x1: sx(x), x2: sx(x), y1: M.t, y2: H - M.b, class: 'grid' }));
    chart.append(svg('text', { x: sx(x), y: H - M.b + 20, class: 'tick', 'text-anchor': 'middle' }, String(x)));
  }
  for (let y = 10; y <= 40; y += 10) {
    chart.append(svg('line', { x1: M.l, x2: W - M.r, y1: sy(y), y2: sy(y), class: 'grid' }));
    chart.append(svg('text', { x: M.l - 10, y: sy(y) + 4, class: 'tick', 'text-anchor': 'end' }, `${y}%`));
  }
  chart.append(svg('text', { x: (M.l + W - M.r) / 2, y: H - 10, class: 'axis-title', 'text-anchor': 'middle' }, 'Pressure (atm; converted only to place the dots)'));
  chart.append(svg('text', { x: 16, y: (M.t + H - M.b) / 2, class: 'axis-title', 'text-anchor': 'middle', transform: `rotate(-90 16 ${(M.t + H - M.b) / 2})` }, 'Oxygen (%)'));

  // Crew atmospheres: the "near" zone, then a diamond.
  for (const a of CREW_ATMOSPHERES) {
    const atm = a.psia / PSIA_PER_ATM;
    chart.append(svg('rect', { x: sx(atm * 0.9), y: sy(a.o2 + 2), width: sx(atm * 1.1) - sx(atm * 0.9), height: sy(a.o2 - 2) - sy(a.o2 + 2), class: 'zone' }));
  }

  const tip = el('div', 'atmap-tip');
  tip.hidden = true;
  const showTip = (e: MouseEvent, lines: string[]) => {
    tip.replaceChildren(...lines.map((l, i) => el(i ? 'span' : 'b', '', l)));
    tip.hidden = false;
    const r = plot.getBoundingClientRect();
    tip.style.left = `${Math.min(e.clientX - r.left + 14, r.width - 250)}px`;
    tip.style.top = `${e.clientY - r.top + 14}px`;
  };
  const hideTip = () => { tip.hidden = true; };

  const dots = svg('g', { class: 'dots' });
  for (const p of points) {
    const c = svg('circle', { cx: sx(p.atm), cy: sy(p.o2), r: 3.5, fill: color(p.psiId), class: 'dot' });
    c.addEventListener('mouseenter', (e) => showTip(e, [`${p.psiId} ${names[p.psiId] ?? ''}`, `${p.file}, row ${p.row}`, `${p.o2Column}: ${p.o2Text}`, `${p.pColumn}: ${p.pText}`]));
    c.addEventListener('mouseleave', hideTip);
    dots.append(c);
  }
  chart.append(dots);

  CREW_ATMOSPHERES.forEach((a, i) => {
    const x = sx(a.psia / PSIA_PER_ATM), y = sy(a.o2), s = 8;
    const d = svg('path', { d: `M${x} ${y - s}L${x + s} ${y}L${x} ${y + s}L${x - s} ${y}Z`, class: 'crew' });
    d.addEventListener('mouseenter', (e) => showTip(e, [`${a.label}: ${a.psia} psia, ${a.o2}% oxygen`, `${a.psiId} record: "${a.quote}"`]));
    d.addEventListener('mouseleave', hideTip);
    chart.append(d);
    // Labels sit in the empty band right of the dots, joined to their diamond by a thin leader line.
    const lx = sx(1.5), ly = y + (i === 0 ? 20 : 4);
    chart.append(svg('line', { x1: x + s + 2, y1: y, x2: lx - 6, y2: ly - 4, class: 'leader' }));
    chart.append(svg('text', { x: lx, y: ly, class: 'crew-label' }, `${a.psia} psia · ${a.o2}%`));
  });

  plot.append(chart, tip);

  // Findings: counts computed from the dots, nothing else.
  const side = el('div', 'atmap-side');
  side.append(el('p', 'atmap-kicker', 'Tests inside each dashed zone'));
  for (const a of CREW_ATMOSPHERES) {
    const n = testsNear(points, a).length;
    const row = el('div', `atmap-stat${n === 0 ? ' gap' : ''}`);
    const what = el('span', '', `${a.psia} psia, ${a.o2}% oxygen${a.label === 'ISS cabin air' ? ' (ISS cabin air)' : ''}`);
    const c = n === 0 ? closestTest(points, a) : null;
    if (c) what.append(el('small', '', `Closest: ${c.psiId}, ${c.o2Column} ${c.o2Text}, ${c.pColumn} ${c.pText}`));
    row.append(el('b', '', String(n)), what);
    side.append(row);
  }
  side.append(el('p', 'atmap-note', 'A dashed zone is within 2 oxygen points and 10% of the pressure; Entropy chose this size. PSI-20 (ACME BRE) set out to examine all three atmospheres, but its table does not record pressure per test, so its tests are not dots here. Inverse-flame tables are left out because their oxygen column is the burner stream.'));

  const legend = el('div', 'atmap-legend');
  for (const id of series) {
    const item = el('span', 'atmap-key');
    const sw = el('i');
    sw.style.background = color(id);
    item.append(sw, document.createTextNode(`${id} ${names[id] ?? ''}`));
    legend.append(item);
  }
  const crewKey = el('span', 'atmap-key');
  crewKey.append(el('i', 'diamond'), document.createTextNode('Crew atmosphere (PSI-20)'));
  legend.append(crewKey);
  side.append(legend);

  // Table view of the same data.
  const details = el('details', 'atmap-table');
  details.append(el('summary', '', 'Show as a table'));
  const table = el('table');
  const hr = el('tr');
  for (const h of ['Investigation', 'Tests', 'Oxygen (%)', 'Pressure (atm)']) hr.append(el('th', '', h));
  table.append(hr);
  for (const id of series) {
    const ps = points.filter((p) => p.psiId === id);
    const f = (v: number) => (Math.round(v * 100) / 100).toString();
    const tr = el('tr');
    for (const v of [`${id} ${names[id] ?? ''}`, String(ps.length), `${f(Math.min(...ps.map((p) => p.o2)))} to ${f(Math.max(...ps.map((p) => p.o2)))}`, `${f(Math.min(...ps.map((p) => p.atm)))} to ${f(Math.max(...ps.map((p) => p.atm)))}`]) tr.append(el('td', '', v));
    table.append(tr);
  }
  details.append(table);

  body.append(plot, side);
  box.append(head, body, details);
}
