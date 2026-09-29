import { useMemo, useState } from 'react';
import type { Question } from '../shared/types';
import { useStore } from '../store';
import { paperQuestionIds, questionSummary, removeFromSection } from '../lib/paper';
import { uid } from '../lib/util';
import QuestionForm, { blankQuestion } from '../components/QuestionForm';
import Modal from '../components/Modal';

export default function Bank() {
  const { db, update, t } = useStore();
  const templates = useMemo(() => new Map(db.templates.map((x) => [x.id, x])), [db.templates]);
  const [f, setF] = useState({ subject: '', chapter: '', template: '', text: '' });
  const [editing, setEditing] = useState<Question | null>(null);
  const [choosing, setChoosing] = useState(false);

  const subjects = [...new Set(db.questions.map((q) => q.subject))].sort();
  const chapters = [...new Set(db.questions.filter((q) => !f.subject || q.subject === f.subject).map((q) => q.chapter).filter(Boolean))].sort();
  const list = db.questions
    .filter(
      (q) =>
        (!f.subject || q.subject === f.subject) &&
        (!f.chapter || q.chapter === f.chapter) &&
        (!f.template || q.templateId === f.template) &&
        (!f.text || questionSummary(q, templates.get(q.templateId)).toLowerCase().includes(f.text.toLowerCase())),
    )
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const remove = (q: Question) => {
    // Locked papers keep their own frozen copy, so only editable papers lose the question.
    const usedIn = db.papers.filter((p) => !p.locked && paperQuestionIds(p).includes(q.id));
    const msg = usedIn.length ? `This question is used in ${usedIn.length} paper(s) and will be removed from them. ${t('confirmDelete')}` : t('confirmDelete');
    if (!confirm(msg)) return;
    update((db) => ({
      ...db,
      questions: db.questions.filter((x) => x.id !== q.id),
      papers: db.papers.map((p) =>
        usedIn.includes(p) ? { ...p, sections: p.sections.map((s) => removeFromSection(s, q.id)) } : p,
      ),
    }));
  };

  return (
    <div className="page">
      <div className="page-h">
        <h1>{t('bank')} <span className="muted">({db.questions.length})</span></h1>
        <button className="primary" onClick={() => setChoosing(true)}>+ {t('newQuestion')}</button>
      </div>
      <div className="filters">
        <select value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value, chapter: '' })}>
          <option value="">{t('subject')}: {t('all')}</option>{subjects.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select value={f.chapter} onChange={(e) => setF({ ...f, chapter: e.target.value })}>
          <option value="">{t('chapter')}: {t('all')}</option>{chapters.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select value={f.template} onChange={(e) => setF({ ...f, template: e.target.value })}>
          <option value="">{t('template')}: {t('all')}</option>{db.templates.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        <input placeholder={t('search')} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} />
      </div>
      {!list.length && <p className="muted">{t('noItems')}</p>}
      <table className="list">
        <tbody>
          {list.map((q) => (
            <tr key={q.id} onDoubleClick={() => setEditing(q)}>
              <td className="grow clip-cell">{questionSummary(q, templates.get(q.templateId))}</td>
              <td><span className="tag">{templates.get(q.templateId)?.name ?? '?'}</span></td>
              <td className="muted">{q.subject}{q.chapter && ` · ${q.chapter}`}</td>
              <td className="muted">{t(q.difficulty)}</td>
              <td className="num">{q.marks}</td>
              <td className="actions">
                <button onClick={() => setEditing(q)}>{t('edit')}</button>
                <button className="ghost" onClick={() => setEditing({ ...structuredClone(q), id: uid(), createdAt: Date.now() })}>{t('duplicate')}</button>
                <button className="ghost danger" onClick={() => remove(q)}>{t('delete')}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {choosing && (
        <Modal title={t('template')} onClose={() => setChoosing(false)}>
          <div className="tpl-grid">
            {db.templates.map((tpl) => (
              <button key={tpl.id} className="tpl" onClick={() => { setChoosing(false); setEditing(blankQuestion(tpl, f.subject, f.chapter)); }}>
                <b>{tpl.name}</b>
                <span className="muted">{tpl.fields.map((x) => x.label).join(' · ')}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}
      {editing && <QuestionForm key={editing.id} initial={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
