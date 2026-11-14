// "Replay the tests": NASA's experimental table has one row per test. For every part of the schematic whose value
// was quoted from a table column, the replay steps through that column row by row. It replays the stated
// conditions of each test, not the motion of the flame.
import type { Row } from '../../../src/shared/types';
import type { TestTables } from '../../../src/psi/tables';
import { PARTS, type PartKey } from './spec';
import { testTime, type TestTime } from './timeline';

/** values holds the raw table cell for each mapped part; an empty string means the row leaves it blank. */
export interface ReplayStep { label: string; row: number; values: Partial<Record<PartKey, string>>; time: TestTime | null }
export interface Replay { file: string; columns: Partial<Record<PartKey, string>>; steps: ReplayStep[] }

const TABLE_QUOTE = /^Column "(.+?)" \((.+?\.csv)\):/i;

export function buildReplay(row: Row, tables: TestTables): Replay | null {
  const byFile = new Map<string, Partial<Record<PartKey, string>>>();
  for (const part of PARTS) {
    const cell = row[part];
    const m = cell.status === 'not stated' ? null : TABLE_QUOTE.exec(cell.quote ?? '');
    if (m) byFile.set(m[2], { ...byFile.get(m[2]), [part]: m[1] });
  }
  const ranked = [...byFile.entries()].sort((a, b) => Object.keys(b[1]).length - Object.keys(a[1]).length);
  // Tables no cell was quoted from can still be replayed when they say what happened during each test.
  for (const t of tables.tables) if (!byFile.has(t.file)) ranked.push([t.file, {}]);
  for (const [file, wanted] of ranked) {
    const table = tables.tables.find((t) => t.file === file);
    if (!table) continue;
    const index: [PartKey, number][] = [];
    const columns: Partial<Record<PartKey, string>> = {};
    for (const [part, name] of Object.entries(wanted) as [PartKey, string][]) {
      const i = table.columns.indexOf(name);
      if (i >= 0) { index.push([part, i]); columns[part] = name; }
    }
    const labelFromFirst = !index.some(([, i]) => i === 0);
    const steps: ReplayStep[] = [];
    table.rows.forEach((cells, r) => {
      const values: Partial<Record<PartKey, string>> = {};
      for (const [part, i] of index) values[part] = cells[i] ?? '';
      const time = testTime(table.columns, cells);
      if (!time && !Object.values(values).some(Boolean)) return;
      const first = cells[0] ?? '';
      const named = labelFromFirst && /test|run|#|id|no/i.test(table.columns[0]) && first && first.length <= 28;
      const label = named ? `${table.columns[0]} ${first}` : `Row ${r + 1}`;
      steps.push({ label, row: r + 1, values, time });
    });
    if (steps.length && (index.length || steps.some((st) => st.time))) return { file, columns, steps };
  }
  return null;
}

/** The row as it reads for one test: mapped parts take that test's table cell, or become Not stated when it is blank. */
export function rowForStep(row: Row, replay: Replay, step: ReplayStep): Row {
  const out = { ...row };
  for (const [part, column] of Object.entries(replay.columns) as [PartKey, string][]) {
    const text = step.values[part] ?? '';
    out[part] = text
      ? { value: text, quote: `Column "${column}" (${replay.file}): ${text}`, source: row[part].source, status: 'stated' }
      : { value: null, quote: null, source: row[part].source, status: 'not stated' };
  }
  return out;
}

/**
 * The tests one press of Replay plays: at most max, spread evenly over the table, so a table of hundreds of
 * tests still plays in seconds. Tests that say what happened over time come first; every test stays reachable
 * with Next and the slider.
 */
export function pickTests(steps: { time: unknown }[], max: number): number[] {
  const all = steps.map((_, i) => i);
  const timed = all.filter((i) => steps[i].time);
  const pool = timed.length ? timed : all;
  if (pool.length <= max) return pool;
  return Array.from({ length: max }, (_, j) => pool[Math.round((j * (pool.length - 1)) / (max - 1))]);
}
