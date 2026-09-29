import { Fragment, useEffect, useMemo, useState } from 'react';
import type { Paper, Question, Section, Template } from '../shared/types';
import { useStore } from '../store';
import { lockPaper, paperQuestionIds, papersUsing, partsMarks, removeFromSection, replaceInSection, resolvePaper, sectionInstruction } from '../lib/paper';
import { PAPER_CSS, renderPaperHtml } from '../lib/renderHtml';
import { renderPaperDocx } from '../lib/renderDocx';
import { paperBundle } from '../lib/bundle';
import { autoFillIds } from '../lib/autofill';
import { safeFileName, uid } from '../lib/util';
import { blankQuestion } from '../components/QuestionForm';
import QuestionPicker from '../components/QuestionPicker';
import Modal from '../components/Modal';
import RichInput from '../components/RichInput';
import { effectiveStyle, fontStack } from '../lib/fonts';
import QuestionBlock from '../components/editor/QuestionBlock';
import Inserter from '../components/editor/Inserter';
import { PaperPanel, QuestionPanel, SectionPanel, type Sel } from '../components/editor/Sidebar';

const move = <T,>(arr: T[], i: number, d: number) => {
  const j = i + d;
  if (j < 0 || j >= arr.length) return arr;
  const next = [...arr];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
};

type InsertAt = { sectionId: string; index: number };

