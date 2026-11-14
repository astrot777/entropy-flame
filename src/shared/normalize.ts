// Written with Claude (Anthropic) as an SI coding assistant; reviewed by the team.
const BARE_ID = /^PSI-(\d+)$/i;
const PSI_URL = /^https:\/\/psi\.nasa\.gov\/physci\/repo\/data\/investigations\/(PSI-\d+)\/?$/i;

/** Returns an upper-case `PSI-<digits>` ID, or null for anything else. */
export function normalizePsiId(input: string): string | null {
  const s = input.trim();
  const bare = BARE_ID.exec(s);
  if (bare) return `PSI-${bare[1]}`;
  const url = PSI_URL.exec(s);
  if (url) return url[1].toUpperCase();
  return null;
}

/** Lower-cases, folds curly quotes and dashes to ASCII, collapses whitespace. */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}
