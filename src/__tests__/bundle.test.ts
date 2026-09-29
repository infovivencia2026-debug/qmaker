import { describe, expect, it } from 'vitest';
import { mergeBundle, parseBundle } from '../lib/bundle';
import { autoFillIds } from '../lib/autofill';
import type { Bundle } from '../shared/types';
import { db, paper, q, section } from './fixtures';

const bundleOf = (questions: Bundle['questions']): Bundle => ({ format: 'qmaker', kind: 'bank', version: 1, exportedAt: 0, templates: [], questions, papers: [] });

describe('sharing files', () => {
  it('importing adds new questions, updates newer ones and keeps newer local edits', () => {
    const a = q('mcq', 1, {}, { updatedAt: 10 });
    const b = q('mcq', 1, {}, { updatedAt: 10 });
    const local = db([a, b]);
    const incoming = bundleOf([{ ...a, updatedAt: 20, marks: 9 }, { ...b, updatedAt: 5, marks: 9 }, q('mcq', 1)]);
    const { db: merged, stats } = mergeBundle(local, incoming);
    expect(stats).toEqual({ added: 1, updated: 1, skipped: 1 });
    expect(merged.questions.find((x) => x.id === a.id)!.marks).toBe(9);
    expect(merged.questions.find((x) => x.id === b.id)!.marks).toBe(1);
  });

  it('importing the same file twice changes nothing the second time', () => {
    const incoming = bundleOf([q('mcq', 1)]);
    const once = mergeBundle(db([]), incoming).db;
    expect(mergeBundle(once, incoming).stats).toEqual({ added: 0, updated: 0, skipped: 1 });
  });

  it('rejects files that are not QMaker files or are from a newer version', () => {
    expect(() => parseBundle('not json')).toThrow(/damaged/);
    expect(() => parseBundle('{"format":"other"}')).toThrow(/not a QMaker file/);
    expect(() => parseBundle(JSON.stringify({ ...bundleOf([]), version: 2 }))).toThrow(/newer/);
  });
});

describe('auto-fill', () => {
  it('fills up to the planned count with unused questions of the right type, across chapters', () => {
    const qs = [
      ...['Light', 'Light', 'Light'].map((c) => q('mcq', 1, {}, { chapter: c })),
      ...['Sound', 'Force'].map((c) => q('mcq', 1, {}, { chapter: c })),
      q('short', 2),
    ];
    const p = paper([section([qs[0].id], { templateId: 'mcq', count: 4 })]);
    const { ids, need } = autoFillIds(p, db(qs), p.sections[0].id);
    expect(need).toBe(3);
    expect(ids).toHaveLength(3);
    expect(ids).not.toContain(qs[0].id);
    const chapters = ids.map((id) => qs.find((x) => x.id === id)!.chapter);
    expect(new Set(chapters)).toEqual(new Set(['Light', 'Sound', 'Force']));
  });
});
