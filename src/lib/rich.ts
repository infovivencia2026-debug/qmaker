import type { ImageAlign, ImageAsset } from '../shared/types';
import { esc, uid } from './util';
import { imgSrc, storeImage } from './images';

/**
 * Any text in QMaker (question, option, match cell, answer, instruction) can hold pictures as tokens,
 * so every template supports images without special fields:
 *   [[img:<id>|<width mm>|<align>]]                         one image
 *   [[imgs:<id>~<caption>,…|<cols>|<width mm>|<label>|<align>]]  a row/grid of images
 * cols 0 = all in one row; width 0 = fit the row; captions are URI-encoded.
 */
const TOKEN_RE =
  /\[\[img:([A-Za-z0-9-]+)\|(\d+(?:\.\d+)?)\|(inline|left|center|right)\]\]|\[\[imgs:([^|\]]*)\|(\d+)\|(\d+(?:\.\d+)?)\|(none|a|i|1|A)\|(left|center)\]\]/g;

export type GroupLabel = 'none' | 'a' | 'i' | '1' | 'A';
export interface GroupItem { id: string; caption: string }
export interface ImageGroup { items: GroupItem[]; cols: number; width: number; label: GroupLabel; align: 'left' | 'center' }

export type Seg =
  | { kind: 'text'; text: string }
  | { kind: 'img'; id: string; width: number; align: ImageAlign }
  | ({ kind: 'grp' } & ImageGroup);

export const imgToken = (id: string, width: number, align: ImageAlign) => `[[img:${id}|${width}|${align}]]`;

export const groupToken = (g: ImageGroup) =>
  `[[imgs:${g.items.map((it) => `${it.id}~${encodeURIComponent(it.caption)}`).join(',')}|${g.cols}|${g.width}|${g.label}|${g.align}]]`;

function parseItems(list: string): GroupItem[] {
  return list.split(',').filter(Boolean).map((part) => {
    const cut = part.indexOf('~');
    const id = cut < 0 ? part : part.slice(0, cut);
    let caption = '';
    try {
      caption = cut < 0 ? '' : decodeURIComponent(part.slice(cut + 1));
    } catch {
      caption = part.slice(cut + 1);
    }
    return { id, caption };
  });
}

/** Always alternates text, picture, text, … and starts and ends with text, so editors have a place to type. */
export function parseRich(s: string): Seg[] {
  const segs: Seg[] = [];
  let last = 0;
  for (const m of s.matchAll(TOKEN_RE)) {
    segs.push({ kind: 'text', text: s.slice(last, m.index) });
    if (m[1]) segs.push({ kind: 'img', id: m[1], width: Number(m[2]), align: m[3] as ImageAlign });
    else segs.push({ kind: 'grp', items: parseItems(m[4]), cols: Number(m[5]), width: Number(m[6]), label: m[7] as GroupLabel, align: m[8] as 'left' | 'center' });
    last = m.index! + m[0].length;
  }
  segs.push({ kind: 'text', text: s.slice(last) });
  return segs;
}

export const joinRich = (segs: Seg[]) =>
  segs.map((s) => (s.kind === 'text' ? s.text : s.kind === 'img' ? imgToken(s.id, s.width, s.align) : groupToken(s))).join('');

export const hasImage = (s: string) => new RegExp(TOKEN_RE.source).test(s);

export const plainText = (s: string) => s.replace(TOKEN_RE, '🖼').trim();

const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii', 'xiii', 'xiv', 'xv', 'xvi', 'xvii', 'xviii', 'xix', 'xx'];
export function groupLabel(label: GroupLabel, i: number) {
  if (label === 'none') return '';
  if (label === 'i') return `(${ROMAN[i] ?? i + 1})`;
  if (label === '1') return `(${i + 1})`;
  return `(${String.fromCharCode((label === 'A' ? 65 : 97) + (i % 26))})`;
}

/** Columns actually used: "0" means everything in one row. */
export const groupCols = (g: ImageGroup) => Math.max(1, Math.min(g.cols || g.items.length, g.items.length || 1));

