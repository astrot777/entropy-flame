// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { setText } from '../../web/src/dom';

describe('setText', () => {
  it('never creates elements from text', () => {
    const div = document.createElement('div');
    setText(div, '<img src=x onerror=alert(1)>');
    expect(div.querySelector('img')).toBeNull();
    expect(div.textContent).toBe('<img src=x onerror=alert(1)>');
  });
});
