import { useRef, useState } from 'react';
import { useStore } from '../store';
import { imgSrc } from '../lib/images';
import { imageUsage, matchesImage } from '../components/images/imageUsage';

/** All pictures, searchable by name: add, rename, delete. */
export default function Images() {
  const { db, update, addImage, notify } = useStore();
  const [q, setQ] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const usage = imageUsage(db);
  const list = Object.values(db.images).filter((a) => matchesImage(a.name, q)).sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0));
  const rename = (id: string, name: string) => update((db) => ({ ...db, images: { ...db.images, [id]: { ...db.images[id], name } } }));
  const remove = (id: string) => {
    const n = usage.get(id) ?? 0;
    if (n) return notify(`This image is used in ${n} paper(s)/library item(s). Remove it from them first.`);
    if (!confirm('Delete this image from the store?')) return;
    update((db) => {
      const images = { ...db.images };
      delete images[id];
      return { ...db, images };
    });
  };
  return (
    <div className="page">
      <div className="page-h">
        <h1>Images <span className="muted">({Object.keys(db.images).length})</span></h1>
        <button className="primary" onClick={() => file.current?.click()}>+ Add images</button>
        <input ref={file} type="file" accept="image/*" multiple hidden onChange={async (e) => {
          for (const f of [...(e.target.files ?? [])]) await addImage(f);
          e.target.value = '';
        }} />
      </div>
      <input className="img-search" placeholder="Search by name… (e.g. heart diagram)" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="img-grid big">
        {!list.length && <p className="muted">{q ? 'No image matches.' : 'No images yet.'}</p>}
        {list.map((a) => (
          <div key={a.id} className="img-card">
            <img src={imgSrc(a)} />
            <input value={a.name ?? ''} placeholder="Name this image" onChange={(e) => rename(a.id, e.target.value)} />
            <div className="img-meta">
              <span className="muted">{usage.get(a.id) ? `used ${usage.get(a.id)}×` : 'not used'}</span>
              <button className="ghost danger" onClick={() => remove(a.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
