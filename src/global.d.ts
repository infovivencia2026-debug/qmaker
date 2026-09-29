type SharedFile = { name: string; text: string };

interface Window {
  qmaker: {
    loadDb(): Promise<unknown>;
    saveDb(json: string): Promise<void>;
    saveDbSync(json: string): void;
    saveFile(bytes: Uint8Array, defaultName: string, filterName: string, ext: string): Promise<string | null>;
    openFile(kind?: 'share' | 'backup'): Promise<SharedFile | null>;
    listBackups(): Promise<{ name: string; time: number; size: number }[]>;
    readBackup(name: string): Promise<string>;
    snapshotBackup(json: string): Promise<string>;
    openBackupFolder(): Promise<string>;
    launchFile(): Promise<SharedFile | null>;
    onFileOpened(cb: (f: SharedFile) => void): () => void;
    exportPdf(html: string, defaultName: string): Promise<string | null>;
    showInFolder(p: string): Promise<void>;
    saveImage(name: string, bytes: Uint8Array): Promise<void>;
  };
  __qmakerPrint?: (html: string) => Promise<boolean>;
}
