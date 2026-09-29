import { useState } from 'react';
import type { Paper } from '../shared/types';
import { useStore } from '../store';
import { marksOf, walkBoxes } from '../lib/box';
import { paperToBox } from '../lib/boxMigrate';
import { PRESETS } from '../lib/presets';
import { uid } from '../lib/util';
import PaperEditor from './PaperEditor';

export function newPaper(): Paper {
  const now = Date.now();
  return {
    id: uid(), examName: '', subject: '', className: '', duration: '3 Hours', date: '', answerSpace: false,
    instructions: '1. All questions are compulsory.\n2. Marks for each question are shown on the right.',
    sections: [],
    body: {
      id: uid(),
      children: [PRESETS.find((p) => p.name === 'Instructions')!.make(), { ...PRESETS.find((p) => p.name === 'Section / heading')!.make(), children: [PRESETS.find((p) => p.name === 'Question')!.make()] }],
    },
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
    // A copy starts unlocked so it can be edited into next year's paper.
    const copy = { ...structuredClone(p), locked: undefined, id: uid(), examName: `${p.examName} (copy)`, createdAt: Date.now(), updatedAt: Date.now() };
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
            const body = p.body ?? paperToBox(p, db);
            let questions = 0;
            walkBoxes(body, (b) => { if (b.number?.scope === 'paper') questions++; });
            return (
              <tr key={p.id} onDoubleClick={() => setOpenId(p.id)}>
                <td className="grow"><b>{p.examName || t('untitled')}</b>{p.locked && <span className="tag">🔒 locked</span>}<div className="muted">{[p.className, p.subject].filter(Boolean).join(' · ')}</div></td>
                <td>{questions} {t('questions')}</td>
                <td>{marksOf(body)} {t('marks')}</td>
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
