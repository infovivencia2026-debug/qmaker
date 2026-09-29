import { useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { useStore } from '../../store';
import { insertImages } from '../RichInput';
import { useActiveEditor } from './activeEditor';
import ImagePicker from '../images/ImagePicker';

const SYMBOLS = '√ ∛ π ° ± × ÷ = ≠ ≈ ≤ ≥ < > ∞ ∠ △ ⊥ ∥ ∴ ∵ ∈ ∉ ⊂ ∪ ∩ ∅ α β γ δ θ λ μ σ ω Ω Σ Δ → ← ↔ ⇌ ↑ ↓ ½ ⅓ ¼ ¾ ² ³ ₂ ₃ ⁻ ✓ ✗ ☐ ★ ₹ %'.split(' ');

function Btn({ on, title, onClick, children, disabled }: { on?: boolean; title: string; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button className={`tb ${on ? 'on' : ''}`} title={title} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      {children}
    </button>
  );
}

/** Pick a table size by hovering a grid, like Word. */
function TablePicker({ onPick }: { onPick: (rows: number, cols: number, borderless: boolean) => void }) {
  const [h, setH] = useState({ r: 2, c: 2 });
  const [borderless, setBorderless] = useState(false);
  return (
    <div className="tpick">
      <div className="tpick-grid" onMouseLeave={() => setH({ r: 2, c: 2 })}>
        {Array.from({ length: 8 }, (_, r) => (
          <div key={r} className="tpick-row">
            {Array.from({ length: 10 }, (_, c) => (
              <span key={c} className={r < h.r && c < h.c ? 'on' : ''} onMouseEnter={() => setH({ r: r + 1, c: c + 1 })} onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(r + 1, c + 1, borderless)} />
            ))}
          </div>
        ))}
      </div>
      <div className="tpick-l">{h.r} × {h.c}</div>
      <label className="check"><input type="checkbox" checked={borderless} onChange={(e) => setBorderless(e.target.checked)} /> No borders (layout grid)</label>
    </div>
  );
}

function insertTable(editor: Editor, rows: number, cols: number, borderless: boolean) {
  // The built-in command puts the cursor in the first cell, ready to type.
  const chain = editor.chain().focus().insertTable({ rows, cols, withHeaderRow: false });
  (borderless ? chain.updateAttributes('table', { borderless: true }) : chain).run();
}

