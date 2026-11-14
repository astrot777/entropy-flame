// Usage: npx tsx scripts/accuracy.ts  (reads data/review/accuracy.json, prints "N of M")
import { existsSync, readFileSync } from 'node:fs';

export interface Marks { id: string; cells: Record<string, boolean> }

/** Counts hand-checked cells marked correct over all hand-checked cells. */
export function accuracy(marks: Marks[]): { correct: number; total: number } {
  let correct = 0;
  let total = 0;
  for (const m of marks) {
    for (const ok of Object.values(m.cells)) {
      total += 1;
      if (ok) correct += 1;
    }
  }
  return { correct, total };
}

if (process.argv[1]?.endsWith('accuracy.ts') && existsSync('data/review/accuracy.json')) {
  const { correct, total } = accuracy(JSON.parse(readFileSync('data/review/accuracy.json', 'utf8')).marks);
  console.log(`${correct} of ${total} cells verified by hand`);
}
