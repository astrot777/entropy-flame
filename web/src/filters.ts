// Written with an LLM coding assistant (SI); reviewed by the team.
import type { Row } from '../../src/shared/types';

export interface Filters { pillar?: string; fuel?: string; hardware?: string; oxygenMin?: number; oxygenMax?: number; text?: string }

const has = (v: string | null, q: string) => v !== null && v.toLowerCase().includes(q.toLowerCase());

function numbers(v: string | null): number[] {
  return v ? (v.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number) : [];
}

export function applyFilters(rows: Row[], f: Filters): Row[] {
  return rows.filter((r) => {
    if (f.pillar && r.pillar.value !== f.pillar) return false;
    if (f.fuel && !has(r.fuel.value, f.fuel)) return false;
    if (f.hardware && !has(r.hardware.value, f.hardware)) return false;
    if (f.oxygenMin !== undefined || f.oxygenMax !== undefined) {
      const n = numbers(r.oxygen.value);
      if (!n.length) return false;
      if (f.oxygenMin !== undefined && Math.max(...n) < f.oxygenMin) return false;
      if (f.oxygenMax !== undefined && Math.min(...n) > f.oxygenMax) return false;
    }
    if (f.text) {
      const q = f.text.trim().toLowerCase();
      if (q && !Object.values(r).some((c) => typeof c === 'object' && c !== null && 'value' in c && has(c.value, q))) return false;
    }
    return true;
  });
}
