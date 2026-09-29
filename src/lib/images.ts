import type { ImageAsset } from '../shared/types';

/** URL an <img> can load: the stored file, or an embedded data URL (older data / not yet saved). */
export const imgSrc = (a: ImageAsset) => (a.file ? `qimg://img/${a.file}` : a.src ?? '');

export const imgType = (a: ImageAsset): 'png' | 'jpg' => (a.file ? (a.file.endsWith('.png') ? 'png' : 'jpg') : a.src?.startsWith('data:image/png') ? 'png' : 'jpg');

export function dataUrlToBytes(dataUrl: string) {
  return Uint8Array.from(atob(dataUrl.split(',')[1] ?? ''), (c) => c.charCodeAt(0));
}

function bytesToDataUrl(bytes: Uint8Array, mime: string) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${mime};base64,${btoa(bin)}`;
}

export async function imageBytes(a: ImageAsset): Promise<Uint8Array> {
  if (!a.file) return dataUrlToBytes(a.src ?? '');
  const res = await fetch(imgSrc(a));
  if (!res.ok) throw new Error(`Image ${a.file} is missing`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Saves an embedded (data URL) image as a file; returns the file-backed asset. */
export async function storeImage(a: ImageAsset): Promise<ImageAsset> {
  if (a.file || !a.src?.startsWith('data:')) return a;
  const file = `${a.id}.${a.src.startsWith('data:image/png') ? 'png' : 'jpg'}`;
  await window.qmaker.saveImage(file, dataUrlToBytes(a.src));
  return { id: a.id, w: a.w, h: a.h, file };
}

export async function storeImages(images: Record<string, ImageAsset> = {}) {
  const out: Record<string, ImageAsset> = {};
  for (const [id, a] of Object.entries(images)) out[id] = await storeImage(a);
  return out;
}

/** Share and backup files carry the pictures inside them so they work on another PC. */
export async function embedImages(images: Record<string, ImageAsset>) {
  const out: Record<string, ImageAsset> = {};
  for (const [id, a] of Object.entries(images)) {
    try {
      out[id] = a.file ? { id, w: a.w, h: a.h, src: bytesToDataUrl(await imageBytes(a), imgType(a) === 'png' ? 'image/png' : 'image/jpeg') } : a;
    } catch {
      // A missing file is skipped rather than failing the whole export.
    }
  }
  return out;
}
