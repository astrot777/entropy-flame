import type { Cell, FieldKey, Row } from '../../src/shared/types';
import { el, setText } from './dom';
import { LABELS } from './labels';

export function openPanel(panel: HTMLElement, row: Row, field: FieldKey): void {
  const cell: Cell = row[field];
  panel.replaceChildren();
  const close = el('button', 'close', 'Close');
  close.addEventListener('click', () => { panel.hidden = true; });
  panel.append(close, el('h2', '', `${row.psiId.value} · ${LABELS[field]}`));
  if (cell.status === 'not stated') {
    panel.append(
      el('p', 'value', 'Not stated'),
      el('p', 'note', 'The PSI record does not state this, or no sentence in it supports a value, so Entropy leaves it empty instead of guessing.'),
    );
  } else {
    panel.append(el('p', 'value', cell.value ?? ''));
    panel.append(el('h2', '', field === 'objectives' ? 'Source sentence (the value above is an AI summary of it)' : 'Source quote, word for word'));
    panel.append(el('blockquote', '', cell.quote ?? ''));
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
