import { useEffect, useState } from 'react';
import { serialize, useStore } from '../store';
import type { ImageAsset } from '../shared/types';
import { bankBundle, mergeBundle, parseBundle, storeBundleImages, type MergeStats } from '../lib/bundle';
import { embedImages, storeImages } from '../lib/images';
import { safeFileName } from '../lib/util';

export default function Share() {
  const { db, update, t, notify, replaceDb } = useStore();
  const [backups, setBackups] = useState<{ name: string; time: number; size: number }[]>([]);
  const refreshBackups = () => window.qmaker.listBackups().then(setBackups);
  useEffect(() => { refreshBackups(); }, []);
  const subjects = [...new Set(db.questions.map((q) => q.subject))].sort();
  const [subject, setSubject] = useState('');
  const [exported, setExported] = useState<string | null>(null);
  const [result, setResult] = useState<(MergeStats & { name: string; papers: number }) | null>(null);

  const exportBank = async () => {
    const bundle = await bankBundle(db, subject || null);
    const name = safeFileName(`${db.settings.institutionName || 'QMaker'} - ${subject || 'All subjects'} - ${new Date().toISOString().slice(0, 10)}`);
    const path = await window.qmaker.saveFile(new TextEncoder().encode(JSON.stringify(bundle)), `${name}.qbank`, 'QMaker Question Bank', 'qbank');
    if (path) setExported(path);
  };

  const importFile = async () => {
    const f = await window.qmaker.openFile();
    if (!f) return;
    try {
      const bundle = await storeBundleImages(parseBundle(f.text));
      const r = mergeBundle(db, bundle);
      update((cur) => mergeBundle(cur, bundle).db);
      setResult({ ...r.stats, name: f.name, papers: r.papers });
    } catch (e) {
      notify(`${f.name}: ${(e as Error).message}`);
    }
  };

  const saveBackup = async () => {
    const name = safeFileName(`QMaker backup - ${db.settings.institutionName || 'all data'} - ${new Date().toISOString().slice(0, 10)}`);
    const withImages = { ...db, images: await embedImages(db.images) };
    const path = await window.qmaker.saveFile(new TextEncoder().encode(serialize(withImages)), `${name}.qbackup`, 'QMaker backup', 'qbackup');
    if (path) notify(`${t('saved')}: ${path}`, path);
  };

  const restore = async (text: string, label: string) => {
    let data: { questions?: unknown[]; papers?: unknown[]; images?: Record<string, ImageAsset> };
    try {
      data = JSON.parse(text);
    } catch {
      return notify('This backup file is damaged.');
    }
    if (!Array.isArray(data?.questions) || !Array.isArray(data?.papers)) return notify('This is not a QMaker backup.');
    const ok = confirm(
      `Replace ALL current data with "${label}"?\n\nBackup has ${data.questions.length} questions and ${data.papers.length} papers.\n` +
      `You have ${db.questions.length} questions and ${db.papers.length} papers now — they will be saved as a safety copy first.`,
    );
    if (!ok) return;
    await window.qmaker.snapshotBackup(serialize(db));
    replaceDb({ ...data, images: await storeImages(data.images) });
    refreshBackups();
    notify(`Restored "${label}". Press Ctrl+Z to undo.`);
  };

  const restoreFromFile = async () => {
    const f = await window.qmaker.openFile('backup');
    if (f) restore(f.text, f.name);
  };

  const backupLabel = (name: string) =>
    name.startsWith('auto-') ? `Automatic · ${name.slice(5, 15)}` : name.startsWith('before-restore-') ? `Before restore · ${name.slice(15, 25)}` : name;

  return (
    <div className="page narrow">
      <h1>{t('share')}</h1>
      <div className="card">
        <h2>{t('exportBank')}</h2>
        <div className="row">
          <select value={subject} onChange={(e) => setSubject(e.target.value)}>
            <option value="">{t('all')} ({db.questions.length})</option>
            {subjects.map((s) => <option key={s} value={s}>{s} ({db.questions.filter((q) => q.subject === s).length})</option>)}
          </select>
          <button className="primary" onClick={exportBank}>⤓ {t('exportBank')}</button>
        </div>
        {exported && (
          <div className="note">
            <div>{t('saved')}: {exported}</div>
            <p>{t('whatsappHint')}</p>
            <button onClick={() => window.qmaker.showInFolder(exported)}>{t('showInFolder')}</button>
          </div>
        )}
        <p className="muted">To share one paper with its questions, open the paper and use "{t('sharePaper')}".</p>
      </div>
      <div className="card">
        <h2>{t('importFile')}</h2>
        <p className="muted">.qbank / .qpaper — questions you already have are kept; newer edits replace older ones.</p>
        <button className="primary" onClick={importFile}>{t('importFile')}…</button>
        {result && (
          <div className="note">
            <b>{result.name}</b>: {result.added} new, {result.updated} updated, {result.skipped} already up to date
            {result.papers > 0 && `, ${result.papers} paper(s)`}.
          </div>
        )}
      </div>
      <div className="card">
        <h2>Backup &amp; restore</h2>
        <p className="muted">A backup holds everything: all questions, papers, templates, images and settings. Keep one on a pen drive or in your email.</p>
        <div className="row wrap">
          <button className="primary" onClick={saveBackup}>⤓ Save backup file…</button>
          <button onClick={restoreFromFile}>Restore from backup file…</button>
        </div>
        <h3>Automatic backups</h3>
        <p className="muted">QMaker keeps a copy of your data every day (the last 14 days), and before every restore.</p>
        {!backups.length && <p className="muted">No automatic backups yet — the first is made the next time you edit something.</p>}
        <table className="list compact">
          <tbody>
            {backups.map((b) => (
              <tr key={b.name}>
                <td className="grow">{backupLabel(b.name)}</td>
                <td className="muted">{new Date(b.time).toLocaleString()}</td>
                <td className="muted">{Math.max(1, Math.round(b.size / 1024))} KB</td>
                <td><button onClick={async () => restore(await window.qmaker.readBackup(b.name), backupLabel(b.name))}>Restore</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="ghost" onClick={() => window.qmaker.openBackupFolder()}>Open backups folder</button>
      </div>
    </div>
  );
}
