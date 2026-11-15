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
  const zoneEls: SVGRectElement[] = [];
  for (const a of CREW_ATMOSPHERES) {
    const atm = a.psia / PSIA_PER_ATM;
    zoneEls.push(svg('rect', { x: sx(atm * 0.9), y: sy(a.o2 + 2), width: sx(atm * 1.1) - sx(atm * 0.9), height: sy(a.o2 - 2) - sy(a.o2 + 2), class: 'zone' }));
    chart.append(zoneEls[zoneEls.length - 1]);
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
  const dotEls: { el: SVGCircleElement; p: (typeof points)[number] }[] = [];
  for (const p of points) {
    const c = svg('circle', { cx: sx(p.atm), cy: sy(p.o2), r: 3.5, fill: color(p.psiId), class: 'dot' });
    c.addEventListener('mouseenter', (e) => showTip(e, [`${p.psiId} ${names[p.psiId] ?? ''}`, `${p.file}, row ${p.row}`, `${p.o2Column}: ${p.o2Text}`, `${p.pColumn}: ${p.pText}`]));
    c.addEventListener('mouseleave', hideTip);
    c.style.setProperty('--d', `${series.indexOf(p.psiId) * 120}ms`);
    dotEls.push({ el: c, p });
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
  // Focus: hovering a result or an investigation lights its dots and dims the rest. A click keeps it lit.
  let locked: (() => void) | null = null;
  const clearFocus = () => {
    chart.classList.remove('has-focus');
    for (const d of dotEls) d.el.classList.remove('on');
    for (const z of zoneEls) z.classList.remove('on');
    for (const e of box.querySelectorAll('.is-on')) e.classList.remove('is-on');
  };
  const focus = (pick: (pt: (typeof points)[number]) => boolean, owner: HTMLElement, zone?: number) => () => {
    clearFocus();
    chart.classList.add('has-focus');
    for (const d of dotEls) d.el.classList.toggle('on', pick(d.p));
    if (zone !== undefined) zoneEls[zone].classList.add('on');
    owner.classList.add('is-on');
  };
  const wire = (owner: HTMLElement, apply: () => void) => {
    owner.tabIndex = 0;
    owner.setAttribute('role', 'button');
    owner.addEventListener('mouseenter', apply);
    owner.addEventListener('focus', apply);
    const leave = () => { if (locked) locked(); else clearFocus(); };
    owner.addEventListener('mouseleave', leave);
    owner.addEventListener('blur', leave);
    const toggle = () => { locked = locked === apply ? null : apply; if (locked) apply(); else clearFocus(); };
    owner.addEventListener('click', toggle);
    owner.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  };

  // Results: one card per crew atmosphere, counted from the dots.
  const stats = el('div', 'atmap-stats');
  CREW_ATMOSPHERES.forEach((a, i) => {
    const near = testsNear(points, a);
    const card = el('div', `atmap-stat${near.length === 0 ? ' gap' : ''}`);
    const what = el('span', '', `${a.psia} psia, ${a.o2}% oxygen`);
    what.append(el('small', 'role', a.label === 'ISS cabin air' ? 'ISS cabin air' : 'A crew atmosphere NASA has considered'));
    const c = near.length === 0 ? closestTest(points, a) : null;
    if (c) what.append(el('small', '', `Closest test: ${c.psiId}, ${c.o2Column} ${c.o2Text}, ${c.pColumn} ${c.pText}`));
    card.append(el('b', '', String(near.length)), el('em', '', near.length === 1 ? 'test in its zone' : 'tests in its zone'), what);
    const set = new Set(near);
    wire(card, focus((pt) => set.has(pt) || pt === c, card, i));
    stats.append(card);
  });

  // The investigations behind the dots: a legend and a table in one. Each row lights its own dots.
  const side = el('div', 'atmap-side');
  side.append(el('p', 'atmap-kicker', 'Investigations in this chart'));
  const list = el('div', 'atmap-series');
  const f = (v: number) => (Math.round(v * 100) / 100).toString();
  for (const id of series) {
    const ps = points.filter((pt) => pt.psiId === id);
    const item = el('div', 'atmap-row');
    const sw = el('i');
    sw.style.background = color(id);
    const name = el('span', 'n');
    name.append(sw, document.createTextNode(`${id} ${names[id] ?? ''}`));
    item.append(name, el('span', 'c', `${ps.length} tests`),
      el('span', 'r', `Oxygen ${f(Math.min(...ps.map((pt) => pt.o2)))} to ${f(Math.max(...ps.map((pt) => pt.o2)))} %`),
      el('span', 'r', `Pressure ${f(Math.min(...ps.map((pt) => pt.atm)))} to ${f(Math.max(...ps.map((pt) => pt.atm)))} atm`));
    wire(item, focus((pt) => pt.psiId === id, item));
    list.append(item);
  }
  const crewKey = el('div', 'atmap-key');
  crewKey.append(el('i', 'diamond'), document.createTextNode('Crew atmosphere named in the PSI-20 record'));
  side.append(list, crewKey);
  side.append(el('p', 'atmap-note', 'Point at a result or an investigation to light its tests; select it to keep it lit. Point at a dot for its table, row and values as NASA wrote them. A dashed zone is within 2 oxygen points and 10% of the pressure; Entropy chose this size. Oxygen and pressure are converted only to place the dots. PSI-20 (ACME BRE) set out to examine all three atmospheres, but its table does not record pressure per test, so its tests are not dots here. Inverse-flame tables are left out because their oxygen column is the burner stream.'));

  body.append(plot, side);
  box.append(head, stats, body);
}
