import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { useStore } from '../../store';
import { imgSrc } from '../../lib/images';

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
    </NodeViewWrapper>
  );
}

export function LinesView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const n = Math.min(Number(node.attrs.lines) || 1, 60);
  return (
    <NodeViewWrapper className={`ed-block ${selected ? 'sel' : ''}`}>
      <div className="lines" contentEditable={false}>{Array.from({ length: n }, (_, i) => <div key={i} />)}</div>
      <span className="ed-block-bar" contentEditable={false} onMouseDown={(e) => e.preventDefault()}>
        Answer lines
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
      <span className="ed-block-bar" contentEditable={false} onMouseDown={(e) => e.preventDefault()}>
        Drawing box
        <button onClick={() => updateAttributes({ height: Math.max(10, h - 10) })}>−</button>
        <b>{h}mm</b>
        <button onClick={() => updateAttributes({ height: Math.min(250, h + 10) })}>+</button>
        <button title="Remove" onClick={deleteNode}>🗑</button>
      </span>
    </NodeViewWrapper>
  );
}
