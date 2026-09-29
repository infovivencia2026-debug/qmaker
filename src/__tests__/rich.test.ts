import { describe, expect, it } from 'vitest';
import { collectImageIds, groupCols, groupLabel, groupToken, hasImage, imgToken, joinRich, maxImageWidth, parseRich, plainText, richHtml } from '../lib/rich';
import { optionColumns } from '../lib/paper';
import { seededOrder } from '../lib/util';

describe('image tokens', () => {
  const s = `Look ${imgToken('abc-1', 40, 'right')} here\n${imgToken('def-2', 70, 'center')}`;

  it('parses into alternating text and image segments and joins back unchanged', () => {
    const segs = parseRich(s);
    expect(segs.map((x) => x.kind)).toEqual(['text', 'img', 'text', 'img', 'text']);
    expect(segs[1]).toEqual({ kind: 'img', id: 'abc-1', width: 40, align: 'right' });
    expect(joinRich(segs)).toBe(s);
  });

  it('plain text with no images is a single text segment', () => {
    expect(parseRich('hello')).toEqual([{ kind: 'text', text: 'hello' }]);
    expect(hasImage('hello')).toBe(false);
    expect(hasImage(s)).toBe(true);
  });

  it('collects image ids from nested data', () => {
    const ids = collectImageIds({ a: [s], b: { c: imgToken('ghi-3', 10, 'inline') } });
    expect([...ids].sort()).toEqual(['abc-1', 'def-2', 'ghi-3']);
  });

  it('summaries and widths', () => {
    expect(plainText(s)).toBe('Look 🖼 here\n🖼');
    expect(maxImageWidth(s)).toBe(70);
  });

  it('escapes text and drops a newline next to a block image', () => {
    const html = richHtml(`<b>&</b>\n${imgToken('x', 30, 'center')}\nafter`, { x: { id: 'x', w: 10, h: 10, file: 'x.png' } });
    expect(html).toBe('&lt;b&gt;&amp;&lt;/b&gt;<img class="qi al-center" style="width:30mm" src="qimg://img/x.png" />after');
  });

  it('a missing image renders nothing instead of a broken picture', () => {
    expect(richHtml(imgToken('nope', 30, 'left'), {})).toBe('');
  });
});

describe('option columns', () => {
  it('uses 4 columns for short options, fewer for long text or wide images', () => {
    expect(optionColumns(['Sun', 'Moon', 'Star', 'Sky'])).toBe(4);
    expect(optionColumns(['a'.repeat(30), 'b'])).toBe(2);
    expect(optionColumns(['a'.repeat(60), 'b'])).toBe(1);
    expect(optionColumns([imgToken('a', 30, 'left'), 'b'])).toBe(4);
    expect(optionColumns([imgToken('a', 60, 'left'), 'b'])).toBe(2);
  });
});

describe('match-the-following shuffle', () => {
  it('is stable for the same question and always a real permutation', () => {
    for (let n = 2; n <= 8; n++) {
      const o = seededOrder(n, `q${n}`);
      expect(o).toEqual(seededOrder(n, `q${n}`));
      expect([...o].sort()).toEqual([...Array(n).keys()]);
      expect(o.every((v, i) => v === i)).toBe(false);
    }
  });

  it('answer-key mapping points each left item to its correct right item', () => {
    const pairs = [['Sun', 'Star'], ['Moon', 'Satellite'], ['Earth', 'Planet'], ['Comet', 'Tail']];
    const order = seededOrder(pairs.length, 'q-match');
    const printedRight = order.map((j) => pairs[j][1]);
    pairs.forEach((p, i) => expect(printedRight[order.indexOf(i)]).toBe(p[1]));
  });
});

describe('image groups', () => {
  const g = { items: [{ id: 'a-1', caption: 'Lion, king | of ]] jungle' }, { id: 'b-2', caption: 'शेर ~ సింహం' }, { id: 'c-3', caption: '' }], cols: 0, width: 0, label: 'a' as const, align: 'center' as const };

  it('round-trips through its token, including tricky captions', () => {
    const s = `Identify: ${groupToken(g)} done`;
    const segs = parseRich(s);
    expect(segs.map((x) => x.kind)).toEqual(['text', 'grp', 'text']);
    expect(segs[1]).toEqual({ kind: 'grp', ...g });
    expect(joinRich(segs)).toBe(s);
  });

  it('collects every image in a group and counts as a picture', () => {
    expect([...collectImageIds(groupToken(g))].sort()).toEqual(['a-1', 'b-2', 'c-3']);
    expect(hasImage(groupToken(g))).toBe(true);
    expect(plainText(`x ${groupToken(g)}`)).toBe('x 🖼');
  });

  it('"one row" uses as many columns as images; fixed columns wrap', () => {
    expect(groupCols({ ...g, cols: 0 })).toBe(3);
    expect(groupCols({ ...g, cols: 2 })).toBe(2);
    expect(groupCols({ ...g, cols: 10 })).toBe(3);
  });

  it('labels count in every style', () => {
    expect([0, 1, 9].map((i) => groupLabel('a', i))).toEqual(['(a)', '(b)', '(j)']);
    expect([0, 3].map((i) => groupLabel('i', i))).toEqual(['(i)', '(iv)']);
    expect(groupLabel('A', 2)).toBe('(C)');
    expect(groupLabel('1', 9)).toBe('(10)');
    expect(groupLabel('none', 0)).toBe('');
  });

  it('renders a grid with labels and escaped captions', () => {
    const html = richHtml(groupToken({ ...g, cols: 2, width: 25 }), { 'a-1': { id: 'a-1', w: 1, h: 1, file: 'a-1.png' } });
    expect(html).toContain('grid-template-columns: repeat(2, 25mm)');
    expect(html).toContain('<figcaption>(a) Lion, king | of ]] jungle</figcaption>');
    expect(html).toContain('<figcaption>(b) शेर ~ సింహం</figcaption>');
    expect(html).toContain('<figcaption>(c)</figcaption>');
  });
});
