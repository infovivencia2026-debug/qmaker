import { useState } from 'react';
import type { Template } from '../../shared/types';
import { useStore } from '../../store';
import { templateGlyph } from './icons';

/** WordPress-style block inserter: question types plus the question bank. */
export default function Inserter({ suggested, onPick, onBank, onClose }: { suggested?: string; onPick: (t: Template) => void; onBank: () => void; onClose: () => void }) {
  const { db } = useStore();
  const [q, setQ] = useState('');
  const list = db.templates
    .filter((t) => t.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(b.id === suggested) - Number(a.id === suggested));
  return (
    <div className="ins-bg" onMouseDown={onClose}>
      <div className="ins" onMouseDown={(e) => e.stopPropagation()}>
        <input autoFocus className="ins-search" placeholder="Search question types" value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') onClose(); if (e.key === 'Enter' && list[0]) onPick(list[0]); }} />
        <div className="ins-h">New question</div>
        <div className="ins-grid">
          {list.map((t) => (
            <button key={t.id} className={`ins-item ${t.id === suggested ? 'sug' : ''}`} onClick={() => onPick(t)}>
              <span className="ins-ic">{templateGlyph(t.id)}</span>
              <span>{t.name}</span>
            </button>
          ))}
        </div>
        <button className="ins-bank" onClick={onBank}>📚 Pick from question bank…</button>
      </div>
    </div>
  );
}
