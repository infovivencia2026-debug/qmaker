import { useEffect, useMemo, useState } from 'react';
import type { Paper } from '../shared/types';
import { useStore } from '../store';
import { cloneBox, computeNumbers, findBox, insertBox, mapBox, marksOf, moveBox, walkBoxes, type Box } from '../lib/box';
import { paperToBox } from '../lib/boxMigrate';
import { PAPER_CSS, renderPaperHtml } from '../lib/renderHtml';
import { renderPaperDocx } from '../lib/renderDocx';
import { paperBundle } from '../lib/bundle';
import { safeFileName, uid } from '../lib/util';
import { effectiveStyle, fontStack } from '../lib/fonts';
import { paperLabels, PAPER_LANGS, type PaperLang } from '../lib/labels';
import Modal from '../components/Modal';
import Toolbar from '../components/rich/Toolbar';
import BoxCanvas, { type CanvasOps } from '../components/boxes/BoxCanvas';
import BoxInserter from '../components/boxes/BoxInserter';
import BoxPanel from '../components/boxes/BoxPanel';
import StyleEditor from '../components/StyleEditor';

type Dist = { label: string; marks: number }[];

/** Marks per chapter / difficulty: each fixed-marks box counts under the nearest chapter/difficulty set on it or above it. */
function distribution(root: Box) {
  const chapter = new Map<string, number>();
  const difficulty = new Map<string, number>();
  const walk = (b: Box, ch?: string, df?: string) => {
    const c = b.meta?.chapter || ch;
    const d = b.meta?.difficulty || df;
    if (b.marks?.mode === 'fixed') {
      chapter.set(c || '—', (chapter.get(c || '—') ?? 0) + (b.marks.value ?? 0));
      difficulty.set(d || '—', (difficulty.get(d || '—') ?? 0) + (b.marks.value ?? 0));
      return; // parts inside a fixed-marks box belong to it
    }
    b.children?.forEach((k) => walk(k, c, d));
  };
  walk(root);
  const rows = (m: Map<string, number>): Dist => [...m].map(([label, marks]) => ({ label, marks })).sort((a, b) => b.marks - a.marks);
  return { chapter: rows(chapter), difficulty: rows(difficulty) };
}

