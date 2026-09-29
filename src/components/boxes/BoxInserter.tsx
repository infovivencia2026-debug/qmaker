import { useState } from 'react';
import { useStore } from '../../store';
import { cloneBox, type Box } from '../../lib/box';
import { PRESETS, PRESET_GROUPS } from '../../lib/presets';
import { richPlain } from '../../lib/richdoc';
import { uid } from '../../lib/util';

/** Pick what to insert: any preset, or anything saved in the library. */
export default function BoxInserter({ onPick, onClose }: { onPick: (b: Box) => void; onClose: () => void }) {
  const { db } = useStore();
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'presets' | 'library'>('presets');
  const match = (s: string) => s.toLowerCase().includes(q.toLowerCase());
  const presets = PRESETS.filter((p) => match(`${p.name} ${p.group} ${p.hint}`));
  const summary = (b: Box): string => {
    let t = b.content ? richPlain(b.content) : '';
    for (const c of b.children ?? []) if (t.length < 80) t += ` ${summary(c)}`;
    return t.trim();
  };
  const library = db.library.filter((b) => match(`${b.name ?? ''} ${b.meta?.subject ?? ''} ${b.meta?.chapter ?? ''} ${summary(b)}`));

  return (
    <div className="ins-bg" onMouseDown={onClose}>
      <div className="ins wide" onMouseDown={(e) => e.stopPropagation()}>
        <input autoFocus className="ins-search" placeholder="Search question types and your library…" value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') onClose(); if (e.key === 'Enter' && tab === 'presets' && presets[0]) onPick(presets[0].make()); }} />
        <div className="ins-tabs">
          <button className={tab === 'presets' ? 'on' : ''} onClick={() => setTab('presets')}>Types ({presets.length})</button>
          <button className={tab === 'library' ? 'on' : ''} onClick={() => setTab('library')}>My library ({library.length})</button>
        </div>
        <div className="ins-scroll">
          {tab === 'presets' && PRESET_GROUPS.map((g) => {
            const items = presets.filter((p) => p.group === g);
            if (!items.length) return null;
            return (
              <div key={g}>
                <div className="ins-h">{g}</div>
                <div className="ins-grid3">
                  {items.map((p) => (
                    <button key={p.name} className="ins-card" onClick={() => onPick(p.make())}>
                      <b>{p.name}</b>
                      <span>{p.hint}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          {tab === 'library' && (
            <div className="ins-lib">
              {!library.length && <p className="muted">Nothing saved yet. Select any box on a paper and press ☆ to save it here.</p>}
              {library.map((b) => (
                <button key={b.id} className="ins-libitem" onClick={() => onPick(cloneBox(b, uid))}>
                  <b>{b.name || 'Saved box'}</b>
                  <span className="muted">{[b.meta?.subject, b.meta?.chapter].filter(Boolean).join(' · ')}</span>
                  <span className="clip">{summary(b) || '(empty)'}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
