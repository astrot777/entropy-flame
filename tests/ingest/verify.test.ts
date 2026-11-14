import { describe, it, expect } from 'vitest';
import { verifyField, verifyRow } from '../../src/ingest/verify';
import type { PsiDocument } from '../../src/psi/fetch';

const doc: PsiDocument = {
  psiId: 'PSI-159',
  url: 'https://psi.nasa.gov/physci/repo/data/investigations/PSI-159',
  text: 'Perform spherical diffusion flame tests aboard the International Space Station.\nOxygen-nitrogen mixture of up to 85% oxygen flowed from the spherical burner.',
  fetchedAt: '2026-11-14T00:00:00.000Z',
};

describe('verifyField', () => {
  it('accepts a real quote despite spacing, line breaks and curly quotes', () =>
    expect(verifyField({ field: 'hardware', value: 'International Space Station',
      quote: 'aboard the  International\nSpace Station' }, doc).status).toBe('stated'));
  it('rejects an invented quote', () => {
    const c = verifyField({ field: 'oxygen', value: '99%', quote: 'oxygen up to 99%' }, doc);
    expect(c).toMatchObject({ value: null, quote: null, status: 'not stated' });
  });
  it('rejects a value that is not inside its quote', () =>
    expect(verifyField({ field: 'oxygen', value: '99%', quote: 'mixture of up to 85% oxygen' }, doc).status).toBe('not stated'));
  it('lets objectives differ from its quote', () =>
    expect(verifyField({ field: 'objectives', value: 'Test spherical flames on the ISS.',
      quote: 'Perform spherical diffusion flame tests aboard the International Space Station.' }, doc).status).toBe('stated'));
  it('rejects a pillar outside the three', () =>
    expect(verifyField({ field: 'pillar', value: 'Combustion', quote: 'spherical diffusion flame tests' }, doc).status).toBe('not stated'));
  it('accepts a pillar from the three with a real quote, in canonical case', () =>
    expect(verifyField({ field: 'pillar', value: 'prevention', quote: 'spherical diffusion flame tests' }, doc))
      .toMatchObject({ value: 'Prevention', status: 'stated' }));
  it('rejects an empty or trivially short quote', () => {
    expect(verifyField({ field: 'fuel', value: 'a', quote: 'a' }, doc).status).toBe('not stated');
    expect(verifyField({ field: 'fuel', value: '', quote: '' }, doc).status).toBe('not stated');
  });
  it('keeps the source quote text as given', () =>
    expect(verifyField({ field: 'oxygen', value: '85%', quote: 'up to 85% oxygen' }, doc))
      .toMatchObject({ value: '85%', quote: 'up to 85% oxygen', source: doc.url, status: 'stated' }));
});

describe('verifyRow', () => {
  it('fills all 12 cells and sets psiId', () => {
    const row = verifyRow([], doc);
    expect(Object.keys(row)).toHaveLength(12);
    expect(row.psiId.value).toBe('PSI-159');
    expect(row.fuel.status).toBe('not stated');
  });
  it('ignores a model-supplied psiId', () =>
    expect(verifyRow([{ field: 'psiId', value: 'PSI-1', quote: 'aboard' }], doc).psiId.value).toBe('PSI-159'));
});