function Bars({ title, rows }: { title: string; rows: Dist }) {
  const total = rows.reduce((s, r) => s + r.marks, 0);
  if (!rows.length) return null;
  return (
    <div className="panel">
      <div className="panel-h">{title}</div>
      {rows.map((r) => (
        <div className="bar" key={r.label}>
          <div className="bar-l"><span className="clip">{r.label}</span><span>{r.marks} <span className="muted">({total ? Math.round((r.marks / total) * 100) : 0}%)</span></span></div>
          <div className="bar-t"><div style={{ width: `${total ? (r.marks / total) * 100 : 0}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

export default function PaperEditor({ id, onBack }: { id: string; onBack: () => void }) {
  const { db, update, t, notify, undo, redo, canUndo, canRedo } = useStore();
  const paper = db.papers.find((p) => p.id === id)!;
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<'paper' | 'box'>('paper');
  const [inserter, setInserter] = useState<{ parentId: string; index: number } | null>(null);
  const [preview, setPreview] = useState<'paper' | 'key' | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [sidebar, setSidebar] = useState(true);
  const [busy, setBusy] = useState(false);

  // Older papers (sections and questions) become a Box tree the first time they are opened.
  useEffect(() => {
    if (!paper.body) update((db) => ({ ...db, papers: db.papers.map((p) => (p.id === id && !p.body ? { ...p, body: paperToBox(p, db) } : p)) }));
  }, [id, paper.body, update]);

  const body = paper.body;
  const labels = useMemo(() => (body ? computeNumbers(body) : new Map<string, string>()), [body]);

  const touch = (p: Paper): Paper => ({ ...p, updatedAt: Date.now() });
  const setPaper = (patch: Partial<Paper>) => update((db) => ({ ...db, papers: db.papers.map((p) => (p.id === id ? touch({ ...p, ...patch }) : p)) }));
  const setBody = (fn: (b: Box) => Box) => update((db) => ({ ...db, papers: db.papers.map((p) => (p.id === id && p.body ? touch({ ...p, body: fn(p.body) }) : p)) }));
  const select = (bid: string | null) => {
    setSelected(bid);
    setTab(bid ? 'box' : 'paper');
  };
  const remove = (bid: string) => {
    setBody((r) => mapBox(r, bid, () => null));
    if (selected === bid) select(null);
  };

  // Delete removes the selected box when the cursor is not in a text box; Escape deselects.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') select(null);
      const typing = (e.target as HTMLElement | null)?.closest?.('.ProseMirror, input, textarea, select');
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected && !typing) {
        e.preventDefault();
        remove(selected);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!body) return null;

  const L = paperLabels(paper.labelLang);
  const total = marksOf(body);
  const target = paper.maxMarks ?? 0;
  const style = effectiveStyle(db.settings.paperStyle, paper.style);
  const sheetStyle = { fontFamily: fontStack(style), '--fs': `${style.fontSize}pt`, '--lh': style.lineHeight, '--gap': `${style.questionGap}pt` } as React.CSSProperties;

  const ops: CanvasOps = {
    root: body,
    selected,
    select,
    update: (bid, patch) => setBody((r) => mapBox(r, bid, (b) => ({ ...b, ...patch }))),
    remove,
    move: (bid, parentId, index) => setBody((r) => moveBox(r, bid, parentId, index)),
    duplicate: (bid) => {
      const f = findBox(body, bid);
      if (!f?.parent) return;
      const copy = cloneBox(f.box, uid);
      setBody((r) => insertBox(r, f.parent!.id, copy, f.index + 1));
      select(copy.id);
    },
    saveToLibrary: (bid) => {
      const f = findBox(body, bid);
      if (!f) return;
      const saved: Box = { ...cloneBox(f.box, uid), updatedAt: Date.now(), meta: { subject: paper.subject || undefined, ...f.box.meta } };
      update((db) => ({ ...db, library: [...db.library, saved] }));
      notify(`Saved "${saved.name || 'box'}" to your library.`);
    },
    openInserter: (parentId, index) => setInserter({ parentId, index }),
    labels,
    marksWord: L('marks'),
    orWord: L('or'),
    bilingual: !!paper.bilingual,
  };

  // ---------- export ----------
  const baseName = safeFileName([paper.examName || 'Paper', paper.className, paper.subject].filter(Boolean).join(' - '));
  const run = async (fn: () => Promise<string | null>) => {
    setExportOpen(false);
    setBusy(true);
    try {
      const path = await fn();
      if (path) notify(`${t('saved')}: ${path}`, path);
    } catch (e) {
      notify(`Export failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };
  const exports: [string, () => void][] = [
    [`📄 ${t('exportPdf')}`, () => run(() => window.qmaker.exportPdf(renderPaperHtml(paper, db, false), `${baseName}.pdf`))],
    [`🔑 ${t('answerKeyPdf')}`, () => run(() => window.qmaker.exportPdf(renderPaperHtml(paper, db, true), `${baseName} - Answer Key.pdf`))],
    [`📝 ${t('exportWord')} (.docx)`, () => run(async () => window.qmaker.saveFile(await renderPaperDocx(paper, db, false), `${baseName}.docx`, 'Word', 'docx'))],
    [`🔑 ${t('exportWordKey')}`, () => run(async () => window.qmaker.saveFile(await renderPaperDocx(paper, db, true), `${baseName} - Answer Key.docx`, 'Word', 'docx'))],
    [`💬 ${t('sharePaper')} (WhatsApp)`, () => run(async () => window.qmaker.saveFile(new TextEncoder().encode(JSON.stringify(await paperBundle(db, paper))), `${baseName}.qpaper`, 'QMaker Paper', 'qpaper'))],
  ];

  const selBox = selected ? findBox(body, selected)?.box : undefined;
  const dist = distribution(body);
  let count = 0;
  walkBoxes(body, (b) => { if (b.number?.scope === 'paper') count++; });
  const marksStatus = !target ? '' : total === target ? 'ok' : total > target ? 'over' : 'under';

  return (
    <div className="wp">
      <header className="wp-top">
        <button className="wp-logo" title={t('back')} onClick={onBack}>Q</button>
        <div className="wp-title">{paper.examName || t('untitled')}<span className="muted"> · {[paper.className, paper.subject].filter(Boolean).join(' · ')}</span></div>
        <div className="wp-top-l">
          <button className="icon" disabled={!canUndo} title="Undo (Ctrl+Z)" onClick={undo}>↶</button>
          <button className="icon" disabled={!canRedo} title="Redo (Ctrl+Y)" onClick={redo}>↷</button>
        </div>
        <div className="wp-top-r">
          <button className={`marks-pill ${marksStatus}`} onClick={() => { select(null); setSidebar(true); }}>{total}{target > 0 && ` / ${target}`} {t('marksWord')}</button>
          <span className="saved">✓ {t('saved')}</span>
          <button className={paper.locked ? 'locked-btn' : ''} onClick={() => setPaper(paper.locked ? { locked: undefined } : { locked: { at: Date.now(), questions: [], templates: [] } })}>
            {paper.locked ? `🔒 ${t('locked')}` : `🔓 ${t('lock')}`}
          </button>
          <button onClick={() => setPreview('paper')}>{t('preview')}</button>
          <div className="dd">
            <button className="primary" disabled={busy} onClick={() => setExportOpen((o) => !o)}>{busy ? '…' : `${t('export')} ▾`}</button>
            {exportOpen && <div className="dd-menu" onMouseLeave={() => setExportOpen(false)}>{exports.map(([label, fn]) => <button key={label} onClick={fn}>{label}</button>)}</div>}
          </div>
          <button className={`icon ${sidebar ? 'on' : ''}`} onClick={() => setSidebar((s) => !s)}>⚙</button>
        </div>
      </header>
      {!paper.locked && <Toolbar />}

      <div className="wp-body">
        <div className="wp-canvas" onMouseDown={() => select(null)}>
          <style>{PAPER_CSS}</style>
          {paper.locked ? (
            <>
              <div className="locked-banner">🔒 {t('locked')} <button onClick={() => setPaper({ locked: undefined })}>{t('unlockToEdit')}</button></div>
              <div className="sheet" dangerouslySetInnerHTML={{ __html: renderPaperHtml(paper, db, false) }} />
            </>
          ) : (
            <div className="sheet qp edit" style={sheetStyle}>
              <div className="hd">
                <div className="hd-top">
                  {db.settings.logo && <img src={db.settings.logo} />}
                  <div>
                    <div className="inst">{db.settings.institutionName || <span className="ph">Institution name — set it in Settings</span>}</div>
                    {db.settings.address && <div className="addr">{db.settings.address}</div>}
                  </div>
                </div>
                <input className="ib exam" value={paper.examName} placeholder="Exam name" onChange={(e) => setPaper({ examName: e.target.value })} />
              </div>
              <div className="meta">
                <span>{L('class')}: <input className="ib inl" value={paper.className} placeholder="VIII" onChange={(e) => setPaper({ className: e.target.value })} /></span>
                <span>{L('subject')}: <input className="ib inl" value={paper.subject} placeholder="Science" onChange={(e) => setPaper({ subject: e.target.value })} /></span>
              </div>
              <div className="meta">
                <span>{L('time')}: <input className="ib inl" value={paper.duration} onChange={(e) => setPaper({ duration: e.target.value })} /></span>
                <span>{L('date')}: <input className="ib inl" value={paper.date} placeholder="dd-mm-yyyy" onChange={(e) => setPaper({ date: e.target.value })} /></span>
                <span>{L('maxMarks')}: {total}</span>
              </div>
              <div className={paper.pageCols === 2 ? 'cols2' : ''}>
                <BoxCanvas ops={ops} />
              </div>
              <div className="end">{L('end')}</div>
            </div>
          )}
        </div>

        {sidebar && (
          <aside className="wp-side">
            <div className="wp-tabs">
              <button className={tab === 'paper' ? 'on' : ''} onClick={() => setTab('paper')}>{t('paper')}</button>
              <button className={tab === 'box' ? 'on' : ''} onClick={() => setTab('box')}>{selBox?.name || 'Box'}</button>
            </div>
            <div className="wp-side-b">
              {tab === 'box' ? (
                selBox ? <BoxPanel key={selBox.id} b={selBox} update={(patch) => ops.update(selBox.id, patch)} /> : <p className="muted pad">Click any box on the paper to see its switches.</p>
              ) : (
                <>
                  <div className="panel">
                    <div className="panel-h">{t('marks')}</div>
                    <div className={`big-marks ${marksStatus}`}><b>{total}</b>{target > 0 && <> / {target}</>} <span>{t('marksWord')}</span></div>
                    {marksStatus === 'under' && <div className="msg under">{target - total} marks still to add</div>}
                    {marksStatus === 'over' && <div className="msg over">{total - target} marks over the maximum</div>}
                    <label>{t('maxTarget')}<input type="number" min={0} value={target || ''} placeholder="e.g. 80" onChange={(e) => setPaper({ maxMarks: Number(e.target.value) || 0 })} /></label>
                    <div className="muted">{count} numbered questions.</div>
                  </div>
                  <Bars title={t('byChapter')} rows={dist.chapter} />
                  <Bars title={t('byDifficulty')} rows={dist.difficulty} />
                  <details className="panel" open>
                    <summary className="panel-h">{t('fontSpacing')}</summary>
                    <StyleEditor value={style} onChange={(patch) => setPaper({ style: { ...paper.style, ...patch } })} />
                  </details>
                  <div className="panel">
                    <div className="panel-h">{t('languageH')}</div>
                    <label>Printed words<select value={paper.labelLang ?? 'en'} onChange={(e) => setPaper({ labelLang: e.target.value as PaperLang })}>{PAPER_LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
                    <label className="check"><input type="checkbox" checked={!!paper.bilingual} onChange={(e) => setPaper({ bilingual: e.target.checked })} /> Bilingual (second-language text under each box)</label>
                  </div>
                  <div className="panel">
                    <div className="panel-h">{t('printing')}</div>
                    <label className="check"><input type="checkbox" checked={paper.pageCols === 2} onChange={(e) => setPaper({ pageCols: e.target.checked ? 2 : undefined })} /> Two page columns</label>
                  </div>
                </>
              )}
            </div>
          </aside>
        )}
      </div>

      {inserter && (
        <BoxInserter
          onClose={() => setInserter(null)}
          onPick={(b) => {
            setBody((r) => insertBox(r, inserter.parentId, b, inserter.index));
            setInserter(null);
            select(b.id);
          }}
        />
      )}
      {preview && (
        <Modal title={t('preview')} wide onClose={() => setPreview(null)}>
          <div className="tabs">
            <button className={preview === 'paper' ? 'on' : ''} onClick={() => setPreview('paper')}>{t('paper')}</button>
            <button className={preview === 'key' ? 'on' : ''} onClick={() => setPreview('key')}>{t('answerKey')}</button>
          </div>
          <div className="sheet preview"><div dangerouslySetInnerHTML={{ __html: renderPaperHtml(paper, db, preview === 'key') }} /></div>
        </Modal>
      )}
    </div>
  );
}
