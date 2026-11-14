import { describe, it, expect, vi } from 'vitest';
import { listMedia } from '../../src/psi/media';
import { PsiError } from '../../src/psi/fetch';

const record = {
  added: [
    { file_name: 'PSI-25_Representative Image(s)_BASS-II_flame testing.jpg', file_size: 37525, remote_path: '/Home/psi-data/PSI-25/Representative Image(s)/x.jpg' },
    { file_name: 'PSI-25_Representative Image(s)_ACME logo.png', file_size: 1000, remote_path: '/Home/psi-data/PSI-25/Representative Image(s)/logo.png' },
    ...Array.from({ length: 9 }, (_, i) => ({ file_name: `PSI-25_Raw Data_BASS_TEST_B${i}.mp4`, file_size: 5_000_000, remote_path: '/Home/psi-data/PSI-25/Raw Data/x.mp4' })),
    { file_name: 'PSI-25_Raw Data_huge.mp4', file_size: 500_000_000, remote_path: '/Home/psi-data/PSI-25/Raw Data/huge.mp4' },
    { file_name: 'PSI-25_Raw Data_archive.zip', file_size: 100, remote_path: '/x.zip' },
  ],
};
const fakeFetch = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('listMedia', () => {
  it('lists representative images first, then a few videos, with readable labels', async () => {
    const items = await listMedia('psi-25', fakeFetch(record));
    expect(items[0]).toMatchObject({ kind: 'image', name: 'PSI-25_Representative Image(s)_BASS-II_flame testing.jpg', label: 'BASS-II flame testing' });
    expect(items.filter((i) => i.kind === 'video')).toHaveLength(6);
    expect(items.find((i) => i.kind === 'video')?.label).toBe('BASS TEST B0');
  });
  it('skips logos, archives and very large videos', async () => {
    const names = (await listMedia('PSI-25', fakeFetch(record))).map((i) => i.name);
    expect(names.some((n) => /logo|zip|huge/.test(n))).toBe(false);
  });
  it('returns an empty list when the record has no media', async () =>
    expect(await listMedia('PSI-69', fakeFetch({ added: [] }))).toEqual([]));
  it('rejects a bad id and maps a missing investigation to not_found', async () => {
    await expect(listMedia('x', fakeFetch(record))).rejects.toMatchObject({ code: 'bad_id' });
    await expect(listMedia('PSI-1', fakeFetch({}, 403))).rejects.toBeInstanceOf(PsiError);
  });
});
