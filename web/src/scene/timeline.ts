// What happens during one test, read from the time columns of NASA's experimental table: ignition time,
// burn time, the sample size at the start and at flame extinction, oxygen before and after, burned length.
// NASA gives the start, the end and the duration, not the curve between them, so values in between move
// in a straight line. Pure and testable: no drawing here.

export interface TimeColumns {
  burn?: number; ignition?: number; sizeFrom?: number; sizeTo?: number;
  o2From?: number; o2To?: number; sampleLength?: number; burnLength?: number; ending?: number;
}
export interface TestTime {
  ignitionS: number | null;
  burnS: number | null;
  size?: { from: number; to: number; unit: string };
  oxygen?: { from: number; to: number };
  /** Share of the sample length that burned, 0 to 1. */
  burnedFraction?: number;
  ending?: string;
}
export interface Moment {
  phase: 'igniting' | 'burning' | 'running' | 'out';
  /** Seconds of the real test, and its real total (0 when NASA gives no times). */
  seconds: number;
  total: number;
  size?: number;
  oxygen?: number;
  burned?: number;
}

const find = (columns: string[], re: RegExp, not?: RegExp) => {
  const i = columns.findIndex((c) => re.test(c.trim()) && !(not && not.test(c.trim())));
  return i >= 0 ? i : undefined;
};

export function timeColumns(columns: string[]): TimeColumns {
  return {
    burn: find(columns, /burn\s*time/i),
    ignition: find(columns, /ignition\s*time/i),
    sizeFrom: find(columns, /initial.*diameter|diameter.*initial/i),
    sizeTo: find(columns, /extinction diameter/i),
    o2From: find(columns, /initial\s+O2|O2\s+before/i),
    o2To: find(columns, /final\s+O2|O2\s+after/i),
    sampleLength: find(columns, /^sample length/i),
    burnLength: find(columns, /burn length/i, /^1-g/i),
    ending: find(columns, /^test end/i),
  };
}

const num = (cell: string | undefined): number | null => {
  const m = /\d*\.?\d+/.exec(cell ?? '');
  return m ? Number(m[0]) : null;
};
const unitIn = (cell: string | undefined) => /\d\s*([a-zµ/%]+)/i.exec(cell ?? '')?.[1]?.toLowerCase() ?? '';
const unitOfColumn = (name: string) => (/\(([^()]+)\)\s*$/.exec(name)?.[1] ?? /;\s*([^;]+)$/.exec(name)?.[1] ?? '').trim();

export function testTime(columns: string[], cells: string[]): TestTime | null {
  const c = timeColumns(columns);
  const at = (i: number | undefined) => (i === undefined ? undefined : cells[i]);
  const t: TestTime = { ignitionS: num(at(c.ignition)), burnS: num(at(c.burn)) };

  const from = num(at(c.sizeFrom));
  const to = num(at(c.sizeTo));
  if (from !== null && to !== null) t.size = { from, to, unit: unitOfColumn(columns[c.sizeFrom!]) || unitIn(at(c.sizeFrom)) };

  const o1 = num(at(c.o2From));
  const o2 = num(at(c.o2To));
  if (o1 !== null && o2 !== null) t.oxygen = { from: o1, to: o2 };

  const len = num(at(c.sampleLength));
  const burned = num(at(c.burnLength));
  const sameUnit = !unitIn(at(c.sampleLength)) || !unitIn(at(c.burnLength)) || unitIn(at(c.sampleLength)) === unitIn(at(c.burnLength));
  // A cell that lists two samples ("5 and 24 cm") cannot be turned into one share, so no burn front is drawn.
  const one = (cell: string | undefined) => ((cell ?? '').replace(/\([^)]*\)/g, '').match(/\d*\.?\d+/g) ?? []).length === 1;
  if (len !== null && len > 0 && burned !== null && sameUnit && one(at(c.sampleLength)) && one(at(c.burnLength))) t.burnedFraction = Math.min(1, Math.max(0, burned / len));

  const ending = at(c.ending)?.trim();
  if (ending) t.ending = ending;

  const empty = t.ignitionS === null && t.burnS === null && !t.size && !t.oxygen && t.burnedFraction === undefined;
  return empty ? null : t;
}

/** The state of a test at a fraction (0 to 1) of its playback. */
export function momentAt(t: TestTime, fraction: number): Moment {
  const f = Math.min(1, Math.max(0, fraction));
  const ignition = t.ignitionS ?? 0;
  const burn = t.burnS ?? 0;
  const total = ignition + burn;
  const seconds = f * total;
  let phase: Moment['phase'];
  let progress: number;
  if (total === 0) {
    phase = f >= 1 ? 'out' : 'running';
    progress = f;
  } else if (f >= 1) {
    phase = 'out';
    progress = 1;
  } else if (seconds < ignition) {
    phase = 'igniting';
    progress = 0;
  } else {
    phase = 'burning';
    progress = burn > 0 ? (seconds - ignition) / burn : 1;
  }
  if (total === 0 && !t.oxygen && !t.size && f < 1) phase = 'running';
  const m: Moment = { phase, seconds, total };
  if (t.size) m.size = t.size.from + (t.size.to - t.size.from) * progress;
  if (t.oxygen) m.oxygen = t.oxygen.from + (t.oxygen.to - t.oxygen.from) * progress;
  if (t.burnedFraction !== undefined) m.burned = t.burnedFraction * progress;
  return m;
}