/** Widest image in the text, in mm (0 if none). A group counts as its full row width. */
export function maxImageWidth(s: string) {
  return Math.max(0, ...parseRich(s).map((x) => (x.kind === 'img' ? x.width : x.kind === 'grp' ? (x.width || 20) * groupCols(x) : 0)));
}

/** Every image id referenced anywhere inside a value (strings, arrays, objects). */
export function collectImageIds(value: unknown, out = new Set<string>()) {
  if (typeof value === 'string') {
    // Editor HTML references pictures as <img data-id="…">; older text uses [[img:…]] tokens.
    for (const m of value.matchAll(/data-id="([A-Za-z0-9-]+)"/g)) out.add(m[1]);
    for (const seg of parseRich(value)) {
      if (seg.kind === 'img') out.add(seg.id);
      else if (seg.kind === 'grp') seg.items.forEach((it) => out.add(it.id));
    }
  } else if (Array.isArray(value)) value.forEach((v) => collectImageIds(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => collectImageIds(v, out));
  return out;
}

/** A block image already starts a new line, so one newline typed next to it would print as a blank line. */
function trimAroundBlocks(segs: Seg[]) {
  return segs.map((seg, i) => {
    if (seg.kind !== 'text') return seg;
    const isBlock = (x?: Seg) => (x?.kind === 'img' && x.align !== 'inline') || x?.kind === 'grp';
    let text = seg.text;
    if (isBlock(segs[i - 1])) text = text.replace(/^\n/, '');
    if (isBlock(segs[i + 1])) text = text.replace(/\n$/, '');
    return { ...seg, text };
  });
}

/** A row/grid of pictures with optional (a)(b)… labels and captions under each. */
export function groupHtml(g: ImageGroup, images: Record<string, ImageAsset>) {
  const cols = groupCols(g);
  const track = g.width ? `${g.width}mm` : 'minmax(0, 1fr)';
  const cells = g.items.map((it, i) => {
    const img = images[it.id];
    const label = groupLabel(g.label, i);
    const cap = [label, it.caption].filter(Boolean).join(' ');
    return `<figure>${img ? `<img src="${esc(imgSrc(img))}" />` : ''}${cap ? `<figcaption>${esc(cap)}</figcaption>` : ''}</figure>`;
  });
  return `<div class="igrp al-${g.align}" style="grid-template-columns: repeat(${cols}, ${track})">${cells.join('')}</div>`;
}

export function richHtml(s: string, images: Record<string, ImageAsset>) {
  return trimAroundBlocks(parseRich(s))
    .map((seg) => {
      if (seg.kind === 'text') return esc(seg.text);
      if (seg.kind === 'grp') return groupHtml(seg, images);
      const img = images[seg.id];
      if (!img) return '';
      return `<img class="qi al-${seg.align}" style="width:${seg.width}mm" src="${esc(imgSrc(img))}" />`;
    })
    .join('');
}

// ---------- adding images ----------

const MAX_PX = 1400;

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Not a readable image'));
    img.src = src;
  });
}

const readAsDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

/**
 * Downscales big photos/screenshots so papers stay small enough to share on WhatsApp.
 * Line diagrams stay PNG (sharp edges); large photos become JPEG.
 */
export async function imageFromBlob(blob: Blob): Promise<ImageAsset> {
  const img = await loadImage(await readAsDataUrl(blob));
  const scale = Math.min(1, MAX_PX / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff'; // transparent areas print white rather than black in JPEG/Word
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  let src = canvas.toDataURL('image/png');
  if (src.length > 500_000) src = canvas.toDataURL('image/jpeg', 0.88);
  return storeImage({ id: uid(), src, w, h });
}

/** Default print width: fits small icons small and caps big pictures at a sensible size. */
export function defaultWidthMm(a: ImageAsset) {
  const naturalMm = (a.w / 96) * 25.4;
  return Math.round(Math.min(70, Math.max(20, naturalMm)));
}
