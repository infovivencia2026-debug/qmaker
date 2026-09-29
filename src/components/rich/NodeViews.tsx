import type { PointerEvent as RPointerEvent } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { useStore } from '../../store';
import { imgSrc } from '../../lib/images';

/** Screen pixels per printed millimetre: the A4 sheet is 210 mm wide, forms use the CSS default. */
function pxPerMm(el: Element) {
  const sheet = el.closest('.sheet');
  return sheet ? sheet.getBoundingClientRect().width / 210 : 96 / 25.4;
}

/** Drag helper: calls onMove with the pointer's travel (px) from where the drag started.
 * Listens on the window, because the handle is redrawn while its node's size changes. */
function startDrag(e: RPointerEvent, onMove: (dx: number, dy: number, perMm: number) => void) {
  e.preventDefault();
  e.stopPropagation();
  const perMm = pxPerMm(e.currentTarget as Element);
  const x0 = e.clientX, y0 = e.clientY;
  const move = (ev: PointerEvent) => onMove(ev.clientX - x0, ev.clientY - y0, perMm);
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    document.body.classList.remove('dragging');
  };
  document.body.classList.add('dragging');
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

const ALIGNS: [string, string, string][] = [
  ['inline', '⇥', 'In line with text'],
  ['left', '⬅', 'Left, on its own line'],
  ['center', '⬌', 'Centre, on its own line'],
  ['right', '➡', 'Right, text wraps beside it'],
];

/** Picture inside the editor, with a hover bar for position and size. */
export function ImageView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const { db } = useStore();
  const asset = db.images[node.attrs.id];
  const width = Number(node.attrs.width) || 40;
  return (
    <NodeViewWrapper as="span" className={`ed-img al-${node.attrs.align} ${selected ? 'sel' : ''}`} style={{ width: `${width}mm` }}>
      {asset ? <img src={imgSrc(asset)} draggable={false} /> : <span className="missing">image missing</span>}
      <span className="ed-img-bar" contentEditable={false} onMouseDown={(e) => e.preventDefault()}>
        {ALIGNS.map(([a, icon, title]) => (
          <button key={a} title={title} className={node.attrs.align === a ? 'on' : ''} onClick={() => updateAttributes({ align: a })}>{icon}</button>
        ))}
        <button title="Smaller" onClick={() => updateAttributes({ width: Math.max(5, width - 5) })}>−</button>
        <span className="ed-img-w">{width}mm</span>
        <button title="Bigger" onClick={() => updateAttributes({ width: Math.min(180, width + 5) })}>+</button>
        <button title="Remove image" onClick={deleteNode}>🗑</button>
      </span>
      <span
        className="ed-handle corner"
        contentEditable={false}
        title="Drag to resize"
        onPointerDown={(e) => startDrag(e, (dx, _dy, perMm) => updateAttributes({ width: Math.round(Math.min(180, Math.max(5, width + dx / perMm))) }))}
      />
    </NodeViewWrapper>
  );
}

export function LinesView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const n = Math.min(Number(node.attrs.lines) || 1, 60);
  return (
    <NodeViewWrapper className={`ed-block ${selected ? 'sel' : ''}`}>
      <div className="lines" contentEditable={false}>{Array.from({ length: n }, (_, i) => <div key={i} />)}</div>
      <span
        className="ed-handle bottom"
        contentEditable={false}
        title="Drag to add or remove lines"
        onPointerDown={(e) => {
          const line = (e.currentTarget.parentElement?.querySelector('.lines > div') as HTMLElement | null)?.getBoundingClientRect().height || 25;
          startDrag(e, (_dx, dy) => updateAttributes({ lines: Math.min(60, Math.max(1, n + Math.round(dy / line))) }));
        }}
      />
      <span className="ed-block-bar" contentEditable={false} onMouseDown={(e) => e.preventDefault()}>
        Answer lines · drag the bottom edge
        <button onClick={() => updateAttributes({ lines: Math.max(1, n - 1) })}>−</button>
        <b>{n}</b>
        <button onClick={() => updateAttributes({ lines: Math.min(60, n + 1) })}>+</button>
        <button title="Remove" onClick={deleteNode}>🗑</button>
      </span>
    </NodeViewWrapper>
  );
}

export function BoxView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const h = Math.min(Number(node.attrs.height) || 40, 250);
  return (
    <NodeViewWrapper className={`ed-block ${selected ? 'sel' : ''}`}>
      <div className="drawbox" style={{ height: `${h}mm` }} contentEditable={false} />
      <span
        className="ed-handle bottom"
        contentEditable={false}
        title="Drag to change the height"
        onPointerDown={(e) => startDrag(e, (_dx, dy, perMm) => updateAttributes({ height: Math.round(Math.min(250, Math.max(10, h + dy / perMm))) }))}
      />
      <span className="ed-block-bar" contentEditable={false} onMouseDown={(e) => e.preventDefault()}>
        Drawing box · drag the bottom edge
        <button onClick={() => updateAttributes({ height: Math.max(10, h - 10) })}>−</button>
        <b>{h}mm</b>
        <button onClick={() => updateAttributes({ height: Math.min(250, h + 10) })}>+</button>
        <button title="Remove" onClick={deleteNode}>🗑</button>
      </span>
    </NodeViewWrapper>
  );
}
