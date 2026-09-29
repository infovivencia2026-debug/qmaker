import { useRef, type ClipboardEvent, type DragEvent } from 'react';
import type { ImageAlign } from '../shared/types';
import { useStore } from '../store';
import { defaultWidthMm, joinRich, parseRich, type Seg } from '../lib/rich';

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** Single line: Enter does not add a new line (options, match cells). */
  single?: boolean;
  className?: string;
  /** Boxed look for forms; default is the borderless on-paper look. */
  boxed?: boolean;
}

const ALIGNS: [ImageAlign, string, string][] = [
  ['inline', '⇥', 'In line with text'],
  ['left', '⬅', 'Left, on its own line'],
  ['center', '⬌', 'Centre, on its own line'],
  ['right', '➡', 'Right, text beside it'],
];

const imageFile = (files: FileList | undefined | null) => [...(files ?? [])].find((f) => f.type.startsWith('image/'));

/** Text that can hold images anywhere: paste a screenshot, drop a file, or use the 🖼 button. */
export default function RichInput({ value, onChange, placeholder, single, className = '', boxed }: Props) {
  const { db, addImage } = useStore();
  const segs = parseRich(value);
  const caret = useRef({ seg: segs.length - 1, pos: Infinity });
  const fileInput = useRef<HTMLInputElement>(null);

  const commit = (next: Seg[]) => onChange(joinRich(next));
  const setSeg = (i: number, patch: Partial<Seg>) => commit(segs.map((s, j) => (j === i ? ({ ...s, ...patch } as Seg) : s)));

  const insert = async (blob: Blob) => {
    const asset = await addImage(blob);
    if (!asset) return;
    const { seg, pos } = caret.current;
    const i = Math.min(seg, segs.length - 1);
    const target = segs[i];
    const text = target.kind === 'text' ? target.text : '';
    const at = Math.min(pos, text.length);
    const img: Seg = { kind: 'img', id: asset.id, width: defaultWidthMm(asset), align: single ? 'inline' : 'center' };
    commit([...segs.slice(0, i), { kind: 'text', text: text.slice(0, at) }, img, { kind: 'text', text: text.slice(at) }, ...segs.slice(i + 1)]);
  };

  const onPaste = (e: ClipboardEvent) => {
    const f = imageFile(e.clipboardData.files);
    if (!f) return;
    e.preventDefault();
    insert(f);
  };
  const onDrop = (e: DragEvent) => {
    const f = imageFile(e.dataTransfer.files);
    if (!f) return;
    e.preventDefault();
    e.stopPropagation();
    insert(f);
  };

  const removeImage = (i: number) => {
    // Merge the text on both sides back together.
    const before = segs[i - 1], after = segs[i + 1];
    if (before?.kind === 'text' && after?.kind === 'text') {
      commit([...segs.slice(0, i - 1), { kind: 'text', text: before.text + after.text }, ...segs.slice(i + 2)]);
    }
  };

  const hasImages = segs.length > 1;
  const renderSeg = (s: Seg, i: number) => {
    if (s.kind === 'text') {
      return (
        <textarea
          key={i}
          className={`ib ${!s.text && hasImages ? 'gap' : ''}`}
          rows={1}
          value={s.text}
          placeholder={value ? '' : placeholder}
          onChange={(e) => setSeg(i, { text: e.target.value })}
          onSelect={(e) => (caret.current = { seg: i, pos: e.currentTarget.selectionStart })}
          onFocus={(e) => (caret.current = { seg: i, pos: e.currentTarget.selectionStart })}
          onPaste={onPaste}
          onKeyDown={(e) => single && e.key === 'Enter' && e.preventDefault()}
        />
      );
    }
    const asset = db.images[s.id];
    return (
      <span key={i} className={`rimg al-${s.align}`} style={{ width: `${s.width}mm` }}>
        {asset ? <img src={asset.src} /> : <span className="missing">image missing</span>}
        <span className="rimg-bar" onMouseDown={(e) => e.preventDefault()}>
          {ALIGNS.map(([a, icon, title]) => (
            <button key={a} title={title} className={s.align === a ? 'on' : ''} onClick={() => setSeg(i, { align: a })}>{icon}</button>
          ))}
          <button title="Smaller" onClick={() => setSeg(i, { width: Math.max(8, s.width - 5) })}>−</button>
          <span className="rimg-w">{s.width}mm</span>
          <button title="Bigger" onClick={() => setSeg(i, { width: Math.min(180, s.width + 5) })}>+</button>
          <button title="Remove image" onClick={() => removeImage(i)}>🗑</button>
        </span>
      </span>
    );
  };
  // "Right" images print beside the text, so the editor shows them in a column on the right too.
  const side = segs.map((s, i) => [s, i] as const).filter(([s]) => s.kind === 'img' && s.align === 'right');
  const main = segs.map((s, i) => [s, i] as const).filter(([s]) => !(s.kind === 'img' && s.align === 'right'));
  return (
    <div className={`rich ${boxed ? 'boxed' : ''} ${hasImages ? 'has-img' : ''} ${className}`} onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
      {side.length ? (
        <div className="rich-split">
          <div className="rich-main">{main.map(([s, i]) => renderSeg(s, i))}</div>
          <div className="rich-side">{side.map(([s, i]) => renderSeg(s, i))}</div>
        </div>
      ) : (
        segs.map(renderSeg)
      )}
      <button className="rich-add" title="Insert image (or paste / drag one here)" onMouseDown={(e) => e.preventDefault()} onClick={() => fileInput.current?.click()}>🖼</button>
      <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => { const f = imageFile(e.target.files); if (f) insert(f); e.target.value = ''; }} />
    </div>
  );
}
