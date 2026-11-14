// The "Experiment view": a 3D schematic of one investigation, built only from the row's stated values,
// beside a list of the same values with their NASA source quotes.
import type { Row } from '../../src/shared/types';
import { el, setText } from './dom';
import { LABELS } from './labels';
import { buildSceneSpec, PARTS, type PartKey } from './scene/spec';
import type { SceneHandle } from './scene/view';

let closeCurrent: (() => void) | null = null;

export async function openExperiment(row: Row): Promise<void> {
  closeCurrent?.();
  const spec = buildSceneSpec(row);
  const overlay = el('div', 'xp');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', `Experiment view for ${spec.psiId}`);

  const head = el('header', 'xp-head');
  const title = el('div');
  title.append(el('h2', '', `${spec.psiId} · ${spec.name || 'Investigation'}`), el('p', 'hint', 'Experiment view: a 3D schematic built only from the values NASA states for this investigation.'));
  const close = el('button', '', 'Close');
  head.append(title, close);

  const stage = el('div', 'xp-stage');
  const loading = el('p', 'xp-loading', 'Loading the 3D view...');
  stage.append(loading);
  const note = el('p', 'xp-note', 'Coloured parts come from a stated value; grey parts are Not stated. Not to scale and not a physical simulation: no flame is drawn, because the record gives no flame geometry. Drag to rotate, scroll to zoom, click a part for its source.');

  const side = el('aside', 'xp-side');
  side.append(el('h3', '', 'Every part and its source'));
  const list = el('div', 'xp-list');
  const detail = el('div', 'xp-detail');
  side.append(list, detail);

  let handle: SceneHandle | null = null;
  const buttons = new Map<PartKey, HTMLButtonElement>();

  function select(part: PartKey) {
    for (const [p, b] of buttons) b.classList.toggle('active', p === part);
    handle?.highlight(part);
    const cell = row[part];
    detail.replaceChildren();
    detail.append(el('h4', '', LABELS[part]));
    if (cell.status === 'not stated') {
      detail.append(el('p', 'value ns', 'Not stated'), el('p', 'hint', 'The PSI record gives no sentence or table line that supports a value, so this part stays grey in the schematic.'));
    } else {
      detail.append(el('p', 'value', spec.parts[part].text));
      detail.append(el('p', 'hint', part === 'type' || part === 'hardware' || part === 'fuel' || part === 'sensors' ? 'Source quote, word for word' : 'Source quote, word for word (drives this part of the schematic)'));
      detail.append(el('blockquote', '', cell.quote ?? ''));
    }
    const link = el('a', '', 'Open the PSI record');
    link.href = cell.source || row.psiId.source;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    detail.append(link);
  }

  for (const part of PARTS) {
    const b = el('button', `xp-part${spec.parts[part].stated ? '' : ' ns'}`);
    b.type = 'button';
    b.append(el('span', 'dot'), el('span', 'k', LABELS[part]), el('span', 'v', spec.parts[part].text));
    b.addEventListener('click', () => select(part));
    buttons.set(part, b);
    list.append(b);
  }

  const main = el('div', 'xp-main');
  main.append(stage, note);
  const body = el('div', 'xp-body');
  body.append(main, side);
  overlay.append(head, body);
  document.body.append(overlay);
  document.body.classList.add('xp-open');

  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') shut(); };
  function shut() {
    handle?.dispose();
    overlay.remove();
    document.body.classList.remove('xp-open');
    document.removeEventListener('keydown', onKey);
    closeCurrent = null;
  }
  closeCurrent = shut;
  close.addEventListener('click', shut);
  document.addEventListener('keydown', onKey);
  close.focus();
  select(spec.sample.stated ? 'sample' : 'type');

  try {
    const { mountScene } = await import('./scene/view');
    if (closeCurrent !== shut) return;
    loading.remove();
    handle = mountScene(stage, spec, select);
    handle.highlight(spec.sample.stated ? 'sample' : 'type');
  } catch {
    setText(loading, 'The 3D view could not start in this browser. The values and their sources are listed on the right.');
  }
}
