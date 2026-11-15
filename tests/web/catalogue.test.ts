import { describe, it, expect } from 'vitest';
import { gapSpan, GAP_WORDS } from '../../web/src/catalogue';

describe('gapSpan: the word fills the empty rest of the last row of cards', () => {
  it('spans the columns the last row leaves empty', () => {
    expect(gapSpan(11, 4)).toBe(1);
    expect(gapSpan(3, 4)).toBe(1);
    expect(gapSpan(1, 4)).toBe(3);
    expect(gapSpan(3, 5)).toBe(2);
  });
  it('takes a whole row when the cards fill their last row', () => {
    expect(gapSpan(4, 4)).toBe(4);
    expect(gapSpan(3, 1)).toBe(1);
  });
  it('never asks for less than one column', () => expect(gapSpan(5, 0)).toBe(1));
});

describe('GAP_WORDS', () => {
  it('reads as one sentence down the page', () => expect(GAP_WORDS.join(' ')).toBe('WE BURN HERE WE FLY TO MARS'));
});
