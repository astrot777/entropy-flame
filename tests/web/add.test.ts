import { describe, it, expect } from 'vitest';
import { sseParser, emptyLiveRow } from '../../web/src/sse';

describe('sseParser', () => {
  it('emits complete events across chunk boundaries', () => {
    const got: { event: string; data: unknown }[] = [];
    const feed = sseParser((event, data) => got.push({ event, data }));
    feed('event: field\ndata: {"field":"fuel"');
    feed(',"cell":{}}\n\nevent: done\ndata: {"row":1}\n\n');
    expect(got).toEqual([{ event: 'field', data: { field: 'fuel', cell: {} } }, { event: 'done', data: { row: 1 } }]);
  });
  it('handles CRLF line endings and skips malformed data', () => {
    const got: string[] = [];
    const feed = sseParser((event) => got.push(event));
    feed('event: field\r\ndata: {bad\r\n\r\nevent: done\r\ndata: {}\r\n\r\n');
    expect(got).toEqual(['done']);
  });
});

describe('emptyLiveRow', () => {
  it('starts with 12 pending cells, the id set, and the unreviewed mark', () => {
    const r = emptyLiveRow('PSI-60');
    expect(Object.keys(r).filter((k) => k !== 'unreviewed')).toHaveLength(12);
    expect(r.psiId.value).toBe('PSI-60');
    expect(r.unreviewed).toBe(true);
    expect(r.fuel.status).toBe('not stated');
  });
});
