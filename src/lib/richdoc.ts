import type { ImageAsset } from '../shared/types';
import { esc } from './util';
import { groupCols, groupLabel, parseRich } from './rich';
import { imgSrc } from './images';

/**
 * Rich content (questions, options, answers, instructions) is stored as a small, safe subset of HTML
 * produced by the editor: paragraphs, bold/italic/underline/strike, sub/superscript, lists, tables,
 * images (by id) and answer-line blocks. Older content was plain text with [[img:…]] tokens; it is
 * converted on the fly, so nothing needs migrating.
 */

export const isHtml = (s: string) => s.trimStart().startsWith('<');

/** Old plain-text-with-tokens content → editor HTML. */
export function legacyToHtml(s: string): string {
  if (!s) return '';
  const paras: string[] = [];
  let cur = '';
  const flush = () => {
    paras.push(`<p>${cur}</p>`);
    cur = '';
  };
  const segs = parseRich(s);
  segs.forEach((seg, i) => {
    if (seg.kind === 'text') {
      let text = seg.text;
      const prev = segs[i - 1], next = segs[i + 1];
      const isBlock = (x?: typeof seg | (typeof segs)[number]) => (x?.kind === 'img' && x.align !== 'inline' && x.align !== 'right') || x?.kind === 'grp';
      if (isBlock(prev)) text = text.replace(/^\n/, '');
      if (isBlock(next)) text = text.replace(/\n$/, '');
      text.split('\n').forEach((line, k) => {
        if (k) flush();
        cur += esc(line);
      });
      return;
    }
    if (seg.kind === 'img') {
      const tag = `<img data-id="${seg.id}" data-width="${seg.width}" data-align="${seg.align}">`;
      if (seg.align === 'inline' || seg.align === 'right') cur += tag;
      else {
        if (cur) flush();
        paras.push(`<p>${tag}</p>`);
      }
      return;
    }
    // Image rows/grids become a borderless table: one picture (and its label/caption) per cell.
    if (cur) flush();
    const cols = groupCols(seg);
    const cells = seg.items.map((it, k) => {
      const cap = [groupLabel(seg.label, k), it.caption].filter(Boolean).join(' ');
      return `<td><p style="text-align: center"><img data-id="${it.id}" data-width="${seg.width || 25}" data-align="inline"></p>${cap ? `<p style="text-align: center">${esc(cap)}</p>` : ''}</td>`;
    });
    const rows: string[] = [];
    for (let r = 0; r < cells.length; r += cols) rows.push(`<tr>${cells.slice(r, r + cols).join('')}</tr>`);
    paras.push(`<table data-borderless="true"><tbody>${rows.join('')}</tbody></table>`);
  });
  if (cur || !paras.length) flush();
  return paras.join('');
}

export const toHtml = (s: string) => (isHtml(s) ? s : legacyToHtml(s));

// ---------- sanitising ----------

const ALLOWED: Record<string, string[]> = {
  P: ['style'], BR: [], STRONG: [], B: [], EM: [], I: [], U: [], S: [], SUB: [], SUP: [],
  UL: [], OL: ['start'], LI: [],
  TABLE: ['data-borderless', 'style'], TBODY: [], THEAD: [], TR: [], TD: ['colspan', 'rowspan', 'colwidth', 'style'], TH: ['colspan', 'rowspan', 'colwidth', 'style'],
  COLGROUP: [], COL: ['style'],
  IMG: ['data-id', 'data-width', 'data-align'],
  DIV: ['data-lines', 'data-box'],
  HR: [],
};
const RENAME: Record<string, string> = { B: 'STRONG', I: 'EM' };

