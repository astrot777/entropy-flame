import { describe, it, expect, vi } from 'vitest';
import { ingestStream, ingestOne, runBatch, type Deps, type IngestEvent } from '../../src/ingest/ingest';
import { PsiError, type PsiDocument } from '../../src/psi/fetch';
import type { Llm } from '../../src/ingest/llm';

const docFor = (id: string): PsiDocument => ({
  psiId: id, url: `https://psi.nasa.gov/physci/repo/data/investigations/${id}`,
  text: 'Flames of propane burned in 21% oxygen aboard the ISS.', fetchedAt: '2026-11-14T00:00:00Z',
});
const llmOf = (lines: string[]): Llm => ({ async *stream() { yield lines.join('\n') + '\n'; } });
const goodLlm = llmOf(['{"field":"fuel","value":"propane","quote":"Flames of propane burned"}', '{"field":"oxygen","value":"21%","quote":"in 21% oxygen"}']);
function deps(llm: Llm = goodLlm, fail?: string): Deps {
  return {
    fetchDoc: vi.fn(async (id: string) => { if (id === fail) throw new PsiError('not_found', 'x'); return docFor(id); }),
    llm,
  };
}
async function collect(g: AsyncGenerator<IngestEvent>) { const out: IngestEvent[] = []; for await (const e of g) out.push(e); return out; }

describe('ingestStream', () => {
  it('emits one verified field event per model field, then done with 12 cells', async () => {
    const evs = await collect(ingestStream('psi-159', deps()));
    expect(evs.filter(e => e.type === 'field')).toHaveLength(2);
    expect(evs.at(-1)).toMatchObject({ type: 'done' });
    const row = (evs.at(-1) as Extract<IngestEvent, { type: 'done' }>).row;
    expect(Object.keys(row)).toHaveLength(12);
    expect(row.fuel).toMatchObject({ value: 'propane', status: 'stated' });
    expect(row.psiId.value).toBe('PSI-159');
  });
  it('turns a fabricated quote into a Not stated cell', async () => {
    const evs = await collect(ingestStream('PSI-159', deps(llmOf(['{"field":"fuel","value":"kerosene","quote":"burned kerosene"}']))));
    expect(evs.find(e => e.type === 'field')).toMatchObject({ field: 'fuel', cell: { value: null, status: 'not stated' } });
  });
  it('uses the first answer when the model repeats a field', async () => {
    const llm = llmOf(['{"field":"fuel","value":"propane","quote":"Flames of propane burned"}', '{"field":"fuel","value":"kerosene","quote":"x kerosene"}']);
    const row = await ingestOne('PSI-159', deps(llm));
    expect(row.fuel.value).toBe('propane');
  });
});

describe('record fields', () => {
  it('fills name and type from the record when the model leaves them empty', async () => {
    const d: Deps = {
      fetchDoc: async (id) => ({ ...docFor(id), text: 'Title: Structure and Liftoff\n\nAcronym: SLICE\n\nProject type: Microgravity Investigation' }),
      llm: llmOf(['{"field":"name","value":null,"quote":null}']),
    };
    const row = await ingestOne('PSI-106', d);
    expect(row.name).toMatchObject({ value: 'SLICE', quote: 'Acronym: SLICE', status: 'stated' });
    expect(row.type).toMatchObject({ value: 'Microgravity Investigation', status: 'stated' });
  });
});

describe('ingestOne', () => {
  it('rejects a bad id before fetching', async () => {
    const d = deps();
    await expect(ingestOne('x', d)).rejects.toMatchObject({ code: 'bad_id' });
    expect(d.fetchDoc).not.toHaveBeenCalled();
  });
});

describe('runBatch', () => {
  it('keeps going after one failure and records it', async () => {
    const r = await runBatch(['PSI-1', 'PSI-2'], deps(goodLlm, 'PSI-2'));
    expect(r.rows).toHaveLength(1); expect(r.errors).toEqual([{ id: 'PSI-2', code: 'not_found' }]);
  });
  it('records a non-PSI error as upstream without throwing', async () => {
    const llm: Llm = { async *stream() { throw new Error('model down'); } };
    const r = await runBatch(['PSI-1'], deps(llm));
    expect(r.errors).toEqual([{ id: 'PSI-1', code: 'upstream' }]);
  });
});
