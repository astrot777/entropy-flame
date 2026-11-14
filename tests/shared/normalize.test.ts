import { describe, it, expect } from 'vitest';
import { normalizePsiId, normalizeText } from '../../src/shared/normalize';

describe('normalizePsiId', () => {
  it.each([
    ['psi-159', 'PSI-159'], [' PSI-159 ', 'PSI-159'], ['PSI-10', 'PSI-10'],
    ['https://psi.nasa.gov/physci/repo/data/investigations/PSI-159', 'PSI-159'],
  ])('accepts %s', (i, o) => expect(normalizePsiId(i)).toBe(o));
  it.each(['', 'PSI-', '159', 'PSI-159; x', '../PSI-1', 'https://evil.example/PSI-159'])(
    'rejects %s', (i) => expect(normalizePsiId(i)).toBeNull());
});
describe('normalizeText', () => {
  it('folds curly quotes, dashes and whitespace', () =>
    expect(normalizeText('“Cool”  flames\n— 85%')).toBe('"cool" flames - 85%'));
});
