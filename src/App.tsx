import { useEffect, useState } from 'react';
import { useStore } from './store';
import { mergeBundle, parseBundle, storeBundleImages } from './lib/bundle';
import Papers from './pages/Papers';
import Bank from './pages/Bank';
import Templates from './pages/Templates';
import Share from './pages/Share';
import Settings from './pages/Settings';

type Page = 'papers' | 'bank' | 'templates' | 'share' | 'settings';

export default function App() {
  const { t, toast, update, notify, undo, redo, canUndo, canRedo } = useStore();
  const [page, setPage] = useState<Page>('papers');

  // A .qbank/.qpaper opened from Explorer (e.g. a WhatsApp download) is imported straight away.
  useEffect(() => {
    const importFile = async (f: SharedFile) => {
      try {
        const bundle = await storeBundleImages(parseBundle(f.text));
        update((db) => mergeBundle(db, bundle).db);
        notify(`Imported ${f.name}: ${bundle.questions.length} questions, ${bundle.papers.length} papers`);
        setPage(bundle.kind === 'paper' ? 'papers' : 'bank');
      } catch (e) {
        notify(`${f.name}: ${(e as Error).message}`);
      }
    };
    window.qmaker.launchFile().then((f) => f && importFile(f));
    return window.qmaker.onFileOpened(importFile);
  }, [update, notify]);

  // App-wide undo/redo. Text boxes use it too, so one Ctrl+Z always means the same thing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  const nav: [Page, string][] = [
    ['papers', t('papers')], ['bank', t('bank')], ['templates', t('templates')], ['share', t('share')], ['settings', t('settings')],
  ];
  return (
    <div className="app">
      <nav className="side">
        <div className="brand">QMaker</div>
        {nav.map(([p, label]) => (
          <button key={p} className={page === p ? 'on' : ''} onClick={() => setPage(p)}>{label}</button>
        ))}
        <div className="side-undo">
          <button disabled={!canUndo} title="Undo (Ctrl+Z)" onClick={undo}>↶ {t('undo')}</button>
          <button disabled={!canRedo} title="Redo (Ctrl+Y)" onClick={redo}>↷</button>
        </div>
      </nav>
      <main className="main">
        {page === 'papers' && <Papers />}
        {page === 'bank' && <Bank />}
        {page === 'templates' && <Templates />}
        {page === 'share' && <Share />}
        {page === 'settings' && <Settings />}
      </main>
      {toast && (
        <div className="toast">
          <span>{toast.message}</span>
          {toast.path && <button onClick={() => window.qmaker.showInFolder(toast.path!)}>{t('showInFolder')}</button>}
        </div>
      )}
    </div>
  );
}