export default function PaperEditor({ id, onBack }: { id: string; onBack: () => void }) {
  const { db, update, t, notify, undo, redo, canUndo, canRedo } = useStore();
  const paper = db.papers.find((p) => p.id === id)!;
  const [sel, setSel] = useState<Sel>({ kind: 'paper' });
  const [tab, setTab] = useState<'paper' | 'block'>('paper');
  const [inserter, setInserter] = useState<InsertAt | null>(null);
  const [picker, setPicker] = useState<InsertAt | null>(null);
  const [altPicker, setAltPicker] = useState<{ sectionId: string; primaryId: string } | null>(null);
  const [preview, setPreview] = useState<'paper' | 'key' | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [sidebar, setSidebar] = useState(true);
  const [busy, setBusy] = useState(false);

  const resolved = resolvePaper(paper, db);
  const style = effectiveStyle(db.settings.paperStyle, paper.style);
  const sheetStyle = {
    fontFamily: fontStack(style), '--fs': `${style.fontSize}pt`, '--lh': style.lineHeight, '--gap': `${style.questionGap}pt`,
  } as React.CSSProperties;
  const target = paper.maxMarks ?? 0;
  const inPaper = useMemo(() => new Set(paperQuestionIds(paper)), [paper]);

  const select = (s: Sel) => {
    setSel(s);
    setTab(s.kind === 'paper' ? 'paper' : 'block');
  };

  // ---------- mutations ----------
  const touch = (p: Paper): Paper => ({ ...p, updatedAt: Date.now() });
  const setPaper = (patch: Partial<Paper>) => update((db) => ({ ...db, papers: db.papers.map((p) => (p.id === id ? touch({ ...p, ...patch }) : p)) }));
  const setSections = (fn: (s: Section[]) => Section[]) =>
    update((db) => ({ ...db, papers: db.papers.map((p) => (p.id === id ? touch({ ...p, sections: fn(p.sections) }) : p)) }));
  const setSection = (sid: string, patch: Partial<Section>) => setSections((ss) => ss.map((s) => (s.id === sid ? { ...s, ...patch } : s)));
  const setQuestion = (qid: string, patch: Partial<Question>) =>
    update((db) => ({
      ...db,
      questions: db.questions.map((q) => {
        if (q.id !== qid) return q;
        const next = { ...q, ...patch, updatedAt: Date.now() };
        // Questions with parts are worth the sum of their parts.
        const t = db.templates.find((x) => x.id === next.templateId);
        const sum = t && partsMarks(t, next.data);
        return sum != null ? { ...next, marks: sum } : next;
      }),
    }));

  const insertQuestions = (at: InsertAt, qs: Question[], existingIds: string[] = []) => {
    const ids = [...qs.map((q) => q.id), ...existingIds];
    update((db) => ({
      ...db,
      questions: [...db.questions, ...qs],
      papers: db.papers.map((p) =>
        p.id !== id ? p : touch({
          ...p,
          sections: p.sections.map((s) => (s.id !== at.sectionId ? s : { ...s, questionIds: [...s.questionIds.slice(0, at.index), ...ids, ...s.questionIds.slice(at.index)] })),
        }),
      ),
    }));
    if (ids.length === 1) select({ kind: 'question', sectionId: at.sectionId, id: ids[0] });
  };

  const lastChapter = () => {
    const all = resolved.sections.flatMap((s) => s.questions);
    return all[all.length - 1]?.question.chapter ?? '';
  };

  const createBlock = (tpl: Template, at: InsertAt) => {
    const section = paper.sections.find((s) => s.id === at.sectionId)!;
    const q = blankQuestion(tpl, paper.subject, lastChapter());
    if (section.marksEach) q.marks = section.marksEach;
    insertQuestions(at, [q]);
    setInserter(null);
  };

  const duplicate = (sectionId: string, qid: string) => {
    const src = db.questions.find((q) => q.id === qid);
    const s = paper.sections.find((x) => x.id === sectionId);
    if (!src || !s) return;
    insertQuestions({ sectionId, index: s.questionIds.indexOf(qid) + 1 }, [{ ...structuredClone(src), id: uid(), createdAt: Date.now(), updatedAt: Date.now() }]);
  };

  const removeFromPaper = (sectionId: string, qid: string) => {
    setSections((ss) => ss.map((s) => (s.id === sectionId ? removeFromSection(s, qid) : s)));
    select({ kind: 'paper' });
  };

  // A question used by other papers can be split off so edits here stay in this paper.
  const makePrivateCopy = (sectionId: string, qid: string) => {
    const src = db.questions.find((q) => q.id === qid);
    if (!src) return;
    const copy = { ...structuredClone(src), id: uid(), createdAt: Date.now(), updatedAt: Date.now() };
    update((db) => ({
      ...db,
      questions: [...db.questions, copy],
      papers: db.papers.map((p) => (p.id !== id ? p : touch({ ...p, sections: p.sections.map((s) => (s.id === sectionId ? replaceInSection(s, qid, copy.id) : s)) }))),
    }));
    select({ kind: 'question', sectionId, id: copy.id });
    notify('This paper now has its own copy. Other papers are unchanged.');
  };

  const toggleLock = () => {
    if (!paper.locked) {
      setPaper(lockPaper(paper, db));
      notify('Paper locked. It will print exactly like this even if questions change in the bank.');
      select({ kind: 'paper' });
      return;
    }
    const frozen = new Map(paper.locked.questions.map((q) => [q.id, q.updatedAt]));
    const changed = db.questions.filter((q) => frozen.has(q.id) && q.updatedAt !== frozen.get(q.id)).length;
    const missing = [...frozen.keys()].filter((qid) => !db.questions.some((q) => q.id === qid)).length;
    const note = changed || missing
      ? `\n\n${changed ? `${changed} question(s) were edited in the bank since you locked it — the paper will show the new versions.` : ''}${missing ? `\n${missing} question(s) were deleted from the bank and will disappear from the paper.` : ''}`
      : '';
    if (!confirm(`Unlock this paper for editing?${note}`)) return;
    setPaper({ locked: undefined });
  };

  // ---------- either / or ----------
  const setAlternative = (sectionId: string, primaryId: string, altId: string | null, newQ?: Question) => {
    update((db) => ({
      ...db,
      questions: newQ ? [...db.questions, newQ] : db.questions,
      papers: db.papers.map((p) =>
        p.id !== id ? p : touch({
          ...p,
          sections: p.sections.map((s) => {
            if (s.id !== sectionId) return s;
            const alternatives = { ...s.alternatives };
            if (altId) alternatives[primaryId] = altId;
            else delete alternatives[primaryId];
            return { ...s, alternatives };
          }),
        }),
      ),
    }));
    select(altId ? { kind: 'question', sectionId, id: altId } : { kind: 'question', sectionId, id: primaryId });
  };
  const addAltNew = (sectionId: string, primaryId: string) => {
    const primary = db.questions.find((q) => q.id === primaryId);
    const tpl = primary && db.templates.find((t) => t.id === primary.templateId);
    if (!primary || !tpl) return;
    const q = blankQuestion(tpl, primary.subject, primary.chapter);
    q.marks = primary.marks;
    setAlternative(sectionId, primaryId, q.id, q);
  };
  const swapAlt = (sectionId: string, primaryId: string) => {
    const s = paper.sections.find((x) => x.id === sectionId);
    const altId = s?.alternatives?.[primaryId];
    if (!s || !altId) return;
    const alternatives = { ...s.alternatives };
    delete alternatives[primaryId];
    alternatives[altId] = primaryId;
    setSection(sectionId, { questionIds: s.questionIds.map((x) => (x === primaryId ? altId : x)), alternatives });
  };

  const addSection = () => {
    const s: Section = { id: uid(), title: `Section ${String.fromCharCode(65 + paper.sections.length)}`, instruction: '', questionIds: [] };
    setSections((ss) => [...ss, s]);
    select({ kind: 'section', id: s.id });
  };

  const autoFill = (sectionId: string) => {
    const { ids, need } = autoFillIds(paper, db, sectionId);
    if (!ids.length) return notify('No unused questions in the bank match this section (same subject and type).');
    const s = paper.sections.find((x) => x.id === sectionId)!;
    insertQuestions({ sectionId, index: s.questionIds.length }, [], ids);
    notify(ids.length < need ? `Added ${ids.length} — the bank only had ${ids.length} matching questions (needed ${need}).` : `Added ${ids.length} questions.`);
  };

  // Escape deselects, like the block editor.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') select({ kind: 'paper' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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

  // ---------- sidebar ----------
  const selSection = sel.kind !== 'paper' ? paper.sections.find((s) => s.id === (sel.kind === 'section' ? sel.id : sel.sectionId)) : undefined;
  const selRq = sel.kind === 'question' ? resolved.sections.flatMap((s) => s.questions).find((q) => q.question.id === sel.id || q.alt?.question.id === sel.id) : undefined;
  const selIsAlt = !!selRq && sel.kind === 'question' && selRq.alt?.question.id === sel.id;
  let blockPanel = <p className="muted pad">Select a section or question on the paper to edit its settings.</p>;
  if (sel.kind === 'section' && selSection) {
    const idx = paper.sections.indexOf(selSection);
    blockPanel = (
      <SectionPanel
        paper={paper}
        section={selSection}
        setSection={(p) => setSection(selSection.id, p)}
        onAutoFill={() => autoFill(selSection.id)}
        onMove={(d) => setSections((ss) => move(ss, idx, d))}
        onDelete={() => {
          if (selSection.questionIds.length && !confirm(t('confirmDelete'))) return;
          setSections((ss) => ss.filter((s) => s.id !== selSection.id));
          select({ kind: 'paper' });
        }}
      />
    );
  } else if (sel.kind === 'question' && selRq && selSection) {
    const primaryId = selRq.question.id;
    const selId = selIsAlt ? selRq.alt!.question.id : primaryId;
    blockPanel = (
      <QuestionPanel
        rq={selRq}
        isAlt={selIsAlt}
        sharedWith={papersUsing(db, selId, paper.id)}
        onMakeCopy={() => makePrivateCopy(selSection.id, selId)}
        section={selSection}
        onChange={(p) => setQuestion(selIsAlt ? selRq.alt!.question.id : primaryId, p)}
        onDuplicate={() => duplicate(selSection.id, primaryId)}
        onRemove={() => (selIsAlt ? setAlternative(selSection.id, primaryId, null) : removeFromPaper(selSection.id, primaryId))}
        onAddAltNew={() => addAltNew(selSection.id, primaryId)}
        onAddAltBank={() => setAltPicker({ sectionId: selSection.id, primaryId })}
        onRemoveAlt={() => setAlternative(selSection.id, primaryId, null)}
        onSwapAlt={() => swapAlt(selSection.id, primaryId)}
      />
    );
  }

  const marksStatus = !target ? '' : resolved.totalMarks === target ? 'ok' : resolved.totalMarks > target ? 'over' : 'under';

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
          <button className={`marks-pill ${marksStatus}`} onClick={() => { select({ kind: 'paper' }); setSidebar(true); }} title="Marks distribution">
            {resolved.totalMarks}{target > 0 && ` / ${target}`} marks
          </button>
          <span className="saved">✓ {t('saved')}</span>
          <button className={paper.locked ? 'locked-btn' : ''} onClick={toggleLock} title={paper.locked ? 'Unlock to edit' : 'Freeze this paper as final'}>
            {paper.locked ? '🔒 Locked' : '🔓 Lock'}
          </button>
          <button onClick={() => setPreview('paper')}>{t('preview')}</button>
          <div className="dd">
            <button className="primary" disabled={busy} onClick={() => setExportOpen((o) => !o)}>{busy ? '…' : 'Export ▾'}</button>
            {exportOpen && (
              <div className="dd-menu" onMouseLeave={() => setExportOpen(false)}>
                {exports.map(([label, fn]) => <button key={label} onClick={fn}>{label}</button>)}
              </div>
            )}
          </div>
          <button className={`icon ${sidebar ? 'on' : ''}`} title="Settings" onClick={() => setSidebar((s) => !s)}>⚙</button>
        </div>
      </header>

      <div className="wp-body">
        <div className="wp-canvas" onMouseDown={() => select({ kind: 'paper' })}>
          <style>{PAPER_CSS}</style>
          {paper.locked && (
            <div className="locked-banner">
              🔒 Locked on {new Date(paper.locked.at).toLocaleString()} — this is the final version. It won't change even if its questions are edited in the bank.
              <button onClick={toggleLock}>Unlock to edit</button>
            </div>
          )}
          {paper.locked ? (
            <div className="sheet" dangerouslySetInnerHTML={{ __html: renderPaperHtml(paper, db, false) }} />
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
              <input className="ib exam" value={paper.examName} placeholder="Exam name, e.g. Half Yearly Examination 2026-27" onChange={(e) => setPaper({ examName: e.target.value })} />
            </div>
            <div className="meta">
              <span>Class: <input className="ib inl" value={paper.className} placeholder="VIII" onChange={(e) => setPaper({ className: e.target.value })} /></span>
              <span>Subject: <input className="ib inl" list="ed-subjects" value={paper.subject} placeholder="Science" onChange={(e) => setPaper({ subject: e.target.value })} /></span>
            </div>
            <datalist id="ed-subjects">{[...new Set(db.questions.map((q) => q.subject))].map((s) => <option key={s} value={s} />)}</datalist>
            <div className="meta">
              <span>Time: <input className="ib inl" value={paper.duration} onChange={(e) => setPaper({ duration: e.target.value })} /></span>
              <span>Date: <input className="ib inl" value={paper.date} placeholder="dd-mm-yyyy" onChange={(e) => setPaper({ date: e.target.value })} /></span>
              <span>Max. Marks: {resolved.totalMarks}</span>
            </div>
            <div className="gi">
              <div className="gi-title">General Instructions:</div>
              <RichInput value={paper.instructions} placeholder="Instructions (optional)" onChange={(v) => setPaper({ instructions: v })} />
            </div>

            {resolved.sections.map((rs) => {
              const section = paper.sections.find((s) => s.id === rs.id)!;
              const isSel = sel.kind === 'section' && sel.id === rs.id;
              const planned = rs.plannedCount > 0;
              return (
                <div className="sec" key={rs.id}>
                  <div className={`blk sec-blk ${isSel ? 'sel' : ''}`} onMouseDown={(e) => { e.stopPropagation(); select({ kind: 'section', id: rs.id }); }}>
                    <div className="sec-h">
                      <input className="ib strong" value={section.title} placeholder="Section title" onChange={(e) => setSection(rs.id, { title: e.target.value })} />
                      <span>{rs.marksLabel}</span>
                    </div>
                    <RichInput className="sec-i" value={section.instruction} placeholder={sectionInstruction(rs) || 'Section instruction (optional)'} onChange={(v) => setSection(rs.id, { instruction: v })} />
                    {(planned || isSel) && (
                      <div className={`plan-chip ${planned && rs.questions.length === rs.plannedCount ? 'ok' : ''}`}>
                        {planned
                          ? <>Plan: {rs.questions.length} / {rs.plannedCount} questions{rs.plannedMarks !== null && <> · {rs.marks} / {rs.plannedMarks} marks</>}</>
                          : 'No marks plan — set one in the sidebar →'}
                      </div>
                    )}
                  </div>
                  {rs.questions.map((rq, i) => (
                    <Fragment key={rq.question.id}>
                      <div className="between"><button onMouseDown={(e) => e.stopPropagation()} onClick={() => setInserter({ sectionId: rs.id, index: i })}>+</button></div>
                      <QuestionBlock
                        rq={rq}
                        sharedCount={papersUsing(db, rq.question.id, paper.id).length}
                        answerSpace={paper.answerSpace}
                        selected={sel.kind === 'question' && sel.id === rq.question.id}
                        onSelect={() => select({ kind: 'question', sectionId: rs.id, id: rq.question.id })}
                        onData={(data) => setQuestion(rq.question.id, { data })}
                        onMove={(d) => setSection(rs.id, { questionIds: move(section.questionIds, section.questionIds.indexOf(rq.question.id), d) })}
                        onDuplicate={() => duplicate(rs.id, rq.question.id)}
                        onRemove={() => removeFromPaper(rs.id, rq.question.id)}
                      />
                      {rq.alt && (
                        <>
                          <div className="or-div"><span>OR</span></div>
                          <QuestionBlock
                            rq={rq}
                            which="alt"
                            answerSpace={paper.answerSpace}
                            selected={sel.kind === 'question' && sel.id === rq.alt.question.id}
                            onSelect={() => select({ kind: 'question', sectionId: rs.id, id: rq.alt!.question.id })}
                            onData={(data) => setQuestion(rq.alt!.question.id, { data })}
                            onRemove={() => setAlternative(rs.id, rq.question.id, null)}
                          />
                        </>
                      )}
                    </Fragment>
                  ))}
                  <button className="appender" onMouseDown={(e) => e.stopPropagation()} onClick={() => setInserter({ sectionId: rs.id, index: section.questionIds.length })}>
                    <span>+</span> Add question to {section.title || 'this section'}
                    {planned && rs.questions.length < rs.plannedCount && <em> — {rs.plannedCount - rs.questions.length} more planned</em>}
                  </button>
                </div>
              );
            })}
            <button className="appender sec-app" onMouseDown={(e) => e.stopPropagation()} onClick={addSection}><span>+</span> Add section</button>
            <div className="end">*** End of Paper ***</div>
          </div>
          )}
        </div>

        {sidebar && (
          <aside className="wp-side">
            <div className="wp-tabs">
              <button className={tab === 'paper' ? 'on' : ''} onClick={() => setTab('paper')}>Paper</button>
              <button className={tab === 'block' ? 'on' : ''} onClick={() => setTab('block')}>{sel.kind === 'section' ? 'Section' : sel.kind === 'question' ? 'Question' : 'Block'}</button>
            </div>
            <div className="wp-side-b">
              {tab === 'paper' ? <PaperPanel paper={paper} setPaper={setPaper} onSelectSection={(sid) => select({ kind: 'section', id: sid })} /> : blockPanel}
            </div>
          </aside>
        )}
      </div>

      {inserter && (
        <Inserter
          suggested={paper.sections.find((s) => s.id === inserter.sectionId)?.templateId}
          onPick={(tpl) => createBlock(tpl, inserter)}
          onBank={() => { setPicker(inserter); setInserter(null); }}
          onClose={() => setInserter(null)}
        />
      )}
      {picker && (
        <QuestionPicker
          subject={paper.subject}
          templateId={paper.sections.find((s) => s.id === picker.sectionId)?.templateId}
          exclude={inPaper}
          onClose={() => setPicker(null)}
          onAdd={(ids) => { insertQuestions(picker, [], ids); setPicker(null); }}
        />
      )}
      {altPicker && (
        <QuestionPicker
          subject={paper.subject}
          templateId={db.questions.find((q) => q.id === altPicker.primaryId)?.templateId}
          exclude={inPaper}
          onClose={() => setAltPicker(null)}
          onAdd={(ids) => { setAlternative(altPicker.sectionId, altPicker.primaryId, ids[0]); setAltPicker(null); }}
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
