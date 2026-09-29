import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { legacyToHtml, renderRich, renderRichInline, richPlain, sanitizeRich, toHtml } from '../lib/richdoc';
import { groupToken, imgToken } from '../lib/rich';
import { renderPaperDocx } from '../lib/renderDocx';
import { db, paper, q, section } from './fixtures';

describe('safety', () => {
  it('strips scripts, event handlers and unknown tags from shared content', () => {
    const evil = '<p onclick="x()">Hi<script>alert(1)</script><img src=x onerror="alert(2)" data-id="a-1" data-width="30"><iframe src="evil"></iframe><a href="javascript:alert(3)">link</a></p>';
    const clean = sanitizeRich(evil);
    expect(clean).not.toMatch(/script|onclick|onerror|iframe|javascript|href|src=/i);
    expect(clean).toContain('Hi');
    expect(clean).toContain('link');
    expect(clean).toContain('data-id="a-1"');
  });

  it('keeps only safe styles', () => {
    expect(sanitizeRich('<p style="text-align: center; background: url(x)">a</p>')).toBe('<p style="text-align: center">a</p>');
  });
});

describe('older content', () => {
  it('plain text with line breaks becomes paragraphs', () => {
    expect(legacyToHtml('a & b\nc')).toBe('<p>a &amp; b</p><p>c</p>');
    expect(toHtml('<p>already</p>')).toBe('<p>already</p>');
  });

  it('images keep their size and position', () => {
    expect(legacyToHtml(`See ${imgToken('i-1', 40, 'right')}here`)).toBe('<p>See <img data-id="i-1" data-width="40" data-align="right">here</p>');
    expect(legacyToHtml(`Above\n${imgToken('i-1', 60, 'center')}\nBelow`)).toBe('<p>Above</p><p><img data-id="i-1" data-width="60" data-align="center"></p><p>Below</p>');
  });

  it('image rows become a borderless table with labels', () => {
    const html = legacyToHtml(groupToken({ items: [{ id: 'a', caption: 'Lion' }, { id: 'b', caption: '' }], cols: 0, width: 20, label: 'a', align: 'center' }));
    expect(html).toContain('<table data-borderless="true">');
    expect(html.match(/<td>/g)).toHaveLength(2);
    expect(html).toContain('(a) Lion');
    expect(html).toContain('(b)');
  });
});

describe('printing', () => {
  const images = { 'i-1': { id: 'i-1', w: 10, h: 10, file: 'i-1.png' } };

  it('resolves pictures, draws answer lines and boxes, classes tables', () => {
    const html = renderRich('<p><img data-id="i-1" data-width="30" data-align="center"></p><div data-lines="2"></div><div data-box="50"></div><table data-borderless="true"><tbody><tr><td><p>x</p></td></tr></tbody></table><p></p>', images);
    expect(html).toContain('src="qimg://img/i-1.png"');
    expect(html).toContain('class="qi al-center"');
    expect(html).toContain('<div data-lines="2" class="lines"><div></div><div></div></div>');
    expect(html).toContain('style="height:50mm"');
    expect(html).toContain('class="rt borderless"');
    expect(html).toContain('<p><br></p>');
  });

  it('a single paragraph prints inline after an option letter', () => {
    expect(renderRichInline('<p>Hello <strong>world</strong></p>', {})).toBe('Hello <strong>world</strong>');
    expect(renderRichInline('<p>a</p><p>b</p>', {})).toBe('<p>a</p><p>b</p>');
  });

  it('summaries drop markup', () => {
    expect(richPlain('<p>H<sub>2</sub>O is <strong>water</strong></p><table><tbody><tr><td><p>x</p></td></tr></tbody></table>')).toBe('H2O is water x');
  });
});

describe('Word export', () => {
  it('turns formatting, lists and merged tables into native Word elements', async () => {
    const a = q('short', 2, {
      stem: '<p><strong>Bold</strong> x<sup>2</sup> H<sub>2</sub>O</p><ul><li><p>one</p></li></ul>' +
        '<table><tbody><tr><th colspan="2"><p>Head</p></th></tr><tr><td><p>a</p></td><td><p>b</p></td></tr></tbody></table><div data-lines="2"></div>',
    });
    const bytes = await renderPaperDocx(paper([section([a.id])]), db([a]), false);
    const xml = await (await JSZip.loadAsync(bytes)).file('word/document.xml')!.async('string');
    expect(xml).toContain('<w:b/>');
    expect(xml).toContain('w:val="superscript"');
    expect(xml).toContain('w:val="subscript"');
    expect(xml).toContain('<w:gridSpan w:val="2"/>');
    expect(xml).toContain('<w:tblHeader/>');
    expect(xml).toContain('•');
    expect(xml.match(/<w:tbl>/g)?.length).toBeGreaterThanOrEqual(1);
  });
});

describe('dragged sizes reach Word', () => {
  it('uses column widths from any row, scaled to the page', async () => {
    const a = q('short', 1, { stem: '<table><tbody><tr><th colspan="2"><p>Head</p></th></tr><tr><td colwidth="100"><p>a</p></td><td colwidth="300"><p>b</p></td></tr></tbody></table>' });
    const bytes = await renderPaperDocx(paper([section([a.id])]), db([a]), false);
    const xml = await (await JSZip.loadAsync(bytes)).file('word/document.xml')!.async('string');
    const grid = [...xml.matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].map((m) => Number(m[1]));
    expect(grid).toHaveLength(2);
    expect(grid[1] / grid[0]).toBeCloseTo(3, 1);
  });
});
