import type { DB } from '../../shared/types';
import { collectImageIds } from '../../lib/rich';

/** How many papers and library items use each image. */
export function imageUsage(db: DB) {
  const count = new Map<string, number>();
  const add = (v: unknown) => collectImageIds(v).forEach((id) => count.set(id, (count.get(id) ?? 0) + 1));
  db.papers.forEach(add);
  db.library.forEach(add);
  return count;
}

export const matchesImage = (name: string | undefined, q: string) =>
  !q.trim() || q.toLowerCase().split(/\s+/).every((w) => (name ?? '').toLowerCase().includes(w));
