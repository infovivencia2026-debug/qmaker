import { useState } from 'react';
import type { FieldDef, FieldType, Template } from '../shared/types';
import { useStore } from '../store';
import { uid } from '../lib/util';
import Modal from '../components/Modal';

const FIELD_TYPES: [FieldType, string][] = [
  ['text', 'Text'], ['options', 'Options (MCQ)'], ['truefalse', 'True / False'], ['pairs', 'Match pairs'], ['lines', 'Answer lines'], ['parts', 'Sub-questions (parts)'],
];

function TemplateEditor({ initial, onClose }: { initial: Template; onClose: () => void }) {
  const { db, update, t } = useStore();
  const [tpl, setTpl] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const isNew = !db.templates.some((x) => x.id === tpl.id);

  const setField = (i: number, patch: Partial<FieldDef>) => setTpl({ ...tpl, fields: tpl.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  const moveField = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= tpl.fields.length) return;
    const fields = [...tpl.fields];
    [fields[i], fields[j]] = [fields[j], fields[i]];
    setTpl({ ...tpl, fields });
  };
  const save = () => {
    if (!tpl.name.trim()) return setError('Name is required.');
    if (!tpl.fields.length) return setError('Add at least one field.');
    if (tpl.fields.some((f) => !f.label.trim())) return setError('Every field needs a label.');
    if (!tpl.fields.some((f) => f.type === 'text' && !f.answer)) return setError('Add at least one Text field that is printed on the paper.');
    const fields = tpl.fields.map((f) => ({ ...f, label: f.label.trim(), key: f.key.replace(/^new_/, 'f_') }));
    const saved = { ...tpl, fields, name: tpl.name.trim(), version: isNew ? 1 : tpl.version + 1, updatedAt: Date.now() };
    update((db) => ({ ...db, templates: isNew ? [...db.templates, saved] : db.templates.map((x) => (x.id === saved.id ? saved : x)) }));
    onClose();
  };

  return (
    <Modal title={tpl.name || t('templates')} onClose={onClose} wide footer={<>
      {error && <span className="err">{error}</span>}
      <button className="ghost" onClick={onClose}>{t('cancel')}</button>
      <button className="primary" onClick={save}>{t('save')}</button>
    </>}>
      <div className="grid4">
        <label className="span3">{t('name')}<input value={tpl.name} onChange={(e) => setTpl({ ...tpl, name: e.target.value })} /></label>
        <label>{t('defaultMarks')}<input type="number" min={0.5} step={0.5} value={tpl.defaultMarks} onChange={(e) => setTpl({ ...tpl, defaultMarks: Number(e.target.value) })} /></label>
      </div>
      <h3>{t('fields')}</h3>
      <p className="muted">Fields print in this order. "{t('answerOnly')}" fields appear only in the answer key.</p>
      {tpl.fields.map((f, i) => (
        <div className="row field-row" key={f.key}>
          <input className="grow" value={f.label} placeholder="Label" onChange={(e) => setField(i, { label: e.target.value })} />
          <select value={f.type} disabled={!f.key.startsWith('new_')} title="Type can't change after saving, so existing questions keep working"
            onChange={(e) => setField(i, { type: e.target.value as FieldType, default: undefined })}>
            {FIELD_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <label className="check"><input type="checkbox" checked={!!f.required} onChange={(e) => setField(i, { required: e.target.checked })} /> {t('required')}</label>
          <label className="check"><input type="checkbox" checked={!!f.answer} onChange={(e) => setField(i, { answer: e.target.checked })} /> {t('answerOnly')}</label>
          <button className="ghost" onClick={() => moveField(i, -1)}>↑</button>
          <button className="ghost" onClick={() => moveField(i, 1)}>↓</button>
          <button className="ghost danger" onClick={() => setTpl({ ...tpl, fields: tpl.fields.filter((_, j) => j !== i) })}>✕</button>
        </div>
      ))}
      <button onClick={() => setTpl({ ...tpl, fields: [...tpl.fields, { key: `new_${uid().slice(0, 8)}`, label: '', type: 'text' }] })}>+ {t('addField')}</button>
    </Modal>
  );
}

export default function Templates() {
  const { db, update, t } = useStore();
  const [editing, setEditing] = useState<Template | null>(null);
  const usage = (id: string) => db.questions.filter((q) => q.templateId === id).length;

  const duplicate = (tpl: Template) =>
    setEditing({ ...structuredClone(tpl), id: uid(), name: `${tpl.name} (custom)`, builtin: false, version: 0, updatedAt: Date.now() });
  const remove = (tpl: Template) => {
    const n = usage(tpl.id);
    if (n) return alert(`${n} question(s) use this template. Delete or change them first.`);
    if (confirm(t('confirmDelete'))) update((db) => ({ ...db, templates: db.templates.filter((x) => x.id !== tpl.id) }));
  };
  const blank = (): Template => ({
    id: uid(), name: '', version: 0, builtin: false, defaultMarks: 1, updatedAt: Date.now(),
    fields: [{ key: `new_${uid().slice(0, 8)}`, label: 'Question', type: 'text', required: true }],
  });

  return (
    <div className="page">
      <div className="page-h">
        <h1>{t('templates')}</h1>
        <button className="primary" onClick={() => setEditing(blank())}>+ {t('add')}</button>
      </div>
      <table className="list">
        <tbody>
          {db.templates.map((tpl) => (
            <tr key={tpl.id}>
              <td className="grow"><b>{tpl.name}</b> {tpl.builtin && <span className="tag">{t('builtin')}</span>}
                <div className="muted">{tpl.fields.map((f) => f.label).join(' · ')}</div></td>
              <td className="muted">{usage(tpl.id)} {t('questions')}</td>
              <td className="actions">
                {!tpl.builtin && <button onClick={() => setEditing(tpl)}>{t('edit')}</button>}
                <button className="ghost" onClick={() => duplicate(tpl)}>{t('duplicate')}</button>
                {!tpl.builtin && <button className="ghost danger" onClick={() => remove(tpl)}>{t('delete')}</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {editing && <TemplateEditor key={editing.id} initial={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
