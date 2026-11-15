// The "Map" view: a full-screen space scene with one marker per investigation. It opens like the
// experiment view and loads three.js only when asked. A value selected on a marker's panel opens the same
// source panel as the catalogue: the quote and the link to the PSI record.
import type { FieldKey, Row } from '../../src/shared/types';
import { el, setText } from './dom';
import { buildMarkers, tabsOf } from './scene/mapdata';
import type { SpaceHandle } from './scene/space';
import { openPanel } from './sourcePanel';

let closeCurrent: (() => void) | null = null;

export async function openMap(rows: Row[], sourcePanel: HTMLElement): Promise<void> {
  closeCurrent?.();
  const overlay = el('div', 'xp map');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Map of the investigations');

  const head = el('header', 'xp-head');
  const title = el('div');
  title.append(el('h2', '', 'Map'), el('p', 'hint', 'One marker per investigation, grouped by the hardware its NASA record states.'));
  const close = el('button', '', 'Close');
  head.append(title, close);
  const stage = el('div', 'xp-stage map-stage');
  const loading = el('p', 'xp-loading', 'Loading the map...');
  const tabsBar = el('div', 'map-tabs');
  tabsBar.setAttribute('role', 'tablist');
  stage.append(loading, tabsBar);
  const note = el('p', 'xp-note', 'The catalogue holds no coordinates, so a marker is not a location. Markers are grouped by the hardware each record states, and where a group sits on the ring carries no meaning. The Earth, the Moon and the stars are scenery (NASA imagery). Drag to orbit, right-drag to pan, scroll to zoom, select a marker for its 12 facts, select a fact for its NASA source, R resets the view, Esc closes a panel.');
  overlay.append(head, stage, note);
  document.body.append(overlay);
  document.body.classList.add('xp-open');

  let handle: SpaceHandle | null = null;
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    if (!sourcePanel.hidden) { sourcePanel.hidden = true; e.stopImmediatePropagation(); return; }
    if (!handle?.closePanel()) shut();
  };
  function shut() {
    handle?.dispose();
    overlay.remove();
    sourcePanel.classList.remove('over-map');
    document.body.classList.remove('xp-open');
    document.removeEventListener('keydown', onKey, true);
    delete (window as { entropyMap?: SpaceHandle }).entropyMap;
    closeCurrent = null;
  }
  closeCurrent = shut;
  close.addEventListener('click', shut);
  document.addEventListener('keydown', onKey, true);
  close.focus();
  sourcePanel.classList.add('over-map');

  const markers = buildMarkers(rows);
  const tabs = tabsOf(markers);
  const buttons = new Map<string, HTMLButtonElement>();
  const mark = (active: string) => { for (const [t, b] of buttons) { b.classList.toggle('active', t === active); b.setAttribute('aria-selected', String(t === active)); } };
  for (const t of tabs) {
    const b = el('button', '', `${t} (${markers.filter((m) => m.sets.includes(t)).length})`);
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

  const onField = (psiId: string, field: FieldKey) => {
    const row = rows.find((r) => r.psiId.value === psiId);
    if (row) openPanel(sourcePanel, row, field);
  };

  try {
    const { mountSpace } = await import('./scene/space');
    if (closeCurrent !== shut) return;
    loading.remove();
    handle = mountSpace(stage, markers, tabs[0], mark, { onField });
    (window as { entropyMap?: SpaceHandle }).entropyMap = handle;
  } catch {
    setText(loading, 'The map could not start in this browser.');
  }
}
