import { describe, expect, it } from 'vitest';
import { effectiveLayout, optionGrid } from '../lib/paper';
import { renderPaperHtml } from '../lib/renderHtml';
import { db, paper, q, section } from './fixtures';

describe('option grid', () => {
  it('fills across rows', () => {
    expect(optionGrid(4, 2, 'across')).toEqual({ cols: 2, rows: 2, cells: [0, 1, 2, 3] });
  });
  it('fills down columns, leaving gaps at the end of the last column', () => {
    // a c e / b d _  → row-major cells
    expect(optionGrid(5, 3, 'down')).toEqual({ cols: 3, rows: 2, cells: [0, 2, 4, 1, 3, null] });
    expect(optionGrid(5, 2, 'down').cells).toEqual([0, 3, 1, 4, 2, null]);
  });
  it('never uses more columns than options', () => {
    expect(optionGrid(2, 6, 'across').cols).toBe(2);
    expect(optionGrid(0, 4, 'across').cols).toBe(1);
  });
  it('every option appears exactly once for any combination', () => {
    for (let n = 1; n <= 8; n++)
      for (let c = 1; c <= 6; c++)
        for (const o of ['across', 'down'] as const) {
          const cells = optionGrid(n, c, o).cells.filter((x) => x !== null);
          expect([...cells].sort((a, b) => a! - b!)).toEqual([...Array(n).keys()]);
        }
  });
});

describe('layout precedence', () => {
  it('question beats section beats automatic', () => {
    expect(effectiveLayout(undefined, undefined)).toEqual({ optionCols: 0, optionOrder: 'across', partCols: 1 });
    expect(effectiveLayout(undefined, { optionCols: 2, optionOrder: 'down' })).toMatchObject({ optionCols: 2, optionOrder: 'down' });
    expect(effectiveLayout({ optionCols: 4 }, { optionCols: 2, partCols: 3 })).toMatchObject({ optionCols: 4, partCols: 3 });
  });

  it('renders chosen columns, section defaults and page columns', () => {
    const own = q('mcq', 1, { options: { items: ['a', 'b', 'c', 'd', 'e', 'f'], correct: 0 } }, { layout: { optionCols: 3, optionOrder: 'down' } });
    const inherit = q('mcq', 1, { options: { items: ['a', 'b', 'c', 'd'], correct: 0 } });
    const html = renderPaperHtml(paper([section([own.id, inherit.id], { layout: { optionCols: 1 } })], { pageCols: 2 }), db([own, inherit]), false);
    expect(html).toContain('repeat(3, minmax(0, 1fr))');
    expect(html).toContain('repeat(1, minmax(0, 1fr))');
    expect(html).toContain('class="cols2"');
    // down order with 3 columns: first row is a, c, e
    expect(html.indexOf('(c)</span> c')).toBeLessThan(html.indexOf('(b)</span> b'));
  });
});
