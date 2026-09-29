import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { DB, ImageAsset } from './shared/types';
import { DEFAULT_STYLE } from './lib/fonts';
import { collectImageIds, imageFromBlob } from './lib/rich';
import { BUILTIN_TEMPLATES } from './shared/templates';
import { translate } from './i18n';

export function normalize(raw: unknown): DB {
  const db = (raw ?? {}) as Partial<DB>;
  const questions = db.questions ?? [];
  const papers = db.papers ?? [];
  // Drop images nothing refers to any more (deleted questions, removed from text).
  const used = collectImageIds([questions, papers]);
  const images = Object.fromEntries(Object.entries(db.images ?? {}).filter(([id]) => used.has(id)));
  return {
    version: 1,
    settings: { institutionName: '', address: '', logo: '', uiLang: 'en', ...db.settings, paperStyle: { ...DEFAULT_STYLE, ...db.settings?.paperStyle } },
    // Built-ins always come from the app itself so updates reach existing installs.
    templates: [...BUILTIN_TEMPLATES, ...(db.templates ?? []).filter((t) => !t.builtin)],
    questions,
    papers,
    images,
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
  /** Compresses and stores an image; returns it so the caller can insert a token. */
  addImage: (blob: Blob) => Promise<ImageAsset | null>;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<DB | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const latest = useRef<DB | null>(null);
  const dirty = useRef(false);

  useEffect(() => {
    window.qmaker.loadDb().then((raw) => setDb(normalize(raw)), (e) => setError(String(e)));
  }, []);

  useEffect(() => {
    latest.current = db;
    if (!db || !dirty.current) return;
    const timer = setTimeout(() => {
      dirty.current = false;
      window.qmaker.saveDb(serialize(db)).catch((e) => setError(`Could not save: ${e}`));
    }, 300);
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

  const addImage = useCallback(async (blob: Blob) => {
    try {
      const img = await imageFromBlob(blob);
      update((db) => ({ ...db, images: { ...db.images, [img.id]: img } }));
      return img;
    } catch (e) {
      notify(`Could not add image: ${(e as Error).message}`);
      return null;
    }
  }, [update, notify]);

  const t = useMemo(() => translate(db?.settings.uiLang ?? 'en'), [db?.settings.uiLang]);

  if (error) return <div className="fatal">QMaker could not open its data: {error}</div>;
  if (!db) return null;
  return <Ctx.Provider value={{ db, update, t, toast, notify, addImage, undo, redo, canUndo: past.current.length > 0, canRedo: future.current.length > 0, replaceDb }}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}
