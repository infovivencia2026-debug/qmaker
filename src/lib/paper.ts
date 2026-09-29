import { maxImageWidth, plainText } from './rich';
import { paperLabels, type PaperLang } from './labels';
import type { QuestionLayout, Section, DB, FieldDef, OptionsValue, PairsValue, Paper, Part, PartNumbering, PartsValue, Question, Template } from '../shared/types';

/** Everything a renderer (HTML or DOCX) needs, resolved once. */
export interface ResolvedQuestion {
  number: number;
  question: Question;
  template: Template;
  /** Marks as printed: the section's "marks each" if set, otherwise the question's own. */
  marks: number;
  /** Either/or: the "OR" question printed under the same number. */
  alt?: { question: Question; template: Template };
  /** The section's default layout, used where the question sets none. */
  sectionLayout?: QuestionLayout;
}

export interface ResolvedSection {
  id: string;
  title: string;
  instruction: string;
  questions: ResolvedQuestion[];
  /** Marks this section contributes to the total (respects "answer any N"). */
  marks: number;
  /** e.g. "10 × 1 = 10" when every question carries the same marks. */
  marksLabel: string;
  attempt: number;
  lang: PaperLang;
  plannedCount: number;
  /** null when the section has no complete plan. */
  plannedMarks: number | null;
}

/** A locked paper sees its frozen copies instead of the live question bank. */
export function lockedView(paper: Paper, db: DB): DB {
  if (!paper.locked) return db;
  const templates = new Map(db.templates.map((t) => [t.id, t]));
  for (const t of paper.locked.templates) templates.set(t.id, t);
  return { ...db, questions: paper.locked.questions, templates: [...templates.values()] };
}

/** Freezes the paper's questions and the templates they use. */
export function lockPaper(paper: Paper, db: DB): Paper {
  const ids = new Set(paperQuestionIds(paper));
  const questions = db.questions.filter((q) => ids.has(q.id));
  const used = new Set<string>();
  for (const q of questions) {
    used.add(q.templateId);
    for (const v of Object.values(q.data)) for (const p of asParts(v).items) used.add(p.templateId);
  }
  return { ...paper, locked: { at: Date.now(), questions: structuredClone(questions), templates: structuredClone(db.templates.filter((t) => used.has(t.id))) } };
}

/** Other papers that use a question (so editing it would change them too). */
export const papersUsing = (db: DB, questionId: string, exceptPaperId?: string) =>
  db.papers.filter((p) => p.id !== exceptPaperId && !p.locked && paperQuestionIds(p).includes(questionId));

/** Points one paper at a different question id (used when making a private copy). */
export function replaceInSection(s: Section, from: string, to: string): Section {
  const alternatives: Record<string, string> = {};
  for (const [k, v] of Object.entries(s.alternatives ?? {})) alternatives[k === from ? to : k] = v === from ? to : v;
  return { ...s, questionIds: s.questionIds.map((x) => (x === from ? to : x)), alternatives };
}

export function resolvePaper(paper: Paper, liveDb: DB) {
  const db = lockedView(paper, liveDb);
  const questions = new Map(db.questions.map((q) => [q.id, q]));
  const templates = new Map(db.templates.map((t) => [t.id, t]));
  let number = 0;
  let missing = 0;
  const sections: ResolvedSection[] = paper.sections.map((s) => {
    const qs: ResolvedQuestion[] = [];
    for (const id of s.questionIds) {
      const question = questions.get(id);
      const template = question && templates.get(question.templateId);
      if (!question || !template) {
        missing++;
        continue;
      }
      const altQ = s.alternatives?.[id] ? questions.get(s.alternatives[id]) : undefined;
      const altT = altQ && templates.get(altQ.templateId);
      qs.push({ number: ++number, question, template, marks: s.marksEach || question.marks, alt: altQ && altT ? { question: altQ, template: altT } : undefined, sectionLayout: s.layout });
    }
    const attempt = s.attempt && s.attempt < qs.length ? s.attempt : 0;
    const counted = attempt || qs.length;
    // With a choice, the student's best answers count: take the highest-mark questions.
    const marks = [...qs].map((q) => q.marks).sort((a, b) => b - a).slice(0, counted).reduce((a, b) => a + b, 0);
    const same = qs.length > 0 && qs.every((q) => q.marks === qs[0].marks);
    const marksLabel = !qs.length ? '' : same && counted > 1 ? `${counted} × ${qs[0].marks} = ${marks}` : `${marks} ${paperLabels(paper.labelLang)('marks')}`;
    const plannedCount = s.count ?? 0;
    const plannedMarks = plannedCount && s.marksEach ? Math.min(s.attempt || plannedCount, plannedCount) * s.marksEach : null;
    return { id: s.id, title: s.title, instruction: s.instruction, questions: qs, marks, marksLabel, attempt, lang: paper.labelLang ?? 'en', plannedCount, plannedMarks };
  });
  const totalMarks = sections.reduce((sum, s) => sum + s.marks, 0);
  return { sections, totalMarks, missing };
}

/** Section heading instruction, adding "Answer any N" automatically when a choice is set. */
export function sectionInstruction(s: ResolvedSection) {
  if (s.instruction.trim() || !s.attempt) return s.instruction;
  return paperLabels(s.lang)('anyOf', { n: s.attempt, m: s.questions.length });
}

