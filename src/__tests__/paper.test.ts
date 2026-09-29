import { describe, expect, it } from 'vitest';
import { lockPaper, marksDistribution, partsMarks, papersUsing, removeFromSection, replaceInSection, resolvePaper, sectionInstruction } from '../lib/paper';
import { BUILTIN_TEMPLATES } from '../shared/templates';
import { db, paper, q, section } from './fixtures';

describe('marks totals', () => {
  it('adds up question marks across sections and numbers questions continuously', () => {
    const a = q('mcq', 1), b = q('mcq', 1), c = q('short', 2);
    const r = resolvePaper(paper([section([a.id, b.id]), section([c.id])]), db([a, b, c]));
    expect(r.totalMarks).toBe(4);
    expect(r.sections.flatMap((s) => s.questions.map((x) => x.number))).toEqual([1, 2, 3]);
    expect(r.sections[0].marksLabel).toBe('2 × 1 = 2');
    expect(r.sections[1].marksLabel).toBe('2 Marks');
  });

  it('section "marks each" overrides the question marks', () => {
    const a = q('short', 3), b = q('short', 5);
    const r = resolvePaper(paper([section([a.id, b.id], { marksEach: 2 })]), db([a, b]));
    expect(r.totalMarks).toBe(4);
    expect(r.sections[0].questions.map((x) => x.marks)).toEqual([2, 2]);
  });

  it('"answer any N" counts only N questions, the highest-mark ones', () => {
    const qs = [q('short', 2), q('short', 3), q('short', 5)];
    const r = resolvePaper(paper([section(qs.map((x) => x.id), { attempt: 2 })]), db(qs));
    expect(r.totalMarks).toBe(8);
    expect(sectionInstruction(r.sections[0])).toBe('Answer any 2 of the following 3 questions.');
  });

  it('ignores "answer any N" when N is not less than the number of questions', () => {
    const qs = [q('short', 2), q('short', 2)];
    expect(resolvePaper(paper([section(qs.map((x) => x.id), { attempt: 2 })]), db(qs)).totalMarks).toBe(4);
  });

  it('reports planned vs actual for a section plan', () => {
    const qs = [q('mcq', 1), q('mcq', 1)];
    const s = resolvePaper(paper([section(qs.map((x) => x.id), { count: 5, marksEach: 1, attempt: 4 })]), db(qs)).sections[0];
    expect(s.plannedCount).toBe(5);
    expect(s.plannedMarks).toBe(4);
  });

  it('skips deleted questions and counts them as missing', () => {
    const a = q('mcq', 1);
    const r = resolvePaper(paper([section([a.id, 'gone'])]), db([a]));
    expect(r.totalMarks).toBe(1);
    expect(r.missing).toBe(1);
  });
});

describe('either / or', () => {
  it('counts the pair once, with one number, using the main question marks', () => {
    const main = q('long', 5), alt = q('long', 5), next = q('mcq', 1);
    const r = resolvePaper(paper([section([main.id, next.id], { alternatives: { [main.id]: alt.id } })]), db([main, alt, next]));
    expect(r.totalMarks).toBe(6);
    expect(r.sections[0].questions[0].alt?.question.id).toBe(alt.id);
    expect(r.sections[0].questions[1].number).toBe(2);
  });

  it('removing the main question keeps the alternative in its place', () => {
    const s = removeFromSection(section(['a', 'b', 'c'], { alternatives: { b: 'x' } }), 'b');
    expect(s.questionIds).toEqual(['a', 'x', 'c']);
    expect(s.alternatives).toEqual({});
  });

  it('removing the alternative keeps the main question', () => {
    const s = removeFromSection(section(['a', 'b'], { alternatives: { b: 'x' } }), 'x');
    expect(s.questionIds).toEqual(['a', 'b']);
    expect(s.alternatives).toEqual({});
  });

  it('replaceInSection swaps an id wherever it appears', () => {
    const s = replaceInSection(section(['a', 'b'], { alternatives: { b: 'x' } }), 'x', 'y');
    expect(s.alternatives).toEqual({ b: 'y' });
    expect(replaceInSection(s, 'b', 'c')).toMatchObject({ questionIds: ['a', 'c'], alternatives: { c: 'y' } });
  });
});

describe('parts', () => {
  const multi = BUILTIN_TEMPLATES.find((t) => t.id === 'multi')!;
  it('a question with parts is worth the sum of its parts', () => {
    const data = { parts: { numbering: 'a', items: [{ id: 'p1', templateId: 'short', marks: 2, data: {} }, { id: 'p2', templateId: 'long', marks: 3, data: {} }] } };
    expect(partsMarks(multi, data)).toBe(5);
  });
  it('returns null for templates without parts or with no parts yet', () => {
    expect(partsMarks(BUILTIN_TEMPLATES.find((t) => t.id === 'mcq')!, {})).toBeNull();
    expect(partsMarks(multi, {})).toBeNull();
  });
});

describe('locking', () => {
  it('a locked paper keeps printing the frozen question after the bank changes', () => {
    const a = q('mcq', 1, { stem: 'Original' });
    const p = lockPaper(paper([section([a.id])]), db([a]));
    const edited = { ...a, marks: 4, data: { ...a.data, stem: 'Changed' } };
    const r = resolvePaper(p, db([edited]));
    expect(r.totalMarks).toBe(1);
    expect(r.sections[0].questions[0].question.data.stem).toBe('Original');
  });

  it('a locked paper survives the question being deleted from the bank', () => {
    const a = q('mcq', 2);
    const p = lockPaper(paper([section([a.id])]), db([a]));
    expect(resolvePaper(p, db([])).totalMarks).toBe(2);
  });

  it('papersUsing lists other editable papers only', () => {
    const a = q('mcq', 1);
    const p1 = paper([section([a.id])], { id: 'p1' });
    const p2 = paper([section([a.id])], { id: 'p2' });
    const p3 = { ...lockPaper(paper([section([a.id])], { id: 'p3' }), db([a])) };
    expect(papersUsing(db([a], [p1, p2, p3]), a.id, 'p1').map((p) => p.id)).toEqual(['p2']);
  });
});

describe('marks distribution', () => {
  it('groups marks by chapter and difficulty', () => {
    const a = q('mcq', 1, {}, { chapter: 'Light', difficulty: 'easy' });
    const b = q('short', 3, {}, { chapter: 'Sound', difficulty: 'hard' });
    const d = marksDistribution(paper([section([a.id, b.id])]), db([a, b]));
    expect(d.chapter).toEqual([{ label: 'Sound', marks: 3, count: 1 }, { label: 'Light', marks: 1, count: 1 }]);
    expect(d.difficulty.map((r) => r.label)).toEqual(['hard', 'easy']);
  });
});
