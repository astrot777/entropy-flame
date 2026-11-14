import { describe, it, expect } from 'vitest';
import { accuracy } from '../../scripts/accuracy';

const marks = (id: string, wrong: string[], fields: string[]) => ({ id, cells: Object.fromEntries(fields.map((f) => [f, !wrong.includes(f)])) });
const F = ['name', 'type', 'objectives', 'pillar', 'fuel', 'sample', 'oxygen', 'pressure', 'airflow', 'hardware', 'sensors', 'psiId'];

describe('accuracy', () => {
  it('counts correct cells over all reviewed cells', () =>
    expect(accuracy([marks('PSI-1', ['oxygen'], F), marks('PSI-2', [], F)])).toEqual({ correct: 23, total: 24 }));
  it('is zero over zero for no reviews', () => expect(accuracy([])).toEqual({ correct: 0, total: 0 }));
  it('counts only the cells that were marked', () =>
    expect(accuracy([marks('PSI-3', ['fuel'], ['fuel', 'oxygen'])])).toEqual({ correct: 1, total: 2 }));
});