export interface DistRow { label: string; marks: number; count: number }

/** Marks split by chapter, difficulty and question type — the blueprint check teachers do by hand. */
export function marksDistribution(paper: Paper, db: DB) {
  db = lockedView(paper, db);
  const { sections } = resolvePaper(paper, db);
  const group = (key: (q: ResolvedQuestion) => string) => {
    const rows = new Map<string, DistRow>();
    for (const s of sections)
      for (const q of s.questions) {
        const label = key(q) || '—';
        const row = rows.get(label) ?? { label, marks: 0, count: 0 };
        row.marks += q.marks;
        row.count++;
        rows.set(label, row);
      }
    return [...rows.values()].sort((a, b) => b.marks - a.marks);
  };
  return {
    chapter: group((q) => q.question.chapter),
    difficulty: group((q) => q.question.difficulty),
    type: group((q) => q.template.name),
  };
}

export const fieldValue = (q: Pick<Question, 'data'>, f: FieldDef) => q.data[f.key] ?? f.default;

export const asText = (v: unknown) => (typeof v === 'string' ? v : '');

export function asOptions(v: unknown): OptionsValue {
  const o = v as OptionsValue | undefined;
  return {
    items: Array.isArray(o?.items) ? o.items : [],
    items2: Array.isArray(o?.items2) ? o.items2 : undefined,
    correct: typeof o?.correct === 'number' ? o.correct : null,
  };
}

export const asPairs = (v: unknown): PairsValue => (Array.isArray(v) ? (v as PairsValue).filter((p) => p[0] || p[1]) : []);

/** Key holding a text field's second-language version. */
export const secondKey = (key: string) => `${key}@2`;

/** Options print in 4, 2 or 1 columns depending on how long they are. */
export function optionColumns(items: string[]) {
  const img = Math.max(0, ...items.map(maxImageWidth));
  if (img) return img <= 35 ? 4 : img <= 80 ? 2 : 1;
  const longest = Math.max(0, ...items.map((s) => plainText(s).length));
  return longest <= 18 ? 4 : longest <= 40 ? 2 : 1;
}

/** Question layout first, then the section's, then automatic. */
export function effectiveLayout(own?: QuestionLayout, section?: QuestionLayout) {
  return {
    optionCols: own?.optionCols || section?.optionCols || 0,
    optionOrder: own?.optionOrder ?? section?.optionOrder ?? 'across',
    partCols: own?.partCols || section?.partCols || 1,
  } as const;
}

/** Printable width in mm for a question's content: A4 minus margins, one page column, minus the number column. */
export const questionWidthMm = (pageCols?: number) => (pageCols === 2 ? 84 : 180) - 12;

/** Narrowest readable cells; below these, text starts breaking inside words. */
export const MIN_OPTION_MM = 24;
export const MIN_PART_MM = 42;

/** Final option grid: columns, and for each grid cell (row-major) which option goes there. */
export function optionGrid(count: number, cols: number, order: 'across' | 'down') {
  cols = Math.max(1, Math.min(cols, count || 1));
  const rows = Math.ceil(count / cols);
  const cells: (number | null)[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const i = order === 'down' ? c * rows + r : r * cols + c;
      cells.push(i < count ? i : null);
    }
  return { cols, rows, cells };
}

/** Short one-line summary for lists. */
export function questionSummary(q: Question, t: Template | undefined) {
  const f = t?.fields.find((f) => f.type === 'text' && !f.answer);
  const text = f ? asText(q.data[f.key]) : '';
  return plainText(text).replace(/\s+/g, ' ').trim() || '(empty)';
}

/** Every question a paper uses, including "OR" alternatives. */
export const paperQuestionIds = (paper: Paper) =>
  paper.sections.flatMap((s) => [...s.questionIds, ...Object.values(s.alternatives ?? {})]);

export function asParts(v: unknown): PartsValue {
  const p = v as Partial<PartsValue> | undefined;
  return { numbering: p?.numbering ?? 'a', items: Array.isArray(p?.items) ? (p!.items as Part[]) : [] };
}

const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii', 'xiii', 'xiv', 'xv'];
export function partLabel(numbering: PartNumbering, i: number) {
  return `(${numbering === 'i' ? ROMAN[i] ?? i + 1 : numbering === '1' ? i + 1 : String.fromCharCode(97 + i)})`;
}

/** A question with parts is worth the sum of its parts; null when the template has no parts. */
export function partsMarks(template: Template, data: Record<string, unknown>) {
  const f = template.fields.find((x) => x.type === 'parts');
  if (!f) return null;
  const items = asParts(data[f.key] ?? f.default).items;
  return items.length ? items.reduce((sum, p) => sum + (p.marks || 0), 0) : null;
}

/** Removes a question from a section whether it is a main question or an "OR" alternative. */
export function removeFromSection(s: Section, id: string): Section {
  const alternatives = { ...s.alternatives };
  const promoted = alternatives[id];
  delete alternatives[id];
  for (const [k, v] of Object.entries(alternatives)) if (v === id) delete alternatives[k];
  // Deleting the main question of an either/or keeps its alternative in its place.
  const questionIds = s.questionIds.flatMap((x) => (x !== id ? [x] : promoted ? [promoted] : []));
  return { ...s, questionIds, alternatives };
}
