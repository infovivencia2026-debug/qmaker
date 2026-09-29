import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { DB, ImageAsset } from './shared/types';
import { DEFAULT_STYLE } from './lib/fonts';
import { collectImageIds, imageFromBlob } from './lib/rich';
import { storeImages } from './lib/images';
import { questionToBox } from './lib/boxMigrate';
import { BUILTIN_TEMPLATES } from './shared/templates';
import { translate } from './i18n';

export function normalize(raw: unknown): DB {
  const db = (raw ?? {}) as Partial<DB>;
  const questions = db.questions ?? [];
  const papers = db.papers ?? [];
  // Drop images nothing refers to any more (deleted questions, removed from text).
  const templates = [...BUILTIN_TEMPLATES, ...(db.templates ?? []).filter((t) => !t.builtin)];
  // First run after the Box update: the old question bank becomes the library.
  const library = db.library ?? questions.flatMap((q) => questionToBox(q, { templates, questions, papers, images: {}, library: [] } as unknown as DB) ?? []);
  const used = collectImageIds([questions, papers, library]);
  // Unused pictures are dropped unless they were named (then they belong to the image store).
  const images = Object.fromEntries(Object.entries(db.images ?? {}).filter(([id, a]) => used.has(id) || a.name));
  return {
    version: 1,
    settings: { institutionName: '', address: '', logo: '', uiLang: 'en', ...db.settings, paperStyle: { ...DEFAULT_STYLE, ...db.settings?.paperStyle } },
    // Built-ins always come from the app itself so updates reach existing installs.
    templates,
    questions,
    papers,
    images,
    library,
  };
}

export const serialize = (db: DB) => JSON.stringify({ ...db, templates: db.templates.filter((t) => !t.builtin) });

interface Toast { message: string; path?: string }

interface Store {
  db: DB;
  update: (fn: (db: DB) => DB) => void;
  t: ReturnType<typeof translate>;
  toast: Toast | null;
  notify: (message: string, path?: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Replaces everything (restore from backup). Undoable. */
  replaceDb: (raw: unknown) => void;
  /** Compresses and stores an image (named after its file); returns it so the caller can insert it. */
  addImage: (blob: Blob) => Promise<ImageAsset | null>;
  /** Images just added and waiting for the user to confirm their names. */
  toName: string[];
  doneNaming: () => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<DB | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const latest = useRef<DB | null>(null);
  const dirty = useRef(false);

  useEffect(() => {
    window.qmaker
      .loadDb()
      .then(async (raw) => {
        const db = normalize(raw);
        // Data from older versions kept pictures inside the database; move them to files once.
        if (Object.values(db.images).some((a) => !a.file)) {
          db.images = await storeImages(db.images);
          dirty.current = true;
        }
        setDb(db);
      })
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    latest.current = db;
    if (!db || !dirty.current) return;
    const timer = setTimeout(() => {
      dirty.current = false;
      window.qmaker.saveDb(serialize(db)).catch((e) => setError(`Could not save: ${e}`));
    }, 600);
    return () => clearTimeout(timer);
  }, [db]);

  useEffect(() => {
    const flush = () => {
      if (dirty.current && latest.current) window.qmaker.saveDbSync(serialize(latest.current));
    };
    window.addEventListener('beforeunload', flush);
    return () => window.removeEventListener('beforeunload', flush);
  }, []);

  // Undo history. Rapid edits (typing) within a second collapse into one undo step.
  const past = useRef<DB[]>([]);
  const future = useRef<DB[]>([]);
  const lastPush = useRef(0);
  const [, setHistoryTick] = useState(0);

  const update = useCallback((fn: (db: DB) => DB) => {
    setDb((prev) => {
      if (!prev) return prev;
      const next = fn(prev);
      if (next === prev) return prev;
      const now = Date.now();
      if (now - lastPush.current > 1000) {
        past.current.push(prev);
        if (past.current.length > 200) past.current.shift();
      }
      lastPush.current = now;
      future.current = [];
      dirty.current = true;
      return next;
    });
    setHistoryTick((n) => n + 1);
  }, []);

  const travel = useCallback((from: React.MutableRefObject<DB[]>, to: React.MutableRefObject<DB[]>) => {
    const target = from.current.pop();
    if (!target || !latest.current) return;
    to.current.push(latest.current);
    lastPush.current = 0;
    dirty.current = true;
    setDb(target);
    setHistoryTick((n) => n + 1);
  }, []);
  const undo = useCallback(() => travel(past, future), [travel]);
  const redo = useCallback(() => travel(future, past), [travel]);
  const replaceDb = useCallback((raw: unknown) => {
    lastPush.current = 0;
    update(() => normalize(raw));
  }, [update]);

  const notify = useCallback((message: string, path?: string) => setToast({ message, path }), []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.path ? 12000 : 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const [toName, setToName] = useState<string[]>([]);
  const addImage = useCallback(async (blob: Blob) => {
    try {
      const fileName = blob instanceof File && blob.name ? blob.name.replace(/\.[^.]+$/, '') : '';
      const stamp = new Date().toLocaleString();
      const img = { ...(await imageFromBlob(blob)), name: fileName || `Pasted image ${stamp}`, addedAt: Date.now() };
      update((db) => ({ ...db, images: { ...db.images, [img.id]: img } }));
      setToName((l) => [...l, img.id]);
      return img;
    } catch (e) {
      notify(`Could not add image: ${(e as Error).message}`);
      return null;
    }
  }, [update, notify]);

  const t = useMemo(() => translate(db?.settings.uiLang ?? 'en'), [db?.settings.uiLang]);

  if (error) return <div className="fatal">QMaker could not open its data: {error}</div>;
  if (!db) return null;
  return <Ctx.Provider value={{ db, update, t, toast, notify, addImage, toName, doneNaming: () => setToName([]), undo, redo, canUndo: past.current.length > 0, canRedo: future.current.length > 0, replaceDb }}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}
