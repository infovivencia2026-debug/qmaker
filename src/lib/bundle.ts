import type { Bundle, DB, Paper, Question, Template } from '../shared/types';
import { collectImageIds } from './rich';
import { paperQuestionIds } from './paper';

function customTemplatesFor(db: DB, questions: Question[]) {
  const used = new Set(questions.map((q) => q.templateId));
  return db.templates.filter((t) => !t.builtin && used.has(t.id));
}

function bundle(db: DB, kind: Bundle['kind'], templates: Template[], questions: Question[], papers: Paper[]): Bundle {
  const ids = collectImageIds([questions, papers]);
  const images = Object.fromEntries([...ids].filter((id) => db.images[id]).map((id) => [id, db.images[id]]));
  return { format: 'qmaker', kind, version: 1, exportedAt: Date.now(), templates, questions, papers, images };
}

/** Question bank, optionally one subject. Includes custom templates too so the receiver can open everything. */
export function bankBundle(db: DB, subject: string | null) {
  const questions = subject === null ? db.questions : db.questions.filter((q) => q.subject === subject);
  const templates = subject === null ? db.templates.filter((t) => !t.builtin) : customTemplatesFor(db, questions);
  return bundle(db, 'bank', templates, questions, []);
}

export function paperBundle(db: DB, paper: Paper) {
  const ids = new Set(paperQuestionIds(paper));
  const questions = db.questions.filter((q) => ids.has(q.id));
  return bundle(db, 'paper', customTemplatesFor(db, questions), questions, [paper]);
}

export function parseBundle(text: string): Bundle {
  let data: Partial<Bundle>;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file is damaged or is not a QMaker file.');
  }
  if (data.format !== 'qmaker' || !Array.isArray(data.questions) || !Array.isArray(data.templates) || !Array.isArray(data.papers)) {
    throw new Error('This file is not a QMaker file.');
  }
  if ((data.version ?? 0) > 1) throw new Error('This file was made with a newer QMaker. Please update the app.');
  return data as Bundle;
}

export interface MergeStats { added: number; updated: number; skipped: number }

/** Merge by id; the more recently edited copy wins, so re-sharing the same file is harmless. */
function mergeList<T extends { id: string; updatedAt: number }>(mine: T[], theirs: T[], stats: MergeStats) {
  const byId = new Map(mine.map((x) => [x.id, x]));
  for (const item of theirs) {
    const cur = byId.get(item.id);
    if (!cur) stats.added++;
    else if (item.updatedAt > cur.updatedAt) stats.updated++;
    else {
      stats.skipped++;
      continue;
    }
    byId.set(item.id, item);
  }
  return [...byId.values()];
}

export function mergeBundle(db: DB, b: Bundle) {
  const stats: MergeStats = { added: 0, updated: 0, skipped: 0 };
  const next: DB = {
    ...db,
    templates: mergeList(db.templates, b.templates.filter((t) => !t.builtin), { added: 0, updated: 0, skipped: 0 }),
    questions: mergeList(db.questions, b.questions, stats),
    papers: mergeList(db.papers, b.papers, { added: 0, updated: 0, skipped: 0 }),
    // Image ids are random UUIDs, so an id always means the same picture.
    images: { ...(b.images ?? {}), ...db.images },
  };
  return { db: next, stats, papers: b.papers.length };
}
