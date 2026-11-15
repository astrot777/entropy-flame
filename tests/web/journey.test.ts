import { describe, it, expect } from 'vitest';
import { MILESTONES } from '../../web/src/journey';

describe('MILESTONES: the timeline beside the Apollo 11 liftoff', () => {
  it('runs in date order and ends with what comes next', () => {
    const years = MILESTONES.slice(0, -1).map((m) => Number(m.year));
    expect(years).toEqual([...years].sort((a, b) => a - b));
    expect(MILESTONES[MILESTONES.length - 1]).toMatchObject({ year: 'Next', name: 'Mars' });
  });
  it('marks the two fire milestones, and ties Saffire-I to its catalogue entry', () => {
    expect(MILESTONES.filter((m) => m.fire).map((m) => m.name)).toEqual(['Apollo 1', 'Saffire-I']);
    expect(MILESTONES.find((m) => m.name === 'Saffire-I')!.text).toContain('PSI-98');
  });
  it('keeps every line short enough to read while it plays', () => {
    for (const m of MILESTONES) expect(m.text.length).toBeLessThanOrEqual(130);
  });
});