/** Keeps only the tags/attributes the editor produces; everything else is unwrapped or dropped. */
function sanitizeNode(node: Node, doc: Document): Node[] {
  if (node.nodeType === 3) return [doc.createTextNode(node.textContent ?? '')];
  if (node.nodeType !== 1) return [];
  const el = node as Element;
  const tag = el.tagName.toUpperCase();
  if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META'].includes(tag)) return [];
  const kids = [...el.childNodes].flatMap((c) => sanitizeNode(c, doc));
  const allowed = ALLOWED[tag];
  if (!allowed || (tag === 'DIV' && !el.hasAttribute('data-lines') && !el.hasAttribute('data-box'))) return kids; // unknown wrapper: keep its content
  const out = doc.createElement(RENAME[tag] ?? tag);
  for (const a of allowed) {
    const v = el.getAttribute(a);
    if (v == null) continue;
    if (a === 'style') {
      // Only alignment (paragraphs) and widths/vertical alignment (cells) survive.
      const keep = v.split(';').map((x) => x.trim()).filter((x) => /^(text-align|vertical-align|width)\s*:\s*[a-z0-9.%\s-]+$/i.test(x));
      if (keep.length) out.setAttribute('style', keep.join('; '));
    } else out.setAttribute(a, v.replace(/[^\w\s.,%-]/g, ''));
  }
  kids.forEach((k) => out.appendChild(k));
  return [out];
}

/** Parses stored content (HTML or legacy) into a clean body element. */
export function richBody(s: string): HTMLElement {
  const doc = new DOMParser().parseFromString(`<body>${toHtml(s)}</body>`, 'text/html');
  const clean = doc.createElement('body');
  [...doc.body.childNodes].flatMap((n) => sanitizeNode(n, doc)).forEach((n) => clean.appendChild(n));
  return clean;
}

export const sanitizeRich = (s: string) => (s ? richBody(s).innerHTML : '');

// ---------- print HTML ----------

/** Stored content → HTML for the printed paper (image sources resolved, lines drawn, tables classed). */
export function renderRich(s: string, images: Record<string, ImageAsset>): string {
  if (!s) return '';
  const body = richBody(s);
  body.querySelectorAll('img[data-id]').forEach((img) => {
    const a = images[img.getAttribute('data-id') ?? ''];
    if (!a) return img.remove();
    img.setAttribute('src', imgSrc(a));
    img.setAttribute('class', `qi al-${img.getAttribute('data-align') ?? 'inline'}`);
    img.setAttribute('style', `width:${Number(img.getAttribute('data-width')) || 30}mm`);
  });
  body.querySelectorAll('div[data-lines]').forEach((d) => {
    const n = Math.min(Number(d.getAttribute('data-lines')) || 0, 60);
    d.setAttribute('class', 'lines');
    d.innerHTML = '<div></div>'.repeat(n);
  });
  body.querySelectorAll('div[data-box]').forEach((d) => {
    d.setAttribute('class', 'drawbox');
    d.setAttribute('style', `height:${Math.min(Number(d.getAttribute('data-box')) || 40, 250)}mm`);
  });
  body.querySelectorAll('table').forEach((t) => t.setAttribute('class', t.getAttribute('data-borderless') === 'true' ? 'rt borderless' : 'rt'));
  // Empty paragraphs would collapse; keep them as blank lines like the editor shows.
  body.querySelectorAll('p').forEach((p) => {
    if (!p.childNodes.length) p.innerHTML = '<br>';
  });
  return body.innerHTML;
}

/** Like renderRich, but a lone paragraph comes back unwrapped so it can follow "(a) " on the same line. */
export function renderRichInline(s: string, images: Record<string, ImageAsset>): string {
  const html = renderRich(s, images);
  const m = /^<p(?: style="[^"]*")?>([\s\S]*?)<\/p>$/.exec(html);
  return m && !m[1].includes('<p') ? m[1] : html;
}

// ---------- queries used by layout and lists ----------

const decode = (s: string) => s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

/** One-line text for lists and summaries. */
export function richPlain(s: string): string {
  if (!isHtml(s)) return s.replace(/\[\[imgs?:[^\]]*\]\]/g, '🖼').trim();
  return decode(s.replace(/<img[^>]*>/g, '🖼').replace(/<\/(p|li|tr|td|th)>/g, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

export const richHasImage = (s: string) => /<img\b|\[\[imgs?:/.test(s);

/** Widest picture in mm (tables count as their width) — used to choose option columns. */
export function richMaxImageWidth(s: string): number {
  if (!isHtml(s)) return 0;
  if (/<table\b/.test(s)) return 180;
  return Math.max(0, ...[...s.matchAll(/data-width="(\d+(?:\.\d+)?)"/g)].map((m) => Number(m[1])));
}

export const richImageIds = (s: string) => [...s.matchAll(/data-id="([A-Za-z0-9-]+)"/g)].map((m) => m[1]);
