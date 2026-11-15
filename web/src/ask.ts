/// <reference types="vite/client" />
import './ask.css';
import { FIELDS, type FieldKey, type Row } from '../../src/shared/types';
import { el } from './dom';
import { LABELS } from './labels';
import { openPanel } from './sourcePanel';

interface Answer { kind: string; text: string; cells: { psiId: string; field: FieldKey }[] }

/** rows is read on every answer, so investigations added live can be cited too. */
export function mountAsk(box: HTMLElement, rows: Row[] | (() => Row[]), panel: HTMLElement) {
  const current = () => (typeof rows === 'function' ? rows() : rows);
  const form = el('form');
  const label = el('label', '', 'Ask Entropy');
  const input = el('input');
  input.id = 'ask-question';
  label.htmlFor = input.id;
  input.maxLength = 300;
  input.required = true;
  input.placeholder = 'For example: highest oxygen, or which experiments burned PMMA';
  const submit = el('button', 'primary', 'Ask');
  const output = el('div', 'ask-answer');
  output.setAttribute('role', 'status');
  form.append(label, input, submit);
  box.replaceChildren(form, output, el('small', '', 'An AI model only works out what you are asking. The answer is computed by code from the catalogue above, and every value links to its NASA source.'));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submit.disabled) return;
    const question = input.value.trim();
    if (!question || input.value.length > 300) {
      output.textContent = 'Enter a question of up to 300 characters.';
      return;
    }
    submit.disabled = true;
    output.textContent = 'Checking the catalogue...';
    try {
      const res = await fetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question }) });
      if (res.status === 429) { output.textContent = 'The request limit has been reached. Please try again later.'; return; }
      if (!res.ok) throw new Error();
      const data = (await res.json()) as Answer;
      if (typeof data.text !== 'string' || !Array.isArray(data.cells)) throw new Error();
      const answer = el('div', `ask-text ${data.kind}`);
      for (const line of data.text.split('\n')) answer.append(el('p', '', line));
      const chips = el('div', 'ask-chips');
      for (const cell of data.cells) {
        const row = current().find((r) => r.psiId.value === cell.psiId);
        if (!row || !FIELDS.includes(cell.field)) continue;
        const chip = el('button', 'ask-chip', `${cell.psiId} · ${LABELS[cell.field]}`);
        chip.type = 'button';
        chip.title = 'Open the NASA source for this value';
        chip.addEventListener('click', () => openPanel(panel, row, cell.field));
        chips.append(chip);
      }
      output.replaceChildren(answer);
      if (chips.childNodes.length) output.append(el('p', 'ask-sources', 'Sources:'), chips);
    } catch {
      output.textContent = 'The answer could not be loaded. Please try again.';
    } finally {
      submit.disabled = false;
    }
  });
}
