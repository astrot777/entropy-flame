/// <reference types="vite/client" />
import './ask.css';
import { FIELDS, type FieldKey, type Row } from '../../src/shared/types';
import { el } from './dom';
import { LABELS } from './labels';
import { openPanel } from './sourcePanel';

export function mountAsk(box: HTMLElement, rows: Row[], panel: HTMLElement) {
  const form = el('form');
  const label = el('label', '', 'Ask Entropy');
  const input = el('input');
  input.id = 'ask-question';
  label.htmlFor = input.id;
  input.maxLength = 300;
  input.required = true;
  input.placeholder = 'Ask a question about the catalogue';
  const submit = el('button', 'primary', 'Ask');
  const output = el('div', 'ask-answer');
  output.setAttribute('role', 'status');
  form.append(label, input, submit);
  box.replaceChildren(form, output, el('small', '', 'Answers come only from the catalogue above and are checked against it by code. AI-generated text.'));
  form.addEventListener('submit', async event => {
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
      const data = await res.json();
      if (!Array.isArray(data.sentences)) throw new Error();
      const fragment = document.createDocumentFragment();
      for (const item of data.sentences) {
        const row = rows.find(r => r.psiId.value === item?.psiId);
        const field: FieldKey = item?.field;
        if (!row || !FIELDS.includes(field) || typeof item.sentence !== 'string' || row[field].status !== 'stated') throw new Error();
        const p = el('p', '', item.sentence + ' ');
        const chip = el('button', 'ask-chip', item.psiId + ' · ' + LABELS[field]);
        chip.type = 'button';
        chip.addEventListener('click', () => openPanel(panel, row, field));
        p.append(chip);
        fragment.append(p);
      }
      output.replaceChildren(fragment.childNodes.length ? fragment : 'Not stated in the catalogue.');
    } catch {
      output.textContent = 'The answer could not be loaded. Please try again.';
    } finally {
      submit.disabled = false;
    }
  });
}
