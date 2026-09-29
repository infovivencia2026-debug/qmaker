import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const DEV_URL = process.env.VITE_DEV_URL;

// Portable mode: a portable.txt next to QMaker.exe keeps all data in a "data" folder beside it,
// so the whole folder can be copied to another PC or a pen drive. Must run before anything uses userData.
function usePortableDataDir() {
  if (!app.isPackaged) return;
  const exeDir = path.dirname(process.execPath);
  if (!fs.existsSync(path.join(exeDir, 'portable.txt'))) return;
  const dataDir = path.join(exeDir, 'data');
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.accessSync(dataDir, fs.constants.W_OK);
    app.setPath('userData', dataDir);
  } catch {
    // Read-only location (e.g. a CD or protected folder): fall back to the normal per-user folder.
  }
}
usePortableDataDir();
const SHARE_EXTS = ['.qbank', '.qpaper'];

let mainWindow: BrowserWindow | null = null;
let pendingOpenFile: string | null = findShareFile(process.argv);

const dbPath = () => path.join(app.getPath('userData'), 'qmaker-db.json');
const backupDir = () => path.join(app.getPath('userData'), 'backups');
const KEEP_AUTO_BACKUPS = 14;

function findShareFile(argv: string[]) {
  return argv.find((a) => SHARE_EXTS.includes(path.extname(a).toLowerCase()) && fs.existsSync(a)) ?? null;
}

function loadRenderer(win: BrowserWindow, hash?: string) {
  if (DEV_URL) return win.loadURL(DEV_URL + (hash ? `#${hash}` : ''));
  return win.loadFile(path.join(__dirname, '../dist/index.html'), hash ? { hash } : undefined);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    title: 'QMaker',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.once('ready-to-show', () => {
    mainWindow?.maximize();
    mainWindow?.show();
  });
  mainWindow.on('closed', () => (mainWindow = null));
  loadRenderer(mainWindow);
}

async function readShareFile(filePath: string) {
  return { name: path.basename(filePath), text: await fsp.readFile(filePath, 'utf8') };
}

// ---------- database ----------

/** Once a day, keep a copy of the database; the newest 14 days are kept. */
function autoBackup() {
  const file = dbPath();
  if (!fs.existsSync(file)) return;
  const dir = backupDir();
  fs.mkdirSync(dir, { recursive: true });
  const today = path.join(dir, `auto-${new Date().toISOString().slice(0, 10)}.json`);
  if (fs.existsSync(today)) return;
  fs.copyFileSync(file, today);
  const autos = fs.readdirSync(dir).filter((f) => f.startsWith('auto-')).sort();
  for (const old of autos.slice(0, Math.max(0, autos.length - KEEP_AUTO_BACKUPS))) fs.rmSync(path.join(dir, old));
}

function writeDbSync(json: string) {
  try {
    autoBackup();
  } catch {
    // A failed backup must never block saving.
  }
  const file = dbPath();
  if (fs.existsSync(file)) fs.copyFileSync(file, file + '.bak');
  fs.writeFileSync(file + '.tmp', json, 'utf8');
  fs.renameSync(file + '.tmp', file);
}

ipcMain.handle('db:load', async () => {
  try {
    return JSON.parse(await fsp.readFile(dbPath(), 'utf8'));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    // Main file is corrupt: fall back to the previous good copy rather than starting empty.
    return JSON.parse(await fsp.readFile(dbPath() + '.bak', 'utf8'));
  }
});

// Writes are synchronous so two saves can never interleave, and so the final save on close completes.
ipcMain.handle('db:save', (_e, json: string) => writeDbSync(json));
ipcMain.on('db:saveSync', (e, json: string) => {
  writeDbSync(json);
  e.returnValue = true;
});

// ---------- files ----------

async function askSavePath(defaultName: string, filterName: string, ext: string) {
  const res = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: path.join(app.getPath('downloads'), defaultName),
    filters: [{ name: filterName, extensions: [ext] }],
  });
  return res.canceled || !res.filePath ? null : res.filePath;
}

ipcMain.handle('file:save', async (_e, bytes: Uint8Array, defaultName: string, filterName: string, ext: string) => {
  const target = await askSavePath(defaultName, filterName, ext);
  if (!target) return null;
  await fsp.writeFile(target, bytes);
  return target;
});

ipcMain.handle('file:open', async (_e, kind: 'share' | 'backup' = 'share') => {
  const res = await dialog.showOpenDialog(mainWindow!, {
    defaultPath: app.getPath(kind === 'backup' ? 'documents' : 'downloads'),
    properties: ['openFile'],
    filters: kind === 'backup' ? [{ name: 'QMaker backup', extensions: ['qbackup', 'json'] }] : [{ name: 'QMaker files', extensions: ['qbank', 'qpaper'] }],
  });
  return res.canceled || !res.filePaths[0] ? null : readShareFile(res.filePaths[0]);
});

ipcMain.handle('file:launchFile', async () => {
  const file = pendingOpenFile;
  pendingOpenFile = null;
  return file ? readShareFile(file) : null;
});

// ---------- backups ----------

ipcMain.handle('backup:list', async () => {
  const dir = backupDir();
  if (!fs.existsSync(dir)) return [];
  const names = (await fsp.readdir(dir)).filter((f) => f.endsWith('.json'));
  const list = await Promise.all(names.map(async (name) => {
    const st = await fsp.stat(path.join(dir, name));
    return { name, time: st.mtimeMs, size: st.size };
  }));
  return list.sort((a, b) => b.time - a.time);
});

ipcMain.handle('backup:read', async (_e, name: string) => {
  if (name !== path.basename(name)) throw new Error('Invalid backup name');
  return fsp.readFile(path.join(backupDir(), name), 'utf8');
});

// Safety copy of the current data taken right before a restore replaces it.
ipcMain.handle('backup:snapshot', async (_e, json: string) => {
  await fsp.mkdir(backupDir(), { recursive: true });
  const name = `before-restore-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  await fsp.writeFile(path.join(backupDir(), name), json, 'utf8');
  return name;
});

ipcMain.handle('backup:openFolder', async () => {
  await fsp.mkdir(backupDir(), { recursive: true });
  return shell.openPath(backupDir());
});

ipcMain.handle('shell:showInFolder', (_e, p: string) => shell.showItemInFolder(p));

// ---------- PDF ----------

ipcMain.handle('pdf:export', async (_e, html: string, defaultName: string) => {
  const target = await askSavePath(defaultName, 'PDF', 'pdf');
  if (!target) return null;
  // Render in a hidden copy of the app so the bundled Hindi/Telugu fonts are available.
  const win = new BrowserWindow({ show: false, webPreferences: { preload: path.join(__dirname, 'preload.js') } });
  try {
    await loadRenderer(win, 'print');
    await win.webContents.executeJavaScript(`window.__qmakerPrint(${JSON.stringify(html)})`);
    const pdf = await win.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      margins: { top: 0.5, bottom: 0.6, left: 0.6, right: 0.6 },
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate:
        '<div style="width:100%;text-align:center;font-size:9px;color:#555"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    });
    await fsp.writeFile(target, pdf);
    return target;
  } finally {
    win.destroy();
  }
});

// ---------- app lifecycle ----------

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // Double-clicking a .qbank from WhatsApp downloads while the app is open lands here.
  app.on('second-instance', async (_e, argv) => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    const file = findShareFile(argv);
    if (file) mainWindow.webContents.send('file:opened', await readShareFile(file));
  });
  app.whenReady().then(createWindow);
  app.on('window-all-closed', () => app.quit());
}
