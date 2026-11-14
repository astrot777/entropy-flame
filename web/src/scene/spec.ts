// Turns one verified row into the description of a 3D schematic. Pure and testable: no drawing here.
// Rule: every part comes from a stated cell. A cell that is "Not stated" becomes a grey placeholder, never a guess.
import type { Cell, Row } from '../../../src/shared/types';
import { unitFromQuote } from '../units';

export const PARTS = ['type', 'fuel', 'sample', 'oxygen', 'pressure', 'airflow', 'hardware', 'sensors'] as const;
export type PartKey = typeof PARTS[number];
export type Shape = 'sphere' | 'sheet' | 'rod' | 'burner' | 'particles' | 'generic';

export interface SceneSpec {
  psiId: string;
  name: string;
  gravity: 'micro' | 'ground' | null;
  /** sizes are in metres and used for proportions only; labels keep NASA's own text and units. */
  sample: { stated: boolean; shape: Shape; sizes: number[] };
  /** min and max are in cm/s and drive the animation speed only. */
  airflow: { stated: boolean; quiescent: boolean; min: number | null; max: number | null };
  sensors: string[];
  parts: Record<PartKey, { stated: boolean; text: string }>;
}

const SHAPES: [Shape, RegExp][] = [
  ['particles', /dust|powder|aerosol/i],
  ['sphere', /spher|droplet/i],
  ['sheet', /sheet|fabric|film|slab|\bwide\b|thick|\d\s*(?:mm|cm|m)\s*x\s*\d/i],
  ['rod', /\brods?\b|cylind/i],
  ['burner', /burner|\btubes?\b|\bjet\b/i],
];
const LENGTH_UNIT = String.raw`(micron|µm|mm|cm|meters?|m)\b`;
const TO_METRES: Record<string, number> = { micron: 1e-6, 'µm': 1e-6, mm: 1e-3, cm: 1e-2, m: 1, meter: 1, meters: 1 };
const SPEED_TO_CM_S: Record<string, number> = { 'mm/s': 0.1, 'cm/s': 1, 'm/s': 100 };
const SENSOR = /photomultiplier tubes?|thermocouples?|radiometers?|cameras?|anemometers?|solid state sensors?|thin-filament pyrometry|thermopile detectors?|heat flux sensors?|thermophoretic soot samplers?|spectrally resolved images/gi;
const WITH_UNIT: PartKey[] = ['sample', 'oxygen', 'pressure', 'airflow'];

const stated = (c: Cell): c is Cell & { value: string } => c.status !== 'not stated' && c.value !== null;
const columnName = (c: Cell) => /^Column "([^"]+)"/.exec(c.quote ?? '')?.[1] ?? '';
const numbersIn = (s: string) => [...s.matchAll(/\d*\.?\d+/g)].map((m) => ({ n: Number(m[0]), end: m.index! + m[0].length }));

function shapeOf(c: Cell & { value: string }): Shape {
  const text = `${c.value} ${columnName(c)}`;
  let best: { shape: Shape; at: number } | null = null;
  for (const [shape, re] of SHAPES) {
    const at = text.search(re);
    if (at >= 0 && (!best || at < best.at)) best = { shape, at };
  }
  return best?.shape ?? 'generic';
}

function sizesOf(c: Cell & { value: string }): number[] {
  const own = new RegExp(String.raw`^\s*${LENGTH_UNIT}`, 'i');
  const shared = new RegExp(String.raw`^\s*(?:and|or|to|,|-|–|x)\s*\d*\.?\d+\s*${LENGTH_UNIT}`, 'i');
  const out: number[] = [];
  for (const { n, end } of numbersIn(c.value)) {
    const rest = c.value.slice(end);
    const unit = (own.exec(rest) ?? shared.exec(rest))?.[1]?.toLowerCase();
    if (unit) out.push(n * TO_METRES[unit]);
  }
  if (out.length) return out;
  const colUnit = unitFromQuote(c.value, c.quote ?? '')?.toLowerCase();
  return colUnit && TO_METRES[colUnit] ? numbersIn(c.value).map(({ n }) => n * TO_METRES[colUnit]) : [];
}

function airflowOf(c: Cell): SceneSpec['airflow'] {
  if (!stated(c)) return { stated: false, quiescent: false, min: null, max: null };
  if (/quiescent|no flow|still air/i.test(c.value)) return { stated: true, quiescent: true, min: null, max: null };
  const unit = (/(mm|cm|m)\s*\/\s*s/i.exec(c.value)?.[0] ?? unitFromQuote(c.value, c.quote ?? '') ?? 'cm/s').replace(/\s/g, '').toLowerCase();
  const speeds = numbersIn(c.value).map(({ n }) => n * (SPEED_TO_CM_S[unit] ?? 1));
  if (!speeds.length) return { stated: true, quiescent: false, min: null, max: null };
  return { stated: true, quiescent: false, min: Math.min(...speeds), max: Math.max(...speeds) };
}

function sensorsOf(c: Cell): string[] {
  if (!stated(c)) return [];
  const found = [...new Set([...c.value.matchAll(SENSOR)].map((m) => m[0]))];
  return found.length ? found.slice(0, 5) : [c.value];
}

export function buildSceneSpec(row: Row): SceneSpec {
  const parts = {} as SceneSpec['parts'];
  for (const p of PARTS) {
    const c = row[p];
    if (!stated(c)) { parts[p] = { stated: false, text: 'Not stated' }; continue; }
    const unit = WITH_UNIT.includes(p) ? unitFromQuote(c.value, c.quote ?? '') : null;
    parts[p] = { stated: true, text: unit ? `${c.value} ${unit}` : c.value };
  }
  const type = row.type.value ?? '';
  return {
    psiId: row.psiId.value ?? '',
    name: row.name.value ?? '',
    gravity: /microgravity/i.test(type) ? 'micro' : /ground/i.test(type) ? 'ground' : null,
    sample: stated(row.sample)
      ? { stated: true, shape: shapeOf(row.sample), sizes: sizesOf(row.sample) }
      : { stated: false, shape: 'generic', sizes: [] },
    airflow: airflowOf(row.airflow),
    sensors: sensorsOf(row.sensors),
    parts,
  };
}
