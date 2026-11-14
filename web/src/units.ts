const TABLE_LINE = /^Column "([^"]+)" \(/;

/**
 * The unit written in a NASA table column name, shown next to a bare number range in the table.
 * Nothing is converted: the unit is copied from the source column name, or null if there is none.
 */
export function unitFromQuote(value: string, quote: string): string | null {
  if (/[a-z%]/i.test(value.replace(/\bto\b/g, ''))) return null;
  const m = TABLE_LINE.exec(quote);
  if (!m) return null;
  const name = m[1];
  const paren = /\(([^()]+)\)\s*$/.exec(name);
  const semi = /;\s*([^;]+)$/.exec(name);
  const unit = (paren?.[1] ?? semi?.[1] ?? '').trim();
  if (!unit || /^note\b/i.test(unit)) return null; // "(Note 1)" is a footnote, not a unit
  return /^percent$/i.test(unit) ? '%' : unit;
}
