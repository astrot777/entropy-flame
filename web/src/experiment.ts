// The "Experiment view": a 3D schematic of one investigation, built only from the row's stated values,
// beside a list of the same values with their NASA source quotes. When NASA's experimental table backs
// some of those values, the view can replay the table test by test.
import type { Row } from '../../src/shared/types';
import type { TestTables } from '../../src/psi/tables';
import { el, setText } from './dom';
import { LABELS } from './labels';
import { buildSceneSpec, PARTS, type PartKey, type SceneSpec } from './scene/spec';
import { buildReplay, rowForStep, type Replay } from './scene/replay';
import { momentAt, type Moment, type TestTime } from './scene/timeline';
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
  const note = el('p', 'xp-note', 'Solid parts come from a stated value; grey wireframe parts are Not stated. Not to scale and not a physical simulation. Surface textures are illustrative; a glow marks when a test was burning, not the shape of the flame. Drag to rotate, scroll to zoom, click a part for its source.');

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

  // Playback. Each test plays in about two and a half seconds whatever its real length; the caption shows
  // the real seconds NASA recorded. Start, end and duration are NASA's; values in between move in a straight line.
  const PLAY_MS = 2600;
  const HOLD_MS = 650;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let playing = false;
  let raf = 0;
  let maxSize = 0;
  let maxFrom = 0;
  const fmt = (v: number, like: number[]) => v.toFixed(Math.min(3, Math.max(...like.map((n) => (String(n).split('.')[1] ?? '').length))));
  const secs = (v: number) => (v >= 10 ? v.toFixed(0) : v.toFixed(1));

  function halt() {
    window.clearTimeout(timer);
    cancelAnimationFrame(raf);
    timer = 0;
    raf = 0;
  }
  function stop() {
    playing = false;
    halt();
    setText(play, step >= 0 ? 'Play' : 'Replay the tests');
  }
  function caption(m: Moment, t: TestTime): string {
    if (m.phase === 'igniting') return `Igniting · ${secs(m.seconds)} s of ${secs(m.total)} s`;
    if (m.phase === 'burning') return `Burning · ${secs(m.seconds)} s of ${secs(m.total)} s`;
    if (m.phase === 'running') return 'During the test';
    if (t.burnS) return `Flame out at ${secs(m.total)} s${t.ending ? ` · ${t.ending}` : ''}`;
    return t.ignitionS !== null ? 'Igniter off · no burn time recorded' : 'After the test';
  }
  function apply(m: Moment, t: TestTime) {
    const state = caption(m, t);
    handle?.moment({
      glow: m.phase === 'burning' ? 1 : m.phase === 'igniting' ? 0.4 : 0,
      scale: m.size !== undefined && maxFrom ? Math.min(1, Math.max(0.12, m.size / maxFrom)) : undefined,
      burned: m.burned,
      state,
    });
    if (m.size !== undefined && t.size) {
      const text = `${fmt(m.size, [t.size.from, t.size.to])} ${t.size.unit}`.trim();
      handle?.setLabel('sample', text);
      setText(buttons.get('sample')!.value, text);
    }
    if (m.oxygen !== undefined && t.oxygen) {
      const text = fmt(m.oxygen, [t.oxygen.from, t.oxygen.to]);
      handle?.setLabel('oxygen', text);
      setText(buttons.get('oxygen')!.value, text);
    }
    if (replay) setText(status, `${replay.steps[step].label} · ${state} · test ${step + 1} of ${replay.steps.length} · ${replay.file}`);
  }
  function show(i: number) {
    if (!replay) return;
    step = i;
    const cur = shown();
    handle?.replay(i >= 0 ? cur : null, maxSize);
    handle?.moment(null);
    for (const part of ['fuel', 'sample', 'oxygen', 'pressure', 'airflow'] as PartKey[]) {
      const b = buttons.get(part)!;
      setText(b.value, cur.parts[part].text);
      b.button.classList.toggle('ns', !cur.parts[part].stated);
    }
    slider.value = String(Math.max(i, 0));
    if (!playing) setText(play, i >= 0 ? 'Play' : 'Replay the tests');
    prev.disabled = i <= 0;
    next.disabled = i >= replay.steps.length - 1;
    overview.disabled = i < 0;
    setText(status, i >= 0
      ? `${replay.steps[i].label} · test ${i + 1} of ${replay.steps.length} · ${replay.file}`
      : `${replay.steps.length} tests in ${replay.file}. Start, end and duration come from NASA's table; values in between move in a straight line. The glow marks the stated burn time, not the flame's shape.`);
    select(selected);
  }
  /** Shows one test and plays what happened during it, then calls done. */
  function run(i: number, done?: () => void) {
    halt();
    show(i);
    const t = replay?.steps[i]?.time ?? null;
    const finish = () => { timer = window.setTimeout(() => done?.(), HOLD_MS); };
    if (!t) { finish(); return; }
    if (reduceMotion) { apply(momentAt(t, 1), t); finish(); return; }
    const start = performance.now();
    const frame = (now: number) => {
      const f = Math.min(1, (now - start) / PLAY_MS);
      apply(momentAt(t, f), t);
      if (f < 1) raf = requestAnimationFrame(frame);
      else finish();
    };
    apply(momentAt(t, 0), t);
    raf = requestAnimationFrame(frame);
  }
  function playFrom(i: number) {
    if (!replay) return;
    if (i >= replay.steps.length) { stop(); return; }
    run(i, () => { if (playing) playFrom(i + 1); });
  }
  play.addEventListener('click', () => {
    if (!replay) return;
    if (playing) { stop(); return; }
    playing = true;
    setText(play, 'Pause');
    playFrom(step >= replay.steps.length - 1 ? 0 : step + 1);
  });
  prev.addEventListener('click', () => { stop(); run(Math.max(step - 1, 0)); });
  next.addEventListener('click', () => { stop(); run(step + 1); });
  overview.addEventListener('click', () => { stop(); show(-1); });
  slider.addEventListener('input', () => { stop(); run(Number(slider.value)); });

  const main = el('div', 'xp-main');
  main.append(stage, bar, note);
  const body = el('div', 'xp-body');
  body.append(main, side);
  overlay.append(head, body);
  document.body.append(overlay);
  document.body.classList.add('xp-open');

  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') shut(); };
  function shut() {
    halt();
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
    maxFrom = Math.max(0, ...replay.steps.map((s) => s.time?.size?.from ?? 0));
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
