// The markers of the space map: one per investigation, built only from the catalogue row.
// The data has no geographic coordinates, so position never stands for a place. Each marker sits in the
// group of the hardware its record states (words taken from the stated value); a record that states no
// hardware goes to a group labelled "Not stated". Where a group sits on the ring carries no meaning.
import { FIELDS, type FieldKey, type Row } from '../../../src/shared/types';
import { LABELS } from '../labels';
import { cellText } from '../source';

export interface MapField { key: FieldKey; name: string; value: string; stated: boolean }
export interface MapMarker {
  id: string; psiId: string; label: string; fuel: string;
  /** The stated hardware group, and whether the record states one. */
  group: string; groupStated: boolean;
  /** Place on the layout ring, in radians. A layout, not a location. */
  angle: number;
  radiusFromEarth: number; kind: 'earth' | 'moon';
  unreviewed: boolean; stated: number; notStated: number;
  sets: string[]; fields: MapField[];
}

// Facilities several records name. Each label is a phrase found inside the stated hardware value.
const SHARED = ['Combustion Integrated Rack', 'Microgravity Science Glovebox', 'Cygnus'];

export function platformOf(row: Row): { label: string; stated: boolean } {
  const c = row.hardware;
  if (c.status !== 'stated' || !c.value) return { label: 'Not stated', stated: false };
  const shared = SHARED.find((s) => c.value!.toLowerCase().includes(s.toLowerCase()));
  return { label: shared ?? c.value, stated: true };
}

export function tabsOf(markers: MapMarker[]): string[] {
  const pillars = [...new Set(markers.flatMap((m) => m.sets.slice(1)))];
  const order = ['Prevention', 'Detection', 'Suppression', 'Pillar not stated'];
  return ['All', ...order.filter((p) => pillars.includes(p))];
}

export function buildMarkers(rows: Row[]): MapMarker[] {
  const groups: string[] = [];
  const platform = rows.map((r) => platformOf(r));
  for (const p of platform) if (!groups.includes(p.label)) groups.push(p.label);
  // One slot per marker and one empty slot after each group, so groups read as separate clusters.
  const slots = rows.length + groups.length;
  const slotOf = new Map<Row, number>();
  let slot = 0;
  for (const g of groups) {
    rows.forEach((r, i) => { if (platform[i].label === g) slotOf.set(r, slot++); });
    slot++;
  }
  return rows.map((r, i) => {
    const fields: MapField[] = FIELDS.map((key) => ({ key, name: LABELS[key], value: cellText(key, r[key]), stated: r[key].status === 'stated' }));
    const stated = fields.filter((f) => f.stated).length;
    const pillar = r.pillar.status === 'stated' && r.pillar.value ? r.pillar.value : 'Pillar not stated';
    return {
      id: `inv-${r.psiId.value}`,
      psiId: r.psiId.value ?? '',
      label: `${r.psiId.value} ${r.name.value ?? ''}`.trim(),
      fuel: cellText('fuel', r.fuel),
      group: platform[i].label,
      groupStated: platform[i].stated,
      angle: ((slotOf.get(r)! + 0.5) / slots) * Math.PI * 2,
      radiusFromEarth: 26,
      kind: 'earth' as const,
      unreviewed: !!r.unreviewed,
      stated,
      notStated: fields.length - stated,
      sets: ['All', pillar],
      fields,
    };
  });
}
