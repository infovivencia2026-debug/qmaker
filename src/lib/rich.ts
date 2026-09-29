import type { ImageAlign, ImageAsset } from '../shared/types';
import { esc, uid } from './util';

/**
 * Any text in QMaker (question, option, match cell, answer, instruction) can hold images as
 * [[img:<id>|<width mm>|<align>]] tokens, so every template supports images without special fields.
 */
const IMG_RE = /\[\[img:([A-Za-z0-9-]+)\|(\d+(?:\.\d+)?)\|(inline|left|center|right)\]\]/g;

export type Seg = { kind: 'text'; text: string } | { kind: 'img'; id: string; width: number; align: ImageAlign };

export const imgToken = (id: string, width: number, align: ImageAlign) => `[[img:${id}|${width}|${align}]]`;

/** Always alternates text, img, text, … and starts and ends with text, so editors have a place to type. */
export function parseRich(s: string): Seg[] {
  const segs: Seg[] = [];
  let last = 0;
  for (const m of s.matchAll(IMG_RE)) {
    segs.push({ kind: 'text', text: s.slice(last, m.index) });
    segs.push({ kind: 'img', id: m[1], width: Number(m[2]), align: m[3] as ImageAlign });
    last = m.index! + m[0].length;
  }
  segs.push({ kind: 'text', text: s.slice(last) });
  return segs;
}

export const joinRich = (segs: Seg[]) => segs.map((s) => (s.kind === 'text' ? s.text : imgToken(s.id, s.width, s.align))).join('');

export const hasImage = (s: string) => new RegExp(IMG_RE.source).test(s);

export const plainText = (s: string) => s.replace(IMG_RE, '🖼').trim();

/** Widest image in the text, in mm (0 if none). */
export function maxImageWidth(s: string) {
  return Math.max(0, ...parseRich(s).map((x) => (x.kind === 'img' ? x.width : 0)));
}

/** Every image id referenced anywhere inside a value (strings, arrays, objects). */
export function collectImageIds(value: unknown, out = new Set<string>()) {
  if (typeof value === 'string') for (const m of value.matchAll(IMG_RE)) out.add(m[1]);
  else if (Array.isArray(value)) value.forEach((v) => collectImageIds(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => collectImageIds(v, out));
  return out;
}

/** A block image already starts a new line, so one newline typed next to it would print as a blank line. */
function trimAroundBlocks(segs: Seg[]) {
  return segs.map((seg, i) => {
    if (seg.kind !== 'text') return seg;
    const isBlock = (x?: Seg) => x?.kind === 'img' && x.align !== 'inline';
    let text = seg.text;
    if (isBlock(segs[i - 1])) text = text.replace(/^\n/, '');
    if (isBlock(segs[i + 1])) text = text.replace(/\n$/, '');
    return { ...seg, text };
  });
}

export function richHtml(s: string, images: Record<string, ImageAsset>) {
  return trimAroundBlocks(parseRich(s))
    .map((seg) => {
      if (seg.kind === 'text') return esc(seg.text);
      const img = images[seg.id];
      if (!img) return '';
      return `<img class="qi al-${seg.align}" style="width:${seg.width}mm" src="${img.src}" />`;
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
  return { id: uid(), src, w, h };
}

/** Default print width: fits small icons small and caps big pictures at a sensible size. */
export function defaultWidthMm(a: ImageAsset) {
  const naturalMm = (a.w / 96) * 25.4;
  return Math.round(Math.min(70, Math.max(20, naturalMm)));
}
