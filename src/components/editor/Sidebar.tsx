import type { Difficulty, Paper, Question, Section } from '../../shared/types';
import { useStore } from '../../store';
import StyleEditor from '../StyleEditor';
import { effectiveStyle } from '../../lib/fonts';
import { marksDistribution, partsMarks, resolvePaper, type DistRow, type ResolvedQuestion } from '../../lib/paper';

export type Sel = { kind: 'paper' } | { kind: 'section'; id: string } | { kind: 'question'; sectionId: string; id: string };

function Bars({ title, rows, total }: { title: string; rows: DistRow[]; total: number }) {
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

function PaperPanel({ paper, setPaper, onSelectSection }: { paper: Paper; setPaper: (p: Partial<Paper>) => void; onSelectSection: (id: string) => void }) {
  const { db, t, update, notify } = useStore();
  const style = effectiveStyle(db.settings.paperStyle, paper.style);
  const customised = !!paper.style && Object.keys(paper.style).length > 0;
  const { sections, totalMarks } = resolvePaper(paper, db);
  const dist = marksDistribution(paper, db);
  const target = paper.maxMarks ?? 0;
  const planned = sections.reduce((s, x) => s + (x.plannedMarks ?? 0), 0);
  const rawTotal = sections.reduce((s, x) => s + x.questions.reduce((a, q) => a + q.marks, 0), 0);
  const status = !target ? '' : totalMarks === target ? 'ok' : totalMarks > target ? 'over' : 'under';

  return (
    <>
      <div className="panel">
        <div className="panel-h">Marks</div>
        <div className={`big-marks ${status}`}>
          <b>{totalMarks}</b>{target > 0 && <> / {target}</>} <span>marks</span>
        </div>
        {status === 'under' && <div className="msg under">{target - totalMarks} marks still to add</div>}
        {status === 'over' && <div className="msg over">{totalMarks - target} marks over the maximum</div>}
        {status === 'ok' && <div className="msg ok">Matches the maximum marks ✓</div>}
        <label>Maximum marks (target)
          <input type="number" min={0} value={target || ''} placeholder="e.g. 80" onChange={(e) => setPaper({ maxMarks: Number(e.target.value) || 0 })} />
        </label>
        {planned > 0 && target > 0 && planned !== target && <div className="msg under">Section plans add up to {planned}, not {target}.</div>}
      </div>

      <div className="panel">
        <div className="panel-h">Marks distribution by section</div>
        <table className="dist">
          <thead><tr><th>Section</th><th>Questions</th><th>Marks</th></tr></thead>
          <tbody>
            {sections.map((s) => {
              const qOk = !s.plannedCount || s.questions.length === s.plannedCount;
              const mOk = s.plannedMarks === null || s.marks === s.plannedMarks;
              return (
                <tr key={s.id} onClick={() => onSelectSection(s.id)}>
                  <td className="clip">{s.title || '—'}{s.attempt > 0 && <div className="muted">any {s.attempt}</div>}</td>
                  <td className={qOk ? '' : 'warn'}>{s.questions.length}{s.plannedCount > 0 && ` / ${s.plannedCount}`}</td>
                  <td className={mOk ? '' : 'warn'}>{s.marks}{s.plannedMarks !== null && ` / ${s.plannedMarks}`}</td>
                </tr>
              );
            })}
            <tr className="tot"><td>{t('total')}</td><td>{sections.reduce((a, s) => a + s.questions.length, 0)}</td><td>{totalMarks}{target > 0 && ` / ${target}`}</td></tr>
          </tbody>
        </table>
        {rawTotal !== totalMarks && <div className="muted">With choices, {rawTotal} marks of questions are printed; {totalMarks} count.</div>}
        <div className="muted">Click a section to set its plan (type, number of questions, marks each).</div>
      </div>

      <Bars title="By chapter" rows={dist.chapter} total={rawTotal} />
      <Bars title="By difficulty" rows={dist.difficulty.map((r) => ({ ...r, label: t(r.label as Difficulty) }))} total={rawTotal} />
      <Bars title="By question type" rows={dist.type} total={rawTotal} />

      <details className="panel" open>
        <summary className="panel-h">Font &amp; spacing {customised ? <span className="tag">this paper</span> : <span className="tag">institution default</span>}</summary>
        <StyleEditor value={style} onChange={(patch) => setPaper({ style: { ...paper.style, ...patch } })} />
        {customised && (
          <div className="row wrap">
            <button onClick={() => setPaper({ style: undefined })}>Reset to default</button>
            <button onClick={() => {
              update((db) => ({ ...db, settings: { ...db.settings, paperStyle: style } }));
              setPaper({ style: undefined });
              notify('Saved as the default style for new papers.');
            }}>Make this the default</button>
          </div>
        )}
      </details>

      <div className="panel">
        <div className="panel-h">Printing</div>
        <label className="check"><input type="checkbox" checked={paper.answerSpace} onChange={(e) => setPaper({ answerSpace: e.target.checked })} /> {t('answerSpace')}</label>
      </div>
    </>
  );
}

function SectionPanel({ paper, section, setSection, onAutoFill, onMove, onDelete }: {
  paper: Paper; section: Section; setSection: (p: Partial<Section>) => void; onAutoFill: () => void; onMove: (d: number) => void; onDelete: () => void;
}) {
  const { db } = useStore();
  const rs = resolvePaper(paper, db).sections.find((s) => s.id === section.id)!;
  const count = section.count ?? 0;
  const each = section.marksEach ?? 0;
  const attempt = section.attempt ?? 0;
  const counted = attempt && attempt < count ? attempt : count;

  return (
    <>
      <div className="panel">
        <div className="panel-h">Section</div>
        <label>Title<input value={section.title} onChange={(e) => setSection({ title: e.target.value })} /></label>
        <label>Instruction<input value={section.instruction} placeholder={rs.attempt ? `Answer any ${rs.attempt}…  (added automatically)` : 'Optional'} onChange={(e) => setSection({ instruction: e.target.value })} /></label>
      </div>
      <div className="panel">
        <div className="panel-h">Marks plan</div>
        <label>Question type
          <select value={section.templateId ?? ''} onChange={(e) => setSection({ templateId: e.target.value })}>
            <option value="">Any type</option>
            {db.templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <div className="two">
          <label>No. of questions<input type="number" min={0} value={count || ''} onChange={(e) => setSection({ count: Number(e.target.value) || 0 })} /></label>
          <label>Marks each<input type="number" min={0} step={0.5} value={each || ''} placeholder="own" onChange={(e) => setSection({ marksEach: Number(e.target.value) || 0 })} /></label>
        </div>
        <label>Internal choice: answer any
          <input type="number" min={0} value={attempt || ''} placeholder="all compulsory" onChange={(e) => setSection({ attempt: Number(e.target.value) || 0 })} />
        </label>
        {count > 0 && each > 0 && (
          <div className="plan-sum">
            {attempt > 0 && attempt < count && <>Answer any {attempt} of {count}<br /></>}
            <b>{counted} × {each} = {counted * each} marks</b>
          </div>
        )}
        <div className="progress">
          <div className="bar-t"><div style={{ width: `${count ? Math.min(100, (rs.questions.length / count) * 100) : 0}%` }} /></div>
          <span>{rs.questions.length}{count > 0 && ` of ${count}`} questions · {rs.marks} marks</span>
        </div>
        <button className="primary block" disabled={!count || rs.questions.length >= count} onClick={onAutoFill}>
          ✨ Auto-fill from question bank
        </button>
        <div className="muted">Picks unused {paper.subject || ''} questions of this type, spread across chapters.</div>
      </div>
      <div className="panel row">
        <button onClick={() => onMove(-1)}>↑ Move up</button>
        <button onClick={() => onMove(1)}>↓ Move down</button>
        <button className="danger" onClick={onDelete}>Delete section</button>
      </div>
    </>
  );
}

function QuestionPanel({ rq, isAlt, section, onChange, onDuplicate, onRemove, onAddAltNew, onAddAltBank, onRemoveAlt, onSwapAlt }: {
  rq: ResolvedQuestion; isAlt: boolean; section: Section; onChange: (q: Partial<Question>) => void; onDuplicate: () => void; onRemove: () => void;
  onAddAltNew: () => void; onAddAltBank: () => void; onRemoveAlt: () => void; onSwapAlt: () => void;
}) {
  const { db, t } = useStore();
  const q = isAlt ? rq.alt!.question : rq.question;
  const template = isAlt ? rq.alt!.template : rq.template;
  const chapters = [...new Set(db.questions.filter((x) => x.subject === q.subject).map((x) => x.chapter).filter(Boolean))];
  const lines = template.fields.filter((f) => f.type === 'lines');
  const fromParts = partsMarks(template, q.data) !== null;
  const altMarksDiffer = rq.alt && !section.marksEach && rq.alt.question.marks !== rq.question.marks;
  return (
    <>
      <div className="panel">
        <div className="panel-h">{template.name} · Q{rq.number}{isAlt && ' (OR)'}</div>
        {section.marksEach ? (
          <div className="msg">Marks set by section: {section.marksEach} each</div>
        ) : fromParts ? (
          <div className="msg">Marks = sum of parts: <b>{q.marks}</b>. Set each part's marks on the paper.</div>
        ) : (
          <label>{t('marks')}<input type="number" min={0.5} step={0.5} value={q.marks} onChange={(e) => onChange({ marks: Number(e.target.value) })} /></label>
        )}
        {isAlt && !section.marksEach && <div className="muted">The main question's marks ({rq.question.marks}) are what count in the total.</div>}
        <label>{t('subject')}<input value={q.subject} onChange={(e) => onChange({ subject: e.target.value })} /></label>
        <label>{t('chapter')}<input list="ed-chapters" value={q.chapter} onChange={(e) => onChange({ chapter: e.target.value })} /></label>
        <datalist id="ed-chapters">{chapters.map((c) => <option key={c} value={c} />)}</datalist>
        <label>{t('difficulty')}
          <select value={q.difficulty} onChange={(e) => onChange({ difficulty: e.target.value as Difficulty })}>
            <option value="easy">{t('easy')}</option><option value="medium">{t('medium')}</option><option value="hard">{t('hard')}</option>
          </select>
        </label>
        {lines.map((f) => (
          <label key={f.key}>{f.label}
            <input type="number" min={0} max={60} value={Number(q.data[f.key] ?? f.default) || 0} onChange={(e) => onChange({ data: { ...q.data, [f.key]: Number(e.target.value) } })} />
          </label>
        ))}
      </div>
      <div className="panel">
        <div className="panel-h">Internal choice (either / or)</div>
        {rq.alt ? (
          <>
            <div className="msg ok">Q{rq.number} has an OR question. Students answer one of them.</div>
            {altMarksDiffer && <div className="msg under">The two questions have different marks ({rq.question.marks} and {rq.alt.question.marks}).</div>}
            <div className="row wrap">
              <button onClick={onSwapAlt}>⇅ Swap order</button>
              <button className="danger" onClick={onRemoveAlt}>Remove OR question</button>
            </div>
          </>
        ) : (
          <>
            <div className="muted">Print another question under the same number with "OR" between them.</div>
            <div className="row wrap">
              <button onClick={onAddAltNew}>+ New OR question</button>
              <button onClick={onAddAltBank}>📚 OR from bank</button>
            </div>
          </>
        )}
      </div>
      <div className="panel">
        <div className="muted">This question is saved in the question bank. Edits here update it everywhere it is used.</div>
        {!isAlt && (
          <div className="row" style={{ marginTop: 8 }}>
            <button onClick={onDuplicate}>⧉ Duplicate</button>
            <button className="danger" onClick={onRemove}>Remove from paper</button>
          </div>
        )}
      </div>
    </>
  );
}

export { PaperPanel, SectionPanel, QuestionPanel };
