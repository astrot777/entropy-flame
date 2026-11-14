import { FIELDS, type Row } from '../../src/shared/types';

/** Incremental Server-Sent Events parser: feed it text chunks, it calls onEvent for each complete event. */
export function sseParser(onEvent: (event: string, data: unknown) => void): (chunk: string) => void {
  let buf = '';
  return (chunk: string) => {
    buf += chunk.replace(/\r\n/g, '\n');
    let end: number;
    while ((end = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, end);
      buf = buf.slice(end + 2);
      let event = 'message';
      const data: string[] = [];
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
      }
      try {
        onEvent(event, JSON.parse(data.join('\n')));
      } catch {
        /* malformed event: skip */
      }
    }
  };
}

/** The placeholder row shown while a live Add streams in. */
export function emptyLiveRow(psiId: string): Row {
  const row = {} as Row;
  for (const f of FIELDS) {
    row[f] = f === 'psiId'
      ? { value: psiId, quote: null, source: '', status: 'stated' }
      : { value: null, quote: null, source: '', status: 'not stated' };
  }
  row.unreviewed = true;
  return row;
}
