import { useState } from 'react';
import type { Difficulty, FieldDef, OptionsValue, PairsValue, Part, PartNumbering, Question, Template } from '../shared/types';
import { isGroupTemplate } from '../shared/templates';
import { blankPart } from './editor/QuestionBlock';
import { useStore } from '../store';
import { asOptions, asParts, asText, fieldValue, papersUsing, partLabel, partsMarks } from '../lib/paper';
import { letter, uid } from '../lib/util';
import Modal from './Modal';
import RichInput from './RichInput';

export function blankQuestion(template: Template, subject = '', chapter = ''): Question {
  const data: Record<string, unknown> = {};
  for (const f of template.fields) if (f.default !== undefined) data[f.key] = structuredClone(f.default);
  return {
    id: uid(), templateId: template.id, templateVersion: template.version, subject, chapter,
    difficulty: 'medium', marks: template.defaultMarks, data, createdAt: Date.now(), updatedAt: Date.now(),
  };
}

function validate(q: Question, template: Template): string | null {
  if (!q.subject.trim()) return 'Subject is required.';
  if (!(q.marks > 0)) return 'Marks must be more than 0.';
  for (const f of template.fields) {
    if (!f.required) continue;
    const v = fieldValue(q, f);
    if (f.type === 'text' && !asText(v).trim()) return `"${f.label}" is required.`;
    if (f.type === 'options' && asOptions(v).items.filter((s) => s.trim()).length < 2) return `"${f.label}" needs at least 2 options.`;
    if (f.type === 'pairs' && !(v as PairsValue).some((p) => p[0].trim() && p[1].trim())) return `"${f.label}" needs at least one pair.`;
    if (f.type === 'parts' && !asParts(v).items.length) return `"${f.label}" needs at least one part.`;
  }
  return null;
}

