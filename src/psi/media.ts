import { normalizePsiId } from '../shared/normalize.js';
import { PsiError } from './fetch.js';

export interface MediaItem { name: string; kind: 'image' | 'video'; label: string; size: number }

const API = 'https://psi.nasa.gov/geode-py/ws';
const IMAGE = /\.(jpe?g|png|gif)$/i;
const VIDEO = /\.mp4$/i;
const MAX_IMAGES = 4;
const MAX_VIDEOS = 6;
const MAX_VIDEO_BYTES = 60_000_000;

/** "PSI-25_Raw Data_BASS_TEST_B1.mp4" -> "BASS TEST B1": drop the ID, the PSI folder name and the extension. */
function labelOf(name: string, psiId: string): string {
  return name
    .replace(new RegExp(`^${psiId}_`, 'i'), '')
    .replace(/^(Representative Image\(s\)|Raw Data|Images?|Videos?)_/i, '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/_/g, ' ')
    .trim();
}

/**
 * The real images and videos NASA lists for one PSI investigation: representative images first, then a few test videos.
 * Logos, archives and very large files are skipped.
 */
export async function listMedia(id: string, fetchImpl: typeof fetch = fetch): Promise<MediaItem[]> {
  const psiId = normalizePsiId(id);
  if (!psiId) throw new PsiError('bad_id', 'Not a PSI investigation ID');
  let res: Response;
  try {
    res = await fetchImpl(`${API}/repo/investigations/${psiId}`);
  } catch {
    throw new PsiError('upstream', 'PSI could not be reached');
  }
  if (res.status === 403 || res.status === 404) throw new PsiError('not_found', `${psiId} was not found in PSI`);
  if (!res.ok) throw new PsiError('upstream', `PSI returned status ${res.status}`);
  const record = (await res.json().catch(() => ({}))) as { added?: unknown };
  const files = Array.isArray(record.added) ? record.added : [];

  const images: MediaItem[] = [];
  const videos: MediaItem[] = [];
  for (const f of files) {
    const name = typeof f?.file_name === 'string' ? f.file_name : '';
    const size = Number(f?.file_size) || 0;
    if (!name || /logo/i.test(name)) continue;
    if (IMAGE.test(name)) images.push({ name, kind: 'image', label: labelOf(name, psiId), size });
    else if (VIDEO.test(name) && size > 0 && size <= MAX_VIDEO_BYTES) videos.push({ name, kind: 'video', label: labelOf(name, psiId), size });
  }
  const representativeFirst = (a: MediaItem, b: MediaItem) =>
    Number(/Representative/i.test(b.name)) - Number(/Representative/i.test(a.name));
  return [...images.sort(representativeFirst).slice(0, MAX_IMAGES), ...videos.slice(0, MAX_VIDEOS)];
}
