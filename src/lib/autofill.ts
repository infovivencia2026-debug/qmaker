import type { DB, Paper } from '../shared/types';
import { paperQuestionIds } from './paper';

function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Picks bank questions to fill a section up to its planned count, spreading across chapters
 * so the paper covers the syllabus instead of clustering on one chapter.
 */
export function autoFillIds(paper: Paper, db: DB, sectionId: string) {
  const s = paper.sections.find((x) => x.id === sectionId);
  if (!s) return { ids: [], need: 0 };
  const need = Math.max(0, (s.count ?? 0) - s.questionIds.length);
  const used = new Set(paperQuestionIds(paper));
  const pool = db.questions.filter(
    (q) => !used.has(q.id) && (!paper.subject || q.subject === paper.subject) && (!s.templateId || q.templateId === s.templateId),
  );
  // Questions written for this many marks come first within each chapter.
  const byChapter = new Map<string, typeof pool>();
  for (const q of shuffle(pool)) byChapter.set(q.chapter, [...(byChapter.get(q.chapter) ?? []), q]);
  const queues = shuffle([...byChapter.values()]).map((qs) =>
    s.marksEach ? [...qs.filter((q) => q.marks === s.marksEach), ...qs.filter((q) => q.marks !== s.marksEach)] : qs,
  );
  const ids: string[] = [];
  while (ids.length < need && queues.some((q) => q.length)) {
    for (const q of queues) if (q.length && ids.length < need) ids.push(q.shift()!.id);
  }
  return { ids, need };
}
