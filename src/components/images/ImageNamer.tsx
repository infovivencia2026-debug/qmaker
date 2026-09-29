import { useEffect, useState } from 'react';
import { useStore } from '../../store';
import { imgSrc } from '../../lib/images';
import Modal from '../Modal';

/** Right after pictures are added: give each a searchable name (pre-filled from the file name). */
export default function ImageNamer() {
  const { db, update, toName, doneNaming } = useStore();
  const [names, setNames] = useState<Record<string, string>>({});
  const ids = toName.filter((id) => db.images[id]);
  useEffect(() => setNames((n) => ({ ...Object.fromEntries(ids.map((id) => [id, db.images[id].name ?? ''])), ...n })), [toName.join()]);
  if (!ids.length) return null;
  const save = () => {
    update((db) => ({ ...db, images: Object.fromEntries(Object.entries(db.images).map(([id, a]) => [id, names[id]?.trim() ? { ...a, name: names[id].trim() } : a])) }));
    setNames({});
    doneNaming();
  };
  return (
    <Modal title={ids.length > 1 ? `Name these ${ids.length} images` : 'Name this image'} onClose={save} footer={<button className="primary" onClick={save}>Save names</button>}>
      <p className="muted">Names make images easy to find later in the image store (search by any word).</p>
      <div className="namer">
        {ids.map((id, i) => (
          <div key={id} className="namer-row">
            <img src={imgSrc(db.images[id])} />
            <input autoFocus={i === 0} value={names[id] ?? ''} placeholder="e.g. human heart diagram" onChange={(e) => setNames({ ...names, [id]: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && i === ids.length - 1 && save()} />
          </div>
        ))}
      </div>
    </Modal>
  );
}
