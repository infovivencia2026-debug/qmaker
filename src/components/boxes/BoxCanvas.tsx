import { createContext, useContext, useState, type DragEvent, type ReactNode } from 'react';
import { findBox, marksLabel, printOrder, type Box } from '../../lib/box';
import { optionGrid } from '../../lib/paper';
import RichInput from '../RichInput';

/** Everything the canvas can do to the tree; the owner (paper or library editor) implements it. */
export interface CanvasOps {
  root: Box;
  selected: string | null;
  select: (id: string | null) => void;
  update: (id: string, patch: Partial<Box>) => void;
  remove: (id: string) => void;
  move: (id: string, parentId: string, index: number) => void;
  duplicate: (id: string) => void;
  saveToLibrary?: (id: string) => void;
  openInserter: (parentId: string, index: number) => void;
  labels: Map<string, string>;
  marksWord: string;
  orWord: string;
  bilingual: boolean;
  readOnly?: boolean;
}

const Ctx = createContext<CanvasOps | null>(null);
const useOps = () => useContext(Ctx)!;

let dragId: string | null = null;

/** Thin drop/insert line between boxes: hover shows +, dropping a dragged box moves it here. */
function Between({ parentId, index }: { parentId: string; index: number }) {
  const ops = useOps();
  const [over, setOver] = useState(false);
  if (ops.readOnly) return null;
  return (
    <div
      className={`bt ${over ? 'over' : ''}`}
      onDragOver={(e: DragEvent) => { if (dragId) { e.preventDefault(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (dragId) ops.move(dragId, parentId, index); dragId = null; }}
    >
      <button title="Insert here" onMouseDown={(e) => e.stopPropagation()} onClick={() => ops.openInserter(parentId, index)}>+</button>
    </div>
  );
}

function BoxBar({ b }: { b: Box }) {
  const ops = useOps();
  const f = findBox(ops.root, b.id);
  if (!f?.parent) return null;
  const { parent, index } = f;
  const prev = parent.children?.[index - 1];
  const grand = findBox(ops.root, parent.id)?.parent;
  return (
    <div className="bbar" onMouseDown={(e) => e.stopPropagation()}>
      <span
        className="bbar-drag"
        draggable
        title="Drag to move"
        onDragStart={(e) => { dragId = b.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', b.id); }}
        onDragEnd={() => (dragId = null)}
      >⠿</span>
      <span className="bbar-name">{b.name || (b.number ? 'Numbered box' : b.children?.length ? 'Box' : 'Text')}</span>
      <button title="Move up" disabled={index === 0} onClick={() => ops.move(b.id, parent.id, index - 1)}>↑</button>
      <button title="Move down" disabled={index >= (parent.children?.length ?? 1) - 1} onClick={() => ops.move(b.id, parent.id, index + 2)}>↓</button>
      <button title="Move out of this box" disabled={!grand} onClick={() => grand && ops.move(b.id, grand.id, (grand.children ?? []).findIndex((c) => c.id === parent.id) + 1)}>⇤</button>
      <button title="Move into the box above" disabled={!prev} onClick={() => prev && ops.move(b.id, prev.id, prev.children?.length ?? 0)}>⇥</button>
      <button title="Duplicate" onClick={() => ops.duplicate(b.id)}>⧉</button>
      {ops.saveToLibrary && <button title="Save to library" onClick={() => ops.saveToLibrary!(b.id)}>☆</button>}
      <button title="Delete" onClick={() => ops.remove(b.id)}>🗑</button>
    </div>
  );
}

function Children({ b }: { b: Box }) {
  const ops = useOps();
  const kids = printOrder(b, true); // edit in the real order; shuffling happens only on the printed paper
  const cells: ReactNode[] = kids.map((c, i) => (
    <div key={c.id} className="bcell">
      {b.layout?.mode !== 'grid' && <Between parentId={b.id} index={i} />}
      <EditBox b={c} />
      {b.choice && i < kids.length - 1 && <div className="or-div"><span>{ops.orWord}</span></div>}
    </div>
  ));
  const tail = !ops.readOnly && (
    <div className="bt-end">
      <Between parentId={b.id} index={kids.length} />
    </div>
  );
  if (b.layout?.mode === 'grid') {
    const g = optionGrid(kids.length, b.layout.cols || kids.length || 1, b.layout.order ?? 'across');
    const cols = b.layout.widths?.length === g.cols ? b.layout.widths.map((w) => `minmax(0, ${w}fr)`).join(' ') : `repeat(${g.cols}, minmax(0, 1fr))`;
    return (
      <>
        <div className="bgrid" style={{ gridTemplateColumns: cols, ...(b.layout.gapMm != null ? { gap: `${b.layout.gapMm}mm` } : {}) }}>
          {g.cells.map((i, k) => (i === null ? <div key={`e${k}`} /> : cells[i]))}
        </div>
        {tail}
      </>
    );
  }
  return (
    <>
      {cells}
      {tail}
    </>
  );
}

/** One box on the page, edited in place, drawn like it prints. */
export function EditBox({ b }: { b: Box }) {
  const ops = useOps();
  const sel = ops.selected === b.id;
  const num = ops.labels.get(b.id) ?? '';
  const marks = marksLabel(b, ops.marksWord);
  const s = b.style ?? {};
  const textStyle: React.CSSProperties = {
    textAlign: s.align, fontWeight: s.bold ? 700 : undefined, fontStyle: s.italic ? 'italic' : undefined,
    fontSize: s.scale && s.scale !== 1 ? `calc(var(--fs) * ${s.scale})` : undefined,
  };
  const hasContent = b.content !== undefined;
  const content = hasContent && (
    <div className="bc" style={textStyle}>
      <RichInput value={b.content ?? ''} placeholder={b.children?.length ? 'Text (optional)' : 'Type here…'} onChange={(v) => ops.update(b.id, { content: v })} />
      {ops.bilingual && <RichInput className="second" value={b.content2 ?? ''} placeholder="second language" onChange={(v) => ops.update(b.id, { content2: v })} />}
    </div>
  );
  const kids = <Children b={b} />;
  const tags = [
    b.visible === 'key' && <span key="k" className="btag key">Answer key only</span>,
    b.visible === 'paper' && <span key="p" className="btag">Paper only</span>,
    b.correct && <span key="c" className="btag ok">✓ correct</span>,
    b.shuffle && <span key="s" className="btag">shuffled when printed</span>,
    s.pageBreak && <span key="pb" className="btag">page break before</span>,
  ].filter(Boolean);
  const cls = ['ebx', sel && 'sel', s.border && 'bordered', b.visible === 'key' && 'keyonly', b.correct && 'correct'].filter(Boolean).join(' ');
  const style: React.CSSProperties = { padding: s.paddingMm ? `${s.paddingMm}mm` : undefined, marginTop: s.spaceBefore ? `${s.spaceBefore}pt` : b.number?.scope === 'paper' ? 'var(--gap)' : undefined };
  const onDown = (e: React.MouseEvent) => { e.stopPropagation(); ops.select(b.id); };

  if (s.rule) {
    return (
      <div className={`${cls} heading`} style={style} onMouseDown={onDown}>
        {sel && !ops.readOnly && <BoxBar b={b} />}
        <div className="bh" style={textStyle}><span className="bh-t">{num && <span className="bh-n">{num}</span>}{content}</span><span className="bh-m">{marks}</span></div>
        {tags.length > 0 && <div className="btags">{tags}</div>}
        {kids}
      </div>
    );
  }
  const body = (
    <>
      {content}
      {tags.length > 0 && <div className="btags">{tags}</div>}
      {kids}
    </>
  );
  if (num || marks) {
    return (
      <div className={`${cls} numbered`} style={style} onMouseDown={onDown}>
        {sel && !ops.readOnly && <BoxBar b={b} />}
        <div className="qn">{num}</div>
        <div className="bb">{body}</div>
        <div className="qm">{marks}</div>
      </div>
    );
  }
  return (
    <div className={cls} style={style} onMouseDown={onDown}>
      {sel && !ops.readOnly && <BoxBar b={b} />}
      {body}
    </div>
  );
}

/** The editable page body: every top-level box, with insert points between them. */
export default function BoxCanvas({ ops }: { ops: CanvasOps }) {
  return (
    <Ctx.Provider value={ops}>
      <div className="bcanvas">
        <Children b={ops.root} />
      </div>
    </Ctx.Provider>
  );
}
