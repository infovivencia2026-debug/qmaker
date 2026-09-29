import { useState } from 'react';
import type { Paper } from '../shared/types';
import { useStore } from '../store';
import { resolvePaper } from '../lib/paper';
import { uid } from '../lib/util';
import PaperEditor from './PaperEditor';

export function newPaper(): Paper {
  const now = Date.now();
  return {
    id: uid(), examName: '', subject: '', className: '', duration: '3 Hours', date: '', answerSpace: false,
    instructions: '1. All questions are compulsory.\n2. Marks for each question are shown on the right.',
    sections: [{ id: uid(), title: 'Section A', instruction: '', questionIds: [] }],
    createdAt: now, updatedAt: now,
  };
}

export default function Papers() {
  const { db, update, t } = useStore();
  const [openId, setOpenId] = useState<string | null>(null);
  if (openId && db.papers.some((p) => p.id === openId)) return <PaperEditor id={openId} onBack={() => setOpenId(null)} />;

  const create = () => {
    const p = newPaper();
    update((db) => ({ ...db, papers: [...db.papers, p] }));
    setOpenId(p.id);
  };
  const duplicate = (p: Paper) => {
    const copy = { ...structuredClone(p), id: uid(), examName: `${p.examName} (copy)`, createdAt: Date.now(), updatedAt: Date.now() };
    update((db) => ({ ...db, papers: [...db.papers, copy] }));
  };
  const remove = (p: Paper) => confirm(t('confirmDelete')) && update((db) => ({ ...db, papers: db.papers.filter((x) => x.id !== p.id) }));
  const papers = [...db.papers].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="page">
      <div className="page-h">
        <h1>{t('papers')}</h1>
        <button className="primary" onClick={create}>+ {t('newPaper')}</button>
      </div>
      {!papers.length && <p className="muted">{t('noItems')}</p>}
      <table className="list">
        <tbody>
          {papers.map((p) => {
            const r = resolvePaper(p, db);
            return (
              <tr key={p.id} onDoubleClick={() => setOpenId(p.id)}>
                <td className="grow"><b>{p.examName || t('untitled')}</b><div className="muted">{[p.className, p.subject].filter(Boolean).join(' · ')}</div></td>
                <td>{r.sections.reduce((n, s) => n + s.questions.length, 0)} {t('questions')}</td>
                <td>{r.totalMarks} {t('marks')}</td>
                <td className="muted">{new Date(p.updatedAt).toLocaleDateString()}</td>
                <td className="actions">
                  <button onClick={() => setOpenId(p.id)}>{t('open')}</button>
                  <button className="ghost" onClick={() => duplicate(p)}>{t('duplicate')}</button>
                  <button className="ghost danger" onClick={() => remove(p)}>{t('delete')}</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
