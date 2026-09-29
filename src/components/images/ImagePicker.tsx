import { useState } from 'react';
import { useStore } from '../../store';
import { imgSrc } from '../../lib/images';
import Modal from '../Modal';
import { matchesImage } from './imageUsage';

/** Search the image store by name and pick one or more images. */
export default function ImagePicker({ onPick, onClose }: { onPick: (ids: string[]) => void; onClose: () => void }) {
  const { db } = useStore();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const list = Object.values(db.images).filter((a) => matchesImage(a.name, q)).sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0));
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return (
    <Modal title="Image store" wide onClose={onClose} footer={<>
      <span className="muted">{picked.length ? `${picked.length} selected (several = a row)` : 'Click images to select'}</span>
      <button className="ghost" onClick={onClose}>Cancel</button>
      <button className="primary" disabled={!picked.length} onClick={() => onPick(picked)}>Insert</button>
    </>}>
      <input autoFocus className="ins-search" placeholder="Search images by name…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="img-grid">
        {!list.length && <p className="muted">No images match. Add images with ＋ Insert → Image, or on the Images page.</p>}
        {list.map((a) => (
          <button key={a.id} className={`img-card ${picked.includes(a.id) ? 'on' : ''}`} onClick={() => toggle(a.id)} onDoubleClick={() => onPick([a.id])}>
            <img src={imgSrc(a)} />
            <span className="clip">{a.name || 'Unnamed'}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
