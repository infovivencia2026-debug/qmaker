import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { cloneBox, computeNumbers, findBox, insertBox, mapBox, moveBox, type Box } from '../lib/box';
import { renderBody } from '../lib/renderBox';
import { PAPER_CSS } from '../lib/renderHtml';
import { richPlain } from '../lib/richdoc';
import { paperLabels } from '../lib/labels';
import { PRESETS } from '../lib/presets';
import { uid } from '../lib/util';
import BoxCanvas, { type CanvasOps } from '../components/boxes/BoxCanvas';
import BoxInserter from '../components/boxes/BoxInserter';
import BoxPanel from '../components/boxes/BoxPanel';
import Toolbar from '../components/rich/Toolbar';

const text = (b: Box): string => [b.content ? richPlain(b.content) : '', ...(b.children ?? []).map(text)].join(' ').replace(/\s+/g, ' ').trim();

/** Edit one saved box with the same canvas and switches as a paper. */
function LibraryEditor({ id, onBack }: { id: string; onBack: () => void }) {
  const { db, update } = useStore();
  const item = db.library.find((b) => b.id === id)!;
  const [selected, setSelected] = useState<string | null>(id);
  const [inserter, setInserter] = useState<{ parentId: string; index: number } | null>(null);
  const root: Box = useMemo(() => ({ id: '__lib_root__', children: [item] }), [item]);
  const labels = useMemo(() => computeNumbers(root), [root]);
  const setRoot = (fn: (r: Box) => Box) =>
    update((db) => ({ ...db, library: db.library.map((b) => (b.id === id ? { ...(fn({ id: '__lib_root__', children: [b] }).children?.[0] ?? b), updatedAt: Date.now() } : b)) }));
  const L = paperLabels();
  const ops: CanvasOps = {
    root, selected, select: setSelected, labels, marksWord: L('marks'), orWord: L('or'), bilingual: false,
    update: (bid, patch) => setRoot((r) => mapBox(r, bid, (b) => ({ ...b, ...patch }))),
    remove: (bid) => (bid === id ? undefined : setRoot((r) => mapBox(r, bid, () => null))),
    move: (bid, p, i) => setRoot((r) => moveBox(r, bid, p, i)),
    duplicate: (bid) => { const f = findBox(root, bid); if (f?.parent) setRoot((r) => insertBox(r, f.parent!.id, cloneBox(f.box, uid), f.index + 1)); },
    openInserter: (parentId, index) => setInserter({ parentId: parentId === '__lib_root__' ? id : parentId, index: parentId === '__lib_root__' ? (item.children?.length ?? 0) : index }),
  };
  const sel = selected ? findBox(root, selected)?.box : undefined;
  return (
    <div className="wp">
      <header className="wp-top">
        <button className="wp-logo" onClick={onBack}>Q</button>
        <div className="wp-title">Library · {item.name || 'Saved box'}</div>
      </header>
      <Toolbar />
      <div className="wp-body">
        <div className="wp-canvas" onMouseDown={() => setSelected(null)}>
          <style>{PAPER_CSS}</style>
          <div className="sheet qp edit lib-sheet"><BoxCanvas ops={ops} /></div>
        </div>
        <aside className="wp-side"><div className="wp-side-b">
          {sel ? <BoxPanel key={sel.id} b={sel} update={(p) => ops.update(sel.id, p)} /> : <p className="muted pad">Select a box.</p>}
        </div></aside>
      </div>
      {inserter && <BoxInserter onClose={() => setInserter(null)} onPick={(b) => { setRoot((r) => insertBox(r, inserter.parentId, b, inserter.index)); setInserter(null); setSelected(b.id); }} />}
    </div>
  );
}

/** Saved boxes: your question bank and your own question types, all in one place. */
export default function Library() {
  const { db, update, t } = useStore();
  const [q, setQ] = useState('');
  const [subject, setSubject] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  if (editing && db.library.some((b) => b.id === editing)) return <LibraryEditor id={editing} onBack={() => setEditing(null)} />;

  const subjects = [...new Set(db.library.map((b) => b.meta?.subject).filter(Boolean))] as string[];
  const list = db.library
    .filter((b) => (!subject || b.meta?.subject === subject) && `${b.name ?? ''} ${b.meta?.chapter ?? ''} ${text(b)}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  const add = (make: () => Box) => {
    const b = { ...make(), updatedAt: Date.now() };
    update((db) => ({ ...db, library: [b, ...db.library] }));
    setEditing(b.id);
  };
  const L = paperLabels();

  return (
    <div className="page">
      <div className="page-h">
        <h1>Library <span className="muted">({db.library.length})</span></h1>
        <select defaultValue="" onChange={(e) => { const p = PRESETS.find((x) => x.name === e.target.value); if (p) add(p.make); e.target.value = ''; }}>
          <option value="" disabled>+ New from a type…</option>
          {PRESETS.map((p) => <option key={p.name} value={p.name}>{p.group} · {p.name}</option>)}
        </select>
      </div>
      <p className="muted">Everything you save with ☆ on a paper lands here. Insert these into any paper with +, or edit them here.</p>
      <div className="filters">
        <select value={subject} onChange={(e) => setSubject(e.target.value)}><option value="">{t('subject')}: {t('all')}</option>{subjects.map((s) => <option key={s}>{s}</option>)}</select>
        <input placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <table className="list">
        <tbody>
          {list.map((b) => (
            <tr key={b.id} onDoubleClick={() => setEditing(b.id)}>
              <td className="grow clip-cell"><b>{b.name || 'Saved box'}</b> <span className="muted">{text(b).slice(0, 140)}</span></td>
              <td className="muted">{[b.meta?.subject, b.meta?.chapter].filter(Boolean).join(' · ')}</td>
              <td className="actions">
                <button onClick={() => setEditing(b.id)}>{t('edit')}</button>
                <button className="ghost" onClick={() => setPreview(preview === b.id ? null : b.id)}>{t('preview')}</button>
                <button className="ghost" onClick={() => update((db) => ({ ...db, library: [{ ...cloneBox(b, uid), updatedAt: Date.now() }, ...db.library] }))}>{t('duplicate')}</button>
                <button className="ghost danger" onClick={() => confirm(t('confirmDelete')) && update((db) => ({ ...db, library: db.library.filter((x) => x.id !== b.id) }))}>{t('delete')}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!list.length && <p className="muted">{t('noItems')}</p>}
      {preview && (() => {
        const b = db.library.find((x) => x.id === preview);
        if (!b) return null;
        const html = renderBody({ id: 'p', children: [b] }, { images: db.images, answerKey: true, bilingual: false, L });
        return (
          <div className="lib-preview">
            <style>{PAPER_CSS}</style>
            <div className="sheet preview"><div className="qp" dangerouslySetInnerHTML={{ __html: html }} /></div>
          </div>
        );
      })()}
    </div>
  );
}
