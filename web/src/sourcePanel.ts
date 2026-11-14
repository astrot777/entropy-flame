import type { Cell, FieldKey, Row } from '../../src/shared/types';
import { el, setText } from './dom';
import { LABELS } from './labels';
import { cellText, oddValueNote, sourceHeading } from './source';

export function openPanel(panel: HTMLElement, row: Row, field: FieldKey): void {
  const cell: Cell = row[field];
  panel.replaceChildren();
  const close = el('button', 'close', 'Close');
  close.addEventListener('click', () => { panel.hidden = true; });
  panel.append(close, el('h2', '', `${row.psiId.value} · ${LABELS[field]}`));
  if (cell.status === 'not stated') {
    panel.append(
      el('p', 'value', 'Not stated'),
      el('p', 'note', 'Entropy found no sentence or table line in what it read of the PSI record that supports a value, so it leaves this empty instead of guessing. The record may still state it elsewhere.'),
    );
  } else {
    panel.append(el('p', 'value', cellText(field, cell)));
    panel.append(el('h2', '', sourceHeading(field, cell.quote ?? '')));
    panel.append(el('blockquote', '', cell.quote ?? ''));
    const odd = oddValueNote(field, cell);
    if (odd) panel.append(el('p', 'note warn', odd));
  }
  const link = el('a');
  link.href = cell.source;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  setText(link, 'Open the PSI record');
  panel.append(link);
  if (row.unreviewed) panel.append(el('p', 'note', 'This row was added live and has not been reviewed by a person.'));
  panel.hidden = false;
  close.focus();
}
