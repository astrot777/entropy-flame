import { el, setText } from './dom';

interface AccuracyFile { reviewedAt: string; marks: { id: string; cells: Record<string, boolean> }[] }

/** The About section: how Entropy works, what the LLM does and doesn't do, the data source, and the measured accuracy. */
export async function mountAbout(box: HTMLElement, pulledOn: string): Promise<void> {
  box.replaceChildren();
  box.append(el('h2', '', 'About Entropy'));

  const facts: [string, string][] = [
    ['What it is', 'A comparable, searchable table of NASA microgravity combustion investigations, built for researchers and spacecraft fire-safety engineers.'],
    ['Where the data comes from', `NASA Physical Sciences Informatics (PSI): each investigation's record and its experimental-table CSV files. Data pulled ${pulledOn}.`],
    ['What the LLM does', 'Reads one investigation and proposes a value and a supporting quote for each of 12 fields. It writes the Objectives summary and picks the Pillar.'],
    ['What code checks', 'A value is kept only if its quote appears in the PSI text and the value appears inside the quote. Objectives and Pillar are exempt from the second check, because they are the summary and the classification written by the model. Otherwise the cell reads "Not stated". This is a text match: it traces a value to its source, but it does not confirm the scientific interpretation. Numbers keep the units written in the source and are never converted or corrected.'],
    ['Values from tables', 'When a value comes from an experimental table published by NASA, its quote is a summary line Entropy computed from one column (its range, or its listed values). That line is not NASA wording; the panel says so.'],
    ['Limits', '"Not stated" means Entropy found no supporting text in what it read; the record may still state it elsewhere. Entropy reads up to 6 table files per investigation.'],
    ['Tested atmospheres', 'The chart above the table places every test that records both oxygen and pressure, against the three crew atmospheres NASA names in the PSI-20 record. A dashed zone is within 2 oxygen points and 10% of the pressure, a size Entropy chose. Inverse-flame tables are left out, because their oxygen column is the burner stream, not the air around the flame.'],
    ['Compared with ISS cabin air', 'Oxygen and pressure cells carry a tag that places the stated value against the air on the International Space Station: 21% oxygen at 14.7 psia, as given in a NASA technical brief on habitable atmospheres. "Like cabin" means 19.5 to 23.5% oxygen, or 0.95 to 1.05 atm. Units are converted only for this comparison. It compares conditions; it is not a fire-risk score.'],
    ['The 3D experiment view', 'A schematic drawn only from the stated values of a row. Parts NASA does not state are grey. Moving lines show the stated airflow. It is not to scale and not a physical simulation: shapes, layout and textures are illustrative, and no flame is drawn.'],
    ['What it does not do', 'It does not score fire risk (the ISS cabin comparison compares conditions only), invent values, or replace reading the original records. Rows added live are marked Unreviewed and are not saved.'],
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
    const wrong: string[] = [];
    for (const m of data.marks) for (const [field, ok] of Object.entries(m.cells)) { total += 1; if (ok) correct += 1; else wrong.push(`${m.id} ${field}`); }
    if (!total) return;
    const p = el('p', 'accuracy');
    const failed = wrong.length ? ` ${wrong.length} were marked wrong and are still shown as extracted: ${wrong.join(', ')}.` : '';
    setText(p, `${total} cells of ${data.marks.length} investigations were checked by hand against their PSI pages (reviewed ${data.reviewedAt}): ${correct} correct.${failed} This sample does not establish the accuracy of the whole catalogue.`);
    box.append(p);
  } catch {
    /* no accuracy file: show nothing about accuracy */
  }
}