function PartsInput({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const { db } = useStore();
  const pv = asParts(value);
  const setParts = (items: Part[], numbering: PartNumbering = pv.numbering) => onChange({ numbering, items });
  const setPart = (i: number, patch: Partial<Part>) => setParts(pv.items.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  return (
    <div className="stack">
      {pv.items.map((p, i) => {
        const t = db.templates.find((x) => x.id === p.templateId);
        return (
          <div key={p.id} className="part-card">
            <div className="row">
              <b>{partLabel(pv.numbering, i)}</b>
              <span className="tag">{t?.name ?? '?'}</span>
              <span className="grow" />
              <label className="check">Marks <input type="number" min={0} step={0.5} style={{ width: 70 }} value={p.marks} onChange={(e) => setPart(i, { marks: Number(e.target.value) })} /></label>
              <button className="ghost danger" onClick={() => setParts(pv.items.filter((_, j) => j !== i))}>✕</button>
            </div>
            {t?.fields.map((f) => (
              <div className="field" key={f.key}>
                <div className="field-l">{f.label}{f.answer && <span className="tag">answer key</span>}</div>
                <FieldInput field={f} value={fieldValue(p, f)} onChange={(v) => setPart(i, { data: { ...p.data, [f.key]: v } })} />
              </div>
            ))}
          </div>
        );
      })}
      <div className="row wrap">
        <span className="muted">Add part:</span>
        {db.templates.filter((t) => !isGroupTemplate(t)).map((t) => (
          <button key={t.id} className="ghost" onClick={() => setParts([...pv.items, blankPart(t)])}>+ {t.name}</button>
        ))}
        <span className="muted">Numbering:</span>
        <select value={pv.numbering} onChange={(e) => setParts(pv.items, e.target.value as PartNumbering)}>
          <option value="a">(a) (b) (c)</option><option value="i">(i) (ii) (iii)</option><option value="1">(1) (2) (3)</option>
        </select>
      </div>
    </div>
  );
}

export function FieldInput({ field, value, onChange }: { field: FieldDef; value: unknown; onChange: (v: unknown) => void }) {
  switch (field.type) {
    case 'parts':
      return <PartsInput value={value} onChange={onChange} />;
    case 'text':
      return <RichInput boxed value={asText(value)} onChange={onChange} />;
    case 'lines':
      return <input type="number" min={0} max={60} value={Number(value) || 0} onChange={(e) => onChange(Number(e.target.value))} />;
    case 'truefalse':
      return (
        <div className="row">
          {[true, false].map((b) => (
            <label key={String(b)} className="check">
              <input type="radio" checked={value === b} onChange={() => onChange(b)} /> {b ? 'True' : 'False'}
            </label>
          ))}
        </div>
      );
    case 'options': {
      const o = asOptions(value);
      const set = (next: Partial<OptionsValue>) => onChange({ ...o, ...next });
      return (
        <div className="stack">
          {o.items.map((it, i) => (
            <div className="row" key={i}>
              <input type="radio" title="Correct answer" checked={o.correct === i} onChange={() => set({ correct: i })} />
              <span>({letter(i)})</span>
              <RichInput boxed single className="grow" value={it} onChange={(t) => set({ items: o.items.map((x, j) => (j === i ? t : x)) })} />
              <button className="ghost" disabled={o.items.length <= 2} onClick={() =>
                set({ items: o.items.filter((_, j) => j !== i), correct: o.correct === i ? null : o.correct !== null && o.correct > i ? o.correct - 1 : o.correct })
              }>✕</button>
            </div>
          ))}
          <div><button className="ghost" disabled={o.items.length >= 8} onClick={() => set({ items: [...o.items, ''] })}>+ Option</button>
            <span className="muted"> ◉ marks the correct answer</span></div>
        </div>
      );
    }
    case 'pairs': {
      const pairs = (Array.isArray(value) ? value : []) as PairsValue;
      const setPair = (i: number, side: 0 | 1, text: string) =>
        onChange(pairs.map((p, j) => (j === i ? ((side ? [p[0], text] : [text, p[1]]) as [string, string]) : p)));
      return (
        <div className="stack">
          <div className="muted">Enter the correct pairs. Column B is shuffled automatically when printed.</div>
          {pairs.map((p, i) => (
            <div className="row" key={i}>
              <span>{i + 1}.</span>
              <RichInput boxed single className="grow" placeholder="A" value={p[0]} onChange={(t) => setPair(i, 0, t)} />
              <span>↔</span>
              <RichInput boxed single className="grow" placeholder="B" value={p[1]} onChange={(t) => setPair(i, 1, t)} />
              <button className="ghost" onClick={() => onChange(pairs.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          <div><button className="ghost" onClick={() => onChange([...pairs, ['', '']])}>+ Pair</button></div>
        </div>
      );
    }
  }
}

export default function QuestionForm({ initial, onClose }: { initial: Question; onClose: () => void }) {
  const { db, update, t } = useStore();
  const [q, setQ] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const template = db.templates.find((x) => x.id === q.templateId);
  const subjects = [...new Set(db.questions.map((x) => x.subject))];
  const chapters = [...new Set(db.questions.filter((x) => x.subject === q.subject).map((x) => x.chapter))];

  if (!template) return <Modal title="Missing template" onClose={onClose}>The template for this question was deleted.</Modal>;

  const save = () => {
    const err = validate(q, template);
    if (err) return setError(err);
    const sum = partsMarks(template, q.data);
    const saved = { ...q, marks: sum ?? q.marks, subject: q.subject.trim(), chapter: q.chapter.trim(), templateVersion: template.version, updatedAt: Date.now() };
    update((db) => ({
      ...db,
      questions: db.questions.some((x) => x.id === saved.id) ? db.questions.map((x) => (x.id === saved.id ? saved : x)) : [...db.questions, saved],
    }));
    onClose();
  };

  return (
    <Modal title={template.name} onClose={onClose} wide footer={<>
      {error && <span className="err">{error}</span>}
      <button className="ghost" onClick={onClose}>{t('cancel')}</button>
      <button className="primary" onClick={save}>{t('save')}</button>
    </>}>
      {(() => {
        const used = papersUsing(db, q.id);
        return used.length > 0 && (
          <div className="msg under">Used in {used.length} paper{used.length > 1 ? 's' : ''} ({used.slice(0, 3).map((p) => p.examName || t('untitled')).join(', ')}). Saving changes them too — use Duplicate in the bank for a separate version. Locked papers are not affected.</div>
        );
      })()}
      <div className="grid4">
        <label>{t('subject')}<input list="subjects" value={q.subject} onChange={(e) => setQ({ ...q, subject: e.target.value })} /></label>
        <label>{t('chapter')}<input list="chapters" value={q.chapter} onChange={(e) => setQ({ ...q, chapter: e.target.value })} /></label>
        <label>{t('difficulty')}
          <select value={q.difficulty} onChange={(e) => setQ({ ...q, difficulty: e.target.value as Difficulty })}>
            <option value="easy">{t('easy')}</option><option value="medium">{t('medium')}</option><option value="hard">{t('hard')}</option>
          </select>
        </label>
        <label>{t('marks')}<input type="number" min={0.5} step={0.5} value={q.marks} onChange={(e) => setQ({ ...q, marks: Number(e.target.value) })} /></label>
      </div>
      <datalist id="subjects">{subjects.map((s) => <option key={s} value={s} />)}</datalist>
      <datalist id="chapters">{chapters.map((s) => <option key={s} value={s} />)}</datalist>
      {template.fields.map((f) => (
        <div className="field" key={f.key}>
          <div className="field-l">{f.label}{f.required && ' *'}{f.answer && <span className="tag">{t('answerKey')}</span>}</div>
          <FieldInput field={f} value={fieldValue(q, f)} onChange={(v) => setQ({ ...q, data: { ...q.data, [f.key]: v } })} />
        </div>
      ))}
    </Modal>
  );
}