/** Word-style ribbon acting on whichever text box has the cursor. */
export default function Toolbar() {
  const editor = useActiveEditor();
  const { addImage } = useStore();
  const [menu, setMenu] = useState<null | 'insert' | 'table' | 'symbols'>(null);
  const [storeOpen, setStoreOpen] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const multi = useRef(false);

  const e = editor;
  const c = () => e!.chain().focus();
  const disabled = !e;
  const inTable = !!e?.isActive('table');
  const close = () => setMenu(null);

  return (
    <div className={`ribbon ${disabled ? 'off' : ''}`} onMouseDown={(ev) => ev.preventDefault()}>
      <div className="rb-group">
        <Btn title="Bold (Ctrl+B)" on={e?.isActive('bold')} disabled={disabled} onClick={() => c().toggleBold().run()}><b>B</b></Btn>
        <Btn title="Italic (Ctrl+I)" on={e?.isActive('italic')} disabled={disabled} onClick={() => c().toggleItalic().run()}><i>I</i></Btn>
        <Btn title="Underline (Ctrl+U)" on={e?.isActive('underline')} disabled={disabled} onClick={() => c().toggleUnderline().run()}><u>U</u></Btn>
        <Btn title="Strikethrough" on={e?.isActive('strike')} disabled={disabled} onClick={() => c().toggleStrike().run()}><s>S</s></Btn>
        <Btn title="Subscript (H₂O)" on={e?.isActive('subscript')} disabled={disabled} onClick={() => c().toggleSubscript().run()}>x₂</Btn>
        <Btn title="Superscript (x²)" on={e?.isActive('superscript')} disabled={disabled} onClick={() => c().toggleSuperscript().run()}>x²</Btn>
      </div>
      <div className="rb-group">
        {(['left', 'center', 'right', 'justify'] as const).map((a) => (
          <Btn key={a} title={`Align ${a}`} on={e?.isActive({ textAlign: a })} disabled={disabled} onClick={() => c().setTextAlign(a).run()}>
            {{ left: '⇤', center: '↔', right: '⇥', justify: '☰' }[a]}
          </Btn>
        ))}
      </div>
      <div className="rb-group">
        <Btn title="Bullet list" on={e?.isActive('bulletList')} disabled={disabled} onClick={() => c().toggleBulletList().run()}>• ≡</Btn>
        <Btn title="Numbered list" on={e?.isActive('orderedList')} disabled={disabled} onClick={() => c().toggleOrderedList().run()}>1. ≡</Btn>
      </div>
      <div className="rb-group rel">
        <Btn title="Insert table or layout grid" on={menu === 'table'} disabled={disabled} onClick={() => setMenu(menu === 'table' ? null : 'table')}>▦ Table ▾</Btn>
        {menu === 'table' && e && <div className="rb-pop"><TablePicker onPick={(r, col, b) => { insertTable(e, r, col, b); close(); }} /></div>}
      </div>
      <div className="rb-group rel">
        <Btn title="Insert elements" on={menu === 'insert'} disabled={disabled} onClick={() => setMenu(menu === 'insert' ? null : 'insert')}>＋ Insert ▾</Btn>
        {menu === 'insert' && e && (
          <div className="rb-pop rb-list">
            <button onMouseDown={(ev) => ev.preventDefault()} onClick={() => { multi.current = false; file.current?.click(); close(); }}>🖼 Image</button>
            <button onMouseDown={(ev) => ev.preventDefault()} onClick={() => { multi.current = true; file.current?.click(); close(); }}>🖼🖼 Row of images (pick several)</button>
            <button onMouseDown={(ev) => ev.preventDefault()} onClick={() => { setStoreOpen(true); close(); }}>🗂 From image store (search by name)…</button>
            <button onMouseDown={(ev) => ev.preventDefault()} onClick={() => { insertTable(e, 1, 2, true); close(); }}>▥ Two columns (layout grid)</button>
            <button onMouseDown={(ev) => ev.preventDefault()} onClick={() => { insertTable(e, 1, 3, true); close(); }}>▥ Three columns (layout grid)</button>
            <button onMouseDown={(ev) => ev.preventDefault()} onClick={() => { c().insertContent({ type: 'answerLines', attrs: { lines: 3 } }).run(); close(); }}>☰ Answer lines</button>
            <button onMouseDown={(ev) => ev.preventDefault()} onClick={() => { c().insertContent({ type: 'drawBox', attrs: { height: 40 } }).run(); close(); }}>▭ Drawing box</button>
            <button onMouseDown={(ev) => ev.preventDefault()} onClick={() => { c().setHorizontalRule().run(); close(); }}>― Horizontal line</button>
            <button onMouseDown={(ev) => ev.preventDefault()} onClick={() => { c().insertContent('________').run(); close(); }}>__ Blank to fill</button>
            <button onMouseDown={(ev) => ev.preventDefault()} onClick={() => { c().insertContent('☐ ').run(); close(); }}>☐ Checkbox</button>
            <button onMouseDown={(ev) => ev.preventDefault()} onClick={() => { c().setHardBreak().run(); close(); }}>↵ Line break (Shift+Enter)</button>
          </div>
        )}
      </div>
      <div className="rb-group rel">
        <Btn title="Symbols" on={menu === 'symbols'} disabled={disabled} onClick={() => setMenu(menu === 'symbols' ? null : 'symbols')}>Ω ▾</Btn>
        {menu === 'symbols' && e && (
          <div className="rb-pop rb-symbols">
            {SYMBOLS.map((s) => <button key={s} onMouseDown={(ev) => ev.preventDefault()} onClick={() => c().insertContent(s).run()}>{s}</button>)}
          </div>
        )}
      </div>
      {inTable && (
        <div className="rb-group rb-table">
          <span className="rb-l">Table</span>
          <Btn title="Row above" onClick={() => c().addRowBefore().run()}>↥ Row</Btn>
          <Btn title="Row below" onClick={() => c().addRowAfter().run()}>↧ Row</Btn>
          <Btn title="Column left" onClick={() => c().addColumnBefore().run()}>↤ Col</Btn>
          <Btn title="Column right" onClick={() => c().addColumnAfter().run()}>↦ Col</Btn>
          <Btn title="Delete row" onClick={() => c().deleteRow().run()}>✕ Row</Btn>
          <Btn title="Delete column" onClick={() => c().deleteColumn().run()}>✕ Col</Btn>
          <Btn title="Merge selected cells (drag across cells first)" disabled={!e?.can().mergeCells()} onClick={() => c().mergeCells().run()}>Merge</Btn>
          <Btn title="Split cell" disabled={!e?.can().splitCell()} onClick={() => c().splitCell().run()}>Split</Btn>
          <Btn title="Header row" onClick={() => c().toggleHeaderRow().run()}>Header</Btn>
          <Btn title="Borders on/off" on={!e?.getAttributes('table').borderless} onClick={() => c().updateAttributes('table', { borderless: !e?.getAttributes('table').borderless }).run()}>▦ Borders</Btn>
          <Btn title="Delete table" onClick={() => c().deleteTable().run()}>🗑</Btn>
        </div>
      )}
      <div className="rb-group">
        <Btn title="Clear formatting" disabled={disabled} onClick={() => c().unsetAllMarks().setTextAlign('left').run()}>⌫ Aa</Btn>
      </div>
      {disabled && <span className="rb-hint">Click into any text on the paper to format it.</span>}
      <input
        ref={file}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(ev) => {
          const files = [...(ev.target.files ?? [])].filter((f) => f.type.startsWith('image/'));
          if (e && files.length) insertImages(e, multi.current ? files : files.slice(0, 1), addImage);
          ev.target.value = '';
        }}
      />
      {menu && <div className="rb-shade" onMouseDown={close} />}
      {storeOpen && e && (
        <ImagePicker
          onClose={() => setStoreOpen(false)}
          onPick={(ids) => {
            setStoreOpen(false);
            if (ids.length === 1) c().insertContent({ type: 'qimage', attrs: { id: ids[0], width: 40, align: 'inline' } }).run();
            else c().insertContent(`<table data-borderless="true"><tbody><tr>${ids.map((id) => `<td><p style="text-align: center"><img data-id="${id}" data-width="25" data-align="inline"></p></td>`).join('')}</tr></tbody></table><p></p>`).run();
          }}
        />
      )}
    </div>
  );
}
