// The "Map" view: a full-screen space scene whose markers are the project's investigations, test tables
// and results. It opens like the experiment view and loads three.js only when asked.
import type { Row } from '../../src/shared/types';
import type { TestTables } from '../../src/psi/tables';
import { el, setText } from './dom';
import { buildMarkers, tabsOf, type AccuracyFile } from './scene/mapdata';
import type { SpaceHandle } from './scene/space';

let closeCurrent: (() => void) | null = null;

async function json<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    return res.ok && (res.headers.get('content-type') ?? '').includes('json') ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

export async function openMap(rows: Row[]): Promise<void> {
  closeCurrent?.();
  const overlay = el('div', 'xp map');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Map of the project');

  const head = el('header', 'xp-head');
  const title = el('div');
  title.append(el('h2', '', 'Map · الخريطة'), el('p', 'hint', 'The investigations, NASA test tables and results of this project, above the Earth.'));
  const close = el('button', '', 'Close');
  head.append(title, close);
  const stage = el('div', 'xp-stage map-stage');
  const loading = el('p', 'xp-loading', 'Loading the map...');
  const tabsBar = el('div', 'map-tabs');
  tabsBar.setAttribute('role', 'tablist');
  stage.append(loading, tabsBar);
  const note = el('p', 'xp-note', 'These experiments flew in low Earth orbit, so the markers sit on an orbit at the inclination of the space station; where each marker sits along it is a layout. Earth and Moon imagery: NASA. Drag to orbit, right-drag to pan, scroll to zoom, click a marker for its data, R resets the view, Esc closes a panel.');
  overlay.append(head, stage, note);
  document.body.append(overlay);
  document.body.classList.add('xp-open');

  let handle: SpaceHandle | null = null;
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    if (!handle?.closePanel()) shut();
  };
  function shut() {
    handle?.dispose();
    overlay.remove();
    document.body.classList.remove('xp-open');
    document.removeEventListener('keydown', onKey);
    delete (window as { entropyMap?: SpaceHandle }).entropyMap;
    closeCurrent = null;
  }
  closeCurrent = shut;
  close.addEventListener('click', shut);
  document.addEventListener('keydown', onKey);
  close.focus();

  const ids = rows.map((r) => r.psiId.value ?? '');
  const [tables, accuracy] = await Promise.all([
    Promise.all(ids.map((id) => json<TestTables>(`tests/${id}.json`))),
    json<AccuracyFile>('review/accuracy.json'),
  ]);
  if (closeCurrent !== shut) return;
  const markers = buildMarkers(rows, tables.filter((t): t is TestTables => !!t), accuracy);
  const tabs = tabsOf(markers);

  const buttons = new Map<string, HTMLButtonElement>();
  const mark = (active: string) => { for (const [t, b] of buttons) { b.classList.toggle('active', t === active); b.setAttribute('aria-selected', String(t === active)); } };
  for (const t of tabs) {
    const b = el('button', '', `${t} (${markers.filter((m) => m.tab === t).length})`);
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.addEventListener('click', () => { handle?.setTab(t); mark(t); });
    buttons.set(t, b);
    tabsBar.append(b);
  }
  mark(tabs[0]);
  const moonBtn = el('button', 'map-view', 'Moon view');
  moonBtn.type = 'button';
  moonBtn.addEventListener('click', () => handle?.viewMoon());
  const homeBtn = el('button', 'map-view', 'Earth view (R)');
  homeBtn.type = 'button';
  homeBtn.addEventListener('click', () => handle?.resetView());
  tabsBar.append(moonBtn, homeBtn);

  try {
    const { mountSpace } = await import('./scene/space');
    if (closeCurrent !== shut) return;
    loading.remove();
    handle = mountSpace(stage, markers, tabs[0], mark);
    (window as { entropyMap?: SpaceHandle }).entropyMap = handle;
  } catch {
    setText(loading, 'The map could not start in this browser.');
  }
}
