import { describe, expect, it } from 'vitest';
import { computeNumbers, findBox, formatNumber, insertBox, mapBox, marksLabel, marksOf, moveBox, printOrder, type Box } from '../lib/box';
import { paperToBox } from '../lib/boxMigrate';
import { renderPaperHtml } from '../lib/renderHtml';
import { db, paper, q, section } from './fixtures';

const Q = (id: string, m: number, extra: Partial<Box> = {}): Box => ({ id, number: { format: '1', pattern: '{n}.', scope: 'paper', counter: 'q' }, marks: { mode: 'fixed', value: m, show: true }, ...extra });

describe('numbering', () => {
  it('formats', () => {
    expect([1, 2, 26, 27].map((n) => formatNumber(n, 'a'))).toEqual(['a', 'b', 'z', 'aa']);
    expect([1, 4, 9, 14].map((n) => formatNumber(n, 'i'))).toEqual(['i', 'iv', 'ix', 'xiv']);
    expect(formatNumber(3, 'A')).toBe('C');
    expect(formatNumber(12, 'I')).toBe('XII');
  });

  it('paper-scope numbers continue across groups; local numbers restart', () => {
    const opt = (id: string): Box => ({ id, number: { format: 'a', pattern: '({n})', scope: 'local' } });
    const root: Box = { id: 'r', children: [
      { id: 's1', children: [Q('q1', 1, { children: [opt('o1'), opt('o2')] }), { id: 'note' }, Q('q2', 1)] },
      { id: 's2', children: [Q('q3', 1, { children: [opt('o3')] })] },
    ] };
    const n = computeNumbers(root);
    expect(['q1', 'q2', 'q3', 'o1', 'o2', 'o3'].map((id) => n.get(id))).toEqual(['1.', '2.', '3.', '(a)', '(b)', '(a)']);
    expect(n.has('note')).toBe(false);
  });

  it('key-only boxes are not counted on the paper', () => {
    const root: Box = { id: 'r', children: [Q('a', 1), Q('k', 1, { visible: 'key' }), Q('b', 1)] };
    expect(computeNumbers(root).get('b')).toBe('2.');
  });
});

describe('marks', () => {
  const sec: Box = { id: 's', marks: { mode: 'sum', show: true }, children: [Q('a', 2), Q('b', 2), { id: 'text' }, Q('c', 2)] };

  it('sums, prints "k × e = m" when equal', () => {
    expect(marksOf(sec)).toBe(6);
    expect(marksLabel({ ...sec, marks: { mode: 'sum', show: true, pattern: '{k} × {e} = {m}' } })).toBe('3 × 2 = 6');
    expect(marksLabel(Q('x', 3))).toBe('[3]');
  });

  it('best N counts only the highest children (answer any N)', () => {
    const any2: Box = { id: 's', marks: { mode: 'best', best: 2, show: true }, children: [Q('a', 2), Q('b', 5), Q('c', 3)] };
    expect(marksOf(any2)).toBe(8);
  });

  it('a choice (OR) counts once', () => {
    const or: Box = { id: 'o', choice: true, marks: { mode: 'best', best: 1, show: true }, children: [Q('a', 5), Q('b', 5)] };
    expect(marksOf({ id: 'r', children: [or, Q('c', 1)] })).toBe(6);
  });

  it('boxes without marks pass their children through; key-only boxes add nothing', () => {
    expect(marksOf({ id: 'w', children: [{ id: 'g', children: [Q('a', 2)] }, Q('k', 9, { visible: 'key' })] })).toBe(2);
  });
});

describe('shuffle', () => {
  const col: Box = { id: 'colB', shuffle: true, children: ['a', 'b', 'c', 'd'].map((id) => ({ id })) };
  it('is stable, never the original order on paper, original in the key', () => {
    const p = printOrder(col, false).map((b) => b.id);
    expect(p).toEqual(printOrder(col, false).map((b) => b.id));
    expect(p).not.toEqual(['a', 'b', 'c', 'd']);
    expect([...p].sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(printOrder(col, true).map((b) => b.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('tree edits', () => {
  const root: Box = { id: 'r', children: [{ id: 'a', children: [{ id: 'a1' }] }, { id: 'b' }] };
  it('insert, change, remove, move', () => {
    const t1 = insertBox(root, 'a', { id: 'a2' }, 0);
    expect(findBox(t1, 'a')!.box.children!.map((c) => c.id)).toEqual(['a2', 'a1']);
    const t2 = mapBox(t1, 'b', (x) => ({ ...x, content: 'hi' }));
    expect(findBox(t2, 'b')!.box.content).toBe('hi');
    expect(findBox(root, 'b')!.box.content).toBeUndefined();
    const t3 = mapBox(t2, 'a1', () => null);
    expect(findBox(t3, 'a1')).toBeNull();
    const t4 = moveBox(t2, 'b', 'a', 1);
    expect(findBox(t4, 'a')!.box.children!.map((c) => c.id)).toEqual(['a2', 'b', 'a1']);
    expect(moveBox(t2, 'a', 'a1', 0)).toBe(t2); // can't move a box into itself
  });
});

describe('older papers convert without changing what prints', () => {
  it('sections, numbering, marks, OR and options survive', () => {
    const a = q('mcq', 1, { options: { items: ['x', 'y'], correct: 1 } });
    const b = q('long', 5), c = q('long', 5), d = q('short', 2);
    const p = paper([section([a.id], { title: 'Section A' } as never), section([b.id, d.id], { alternatives: { [b.id]: c.id } })]);
    const d_ = db([a, b, c, d]);
    const body = paperToBox(p, d_);
    expect(marksOf(body)).toBe(8);
    const n = computeNumbers(body);
    expect([...n.values()].filter((v) => /^\d+\.$/.test(v))).toEqual(['1.', '2.', '3.']);
    const html = renderPaperHtml(p, d_, true);
    expect(html).toContain('Max. Marks: 8');
    expect(html).toContain('<div class="or">OR</div>');
    expect(html).toMatch(/class="bx ok numbered"[^>]*><div class="qn">\(b\)<\/div>/);
  });
});
