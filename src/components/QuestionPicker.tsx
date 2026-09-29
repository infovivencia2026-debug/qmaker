import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { questionSummary } from '../lib/paper';
import Modal from './Modal';

export default function QuestionPicker({ subject, templateId = '', exclude, onAdd, onClose }: { subject: string; templateId?: string; exclude: Set<string>; onAdd: (ids: string[]) => void; onClose: () => void }) {
  const { db, t } = useStore();
  const templates = useMemo(() => new Map(db.templates.map((x) => [x.id, x])), [db.templates]);
  const subjects = [...new Set(db.questions.map((q) => q.subject))].sort();
  const [f, setF] = useState({ subject: subjects.includes(subject) ? subject : '', chapter: '', template: templateId, difficulty: '', text: '' });
  const [picked, setPicked] = useState<string[]>([]);

  const chapters = [...new Set(db.questions.filter((q) => !f.subject || q.subject === f.subject).map((q) => q.chapter).filter(Boolean))].sort();
  const list = db.questions.filter(
    (q) =>
      !exclude.has(q.id) &&
      (!f.subject || q.subject === f.subject) &&
      (!f.chapter || q.chapter === f.chapter) &&
      (!f.template || q.templateId === f.template) &&
      (!f.difficulty || q.difficulty === f.difficulty) &&
      (!f.text || questionSummary(q, templates.get(q.templateId)).toLowerCase().includes(f.text.toLowerCase())),
  );
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const marks = picked.reduce((s, id) => s + (db.questions.find((q) => q.id === id)?.marks ?? 0), 0);

  return (
    <Modal title={t('addQuestions')} onClose={onClose} wide footer={<>
      <span className="muted">{picked.length} {t('selected')} · {marks} {t('marks')}</span>
      <button className="ghost" onClick={onClose}>{t('cancel')}</button>
      <button className="primary" disabled={!picked.length} onClick={() => onAdd(picked)}>{t('add')}</button>
    </>}>
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
        <select value={f.difficulty} onChange={(e) => setF({ ...f, difficulty: e.target.value })}>
          <option value="">{t('difficulty')}: {t('all')}</option>
          <option value="easy">{t('easy')}</option><option value="medium">{t('medium')}</option><option value="hard">{t('hard')}</option>
        </select>
        <input placeholder={t('search')} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} />
      </div>
      <div className="pick-list">
        {!list.length && <p className="muted">{t('noItems')}</p>}
        {list.map((q) => (
          <label key={q.id} className={`pick ${picked.includes(q.id) ? 'on' : ''}`}>
            <input type="checkbox" checked={picked.includes(q.id)} onChange={() => toggle(q.id)} />
            <span className="grow clip">{questionSummary(q, templates.get(q.templateId))}</span>
            <span className="tag">{templates.get(q.templateId)?.name}</span>
            <span className="tag">{q.chapter}</span>
            <span className="num">{q.marks}</span>
          </label>
        ))}
      </div>
    </Modal>
  );
}
