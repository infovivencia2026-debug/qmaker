import { contextBridge, ipcRenderer } from 'electron';

type SharedFile = { name: string; text: string };

contextBridge.exposeInMainWorld('qmaker', {
  loadDb: () => ipcRenderer.invoke('db:load'),
  saveDb: (json: string) => ipcRenderer.invoke('db:save', json),
  saveDbSync: (json: string) => ipcRenderer.sendSync('db:saveSync', json),
  saveFile: (bytes: Uint8Array, defaultName: string, filterName: string, ext: string) =>
    ipcRenderer.invoke('file:save', bytes, defaultName, filterName, ext),
  openFile: (kind?: 'share' | 'backup') => ipcRenderer.invoke('file:open', kind),
  listBackups: () => ipcRenderer.invoke('backup:list'),
  readBackup: (name: string) => ipcRenderer.invoke('backup:read', name),
  snapshotBackup: (json: string) => ipcRenderer.invoke('backup:snapshot', json),
  openBackupFolder: () => ipcRenderer.invoke('backup:openFolder'),
  launchFile: () => ipcRenderer.invoke('file:launchFile'),
  onFileOpened: (cb: (f: SharedFile) => void) => {
    const listener = (_e: unknown, f: SharedFile) => cb(f);
    ipcRenderer.on('file:opened', listener);
    return () => ipcRenderer.off('file:opened', listener);
  },
  exportPdf: (html: string, defaultName: string) => ipcRenderer.invoke('pdf:export', html, defaultName),
  showInFolder: (p: string) => ipcRenderer.invoke('shell:showInFolder', p),
});
