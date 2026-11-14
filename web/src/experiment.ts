// The "Experiment view": a 3D schematic of one investigation, built only from the row's stated values,
// beside a list of the same values with their NASA source quotes. When NASA's experimental table backs
// some of those values, the view can replay the table test by test.
import type { Row } from '../../src/shared/types';
import type { TestTables } from '../../src/psi/tables';
import { el, setText } from './dom';
import { LABELS } from './labels';
import { buildSceneSpec, PARTS, type PartKey, type SceneSpec } from './scene/spec';
import { buildReplay, rowForStep, type Replay } from './scene/replay';
import type { SceneHandle } from './scene/view';

let closeCurrent: (() => void) | null = null;

async function loadTables(psiId: string): Promise<TestTables | null> {
  for (const url of [`tests/${psiId}.json`, `/api/tests/${psiId}`]) {
    try {
      const res = await fetch(url);
      if (res.ok && (res.headers.get('content-type') ?? '').includes('json')) return (await res.json()) as TestTables;
    } catch {
      /* try the next source */
    }
  }
  return null;
}

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
  const bar = el('div', 'xp-replay');
  bar.hidden = true;
  const note = el('p', 'xp-note', 'Coloured parts come from a stated value; grey parts are Not stated. Not to scale and not a physical simulation: no flame is drawn, because the record gives no flame geometry. Drag to rotate, scroll to zoom, click a part for its source.');

  const side = el('aside', 'xp-side');
  side.append(el('h3', '', 'Every part and its source'));
  const list = el('div', 'xp-list');
  const detail = el('div', 'xp-detail');
  side.append(list, detail);

  let handle: SceneHandle | null = null;
  let replay: Replay | null = null;
  let stepSpecs: SceneSpec[] = [];
  let step = -1;
  let selected: PartKey = spec.sample.stated ? 'sample' : 'type';
  let timer = 0;
  const buttons = new Map<PartKey, { button: HTMLButtonElement; value: HTMLElement }>();
  const shown = () => (step >= 0 ? stepSpecs[step] : spec);

  function select(part: PartKey) {
    selected = part;
    for (const [p, b] of buttons) b.button.classList.toggle('active', p === part);
    handle?.highlight(part);
    const cell = row[part];
    const now = shown().parts[part];
    const column = step >= 0 ? replay?.columns[part] : undefined;
    detail.replaceChildren();
    detail.append(el('h4', '', LABELS[part]));
    if (column && replay) {
      const s = replay.steps[step];
      detail.append(el('p', now.stated ? 'value' : 'value ns', now.text));
      detail.append(el('p', 'hint', `This test, from NASA's experimental table`));
      detail.append(el('blockquote', '', `${replay.file}\nrow ${s.row}, column "${column}": ${s.values[part] || '(blank)'}`));
    } else if (cell.status === 'not stated') {
      detail.append(el('p', 'value ns', 'Not stated'), el('p', 'hint', 'The PSI record gives no sentence or table line that supports a value, so this part stays grey in the schematic.'));
    } else {
      detail.append(el('p', 'value', spec.parts[part].text));
      detail.append(el('p', 'hint', 'Source quote, word for word'));
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
    const value = el('span', 'v', spec.parts[part].text);
    b.append(el('span', 'dot'), el('span', 'k', LABELS[part]), value);
    b.addEventListener('click', () => select(part));
    buttons.set(part, { button: b, value });
    list.append(b);
  }

  // Replay controls: step through the rows of NASA's experimental table, one test at a time.
  const play = el('button', 'primary', 'Replay the tests');
  const prev = el('button', '', 'Previous');
  const next = el('button', '', 'Next');
  const overview = el('button', '', 'Overview');
  const slider = el('input');
  slider.type = 'range';
  slider.min = '0';
  slider.setAttribute('aria-label', 'Test');
  const status = el('span', 'xp-replay-status');
  status.setAttribute('role', 'status');
  bar.append(play, prev, slider, next, overview, status);

  function stop() {
    window.clearInterval(timer);
    timer = 0;
    setText(play, step >= 0 ? 'Play' : 'Replay the tests');
  }
  function show(i: number) {
    if (!replay) return;
    step = i;
    const cur = shown();
    handle?.replay(i >= 0 ? cur : null, maxSize);
    for (const part of Object.keys(replay.columns) as PartKey[]) {
      const b = buttons.get(part)!;
      setText(b.value, cur.parts[part].text);
      b.button.classList.toggle('ns', !cur.parts[part].stated);
    }
    slider.value = String(Math.max(i, 0));
    prev.disabled = i <= 0;
    next.disabled = i >= replay.steps.length - 1;
    overview.disabled = i < 0;
    setText(status, i >= 0
      ? `${replay.steps[i].label} · test ${i + 1} of ${replay.steps.length} · ${replay.file}`
      : `${replay.steps.length} tests in ${replay.file}. Replays the stated conditions of each test, not the flame.`);
    if (!timer) setText(play, i >= 0 ? 'Play' : 'Replay the tests');
    select(selected);
  }
  let maxSize = 0;
  play.addEventListener('click', () => {
    if (!replay) return;
    if (timer) { stop(); return; }
    if (step >= replay.steps.length - 1) show(-1);
    show(step + 1);
    setText(play, 'Pause');
    timer = window.setInterval(() => {
      if (!replay || step >= replay.steps.length - 1) { stop(); return; }
      show(step + 1);
    }, 1100);
  });
  prev.addEventListener('click', () => { stop(); show(Math.max(step - 1, 0)); });
  next.addEventListener('click', () => { stop(); show(step + 1); });
  overview.addEventListener('click', () => { stop(); show(-1); });
  slider.addEventListener('input', () => { stop(); show(Number(slider.value)); });

  const main = el('div', 'xp-main');
  main.append(stage, bar, note);
  const body = el('div', 'xp-body');
  body.append(main, side);
  overlay.append(head, body);
  document.body.append(overlay);
  document.body.classList.add('xp-open');

  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') shut(); };
  function shut() {
    window.clearInterval(timer);
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
  select(selected);

  // The replay needs only the tables, so it is prepared even if the 3D view cannot start.
  void loadTables(spec.psiId).then((tables) => {
    if (closeCurrent !== shut || !tables) return;
    replay = buildReplay(row, tables);
    if (!replay) return;
    stepSpecs = replay.steps.map((s) => buildSceneSpec(rowForStep(row, replay!, s)));
    maxSize = Math.max(0, ...stepSpecs.flatMap((s) => s.sample.sizes));
    slider.max = String(replay.steps.length - 1);
    bar.hidden = false;
    show(-1);
  });

  try {
    const { mountScene } = await import('./scene/view');
    if (closeCurrent !== shut) return;
    loading.remove();
    handle = mountScene(stage, spec, select);
    handle.highlight(selected);
    if (step >= 0) handle.replay(shown(), maxSize);
  } catch {
    setText(loading, 'The 3D view could not start in this browser. The values and their sources are listed on the right.');
  }
}
