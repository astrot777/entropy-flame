import { el, setText } from './dom';

interface AccuracyFile { reviewedAt: string; marks: { id: string; cells: Record<string, boolean> }[] }

/** The About section: how Entropy works, what the LLM does and doesn't do, the data source, and the measured accuracy. */
export async function mountAbout(box: HTMLElement, pulledOn: string): Promise<void> {
  box.replaceChildren();
  box.append(el('h2', '', 'About Entropy'));

  const facts: [string, string][] = [
    ['What it is', 'A comparable, searchable table of NASA microgravity combustion investigations, built for researchers and spacecraft fire-safety engineers.'],
    ['Where the data comes from', `NASA Physical Sciences Informatics (PSI): each investigation's record and its experimental-table CSV files. Data pulled ${pulledOn}.`],
    ['What the LLM does', 'Reads one investigation and proposes a value and a word-for-word quote for each of 12 fields. It writes the Objectives summary.'],
    ['What code checks', 'A value is kept only if its quote appears in the PSI text and the value appears inside the quote. Otherwise the cell reads "Not stated". Numbers keep the units written in the source and are never converted.'],
    ['What it does not do', 'It does not score fire risk, invent values, or replace reading the original records. Rows added live are marked Unreviewed and are not saved.'],
  ];
  const dl = el('dl', 'facts');
  for (const [k, v] of facts) dl.append(el('dt', '', k), el('dd', '', v));
  box.append(dl);

  try {
    const res = await fetch('review/accuracy.json');
    if (!res.ok) return;
    const data = (await res.json()) as AccuracyFile;
    let correct = 0;
    let total = 0;
    for (const m of data.marks) for (const ok of Object.values(m.cells)) { total += 1; if (ok) correct += 1; }
    if (!total) return;
    const p = el('p', 'accuracy');
    setText(p, `${correct} of ${total} cells verified by hand against their PSI pages (${data.marks.length} investigations, reviewed ${data.reviewedAt}).`);
    box.append(p);
  } catch {
    /* no accuracy file: show nothing about accuracy */
  }
}
