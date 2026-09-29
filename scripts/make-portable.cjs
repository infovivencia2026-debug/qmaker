// Builds release/QMaker-Portable (a self-contained folder) and a .zip of it, from release/win-unpacked.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const version = require(path.join(root, 'package.json')).version;
const src = path.join(root, 'release', 'win-unpacked');
const name = 'QMaker-Portable';
const out = path.join(root, 'release', name);
const zip = path.join(root, 'release', `${name}-${version}.zip`);

if (!fs.existsSync(path.join(src, 'QMaker.exe'))) throw new Error('release/win-unpacked/QMaker.exe missing — run electron-builder --win --dir first');
fs.rmSync(out, { recursive: true, force: true });
fs.rmSync(zip, { force: true });
fs.cpSync(src, out, { recursive: true });

fs.writeFileSync(path.join(out, 'portable.txt'),
  'This file makes QMaker keep all its data in the "data" folder next to QMaker.exe.\r\nDo not delete it, or QMaker will start empty.\r\n');

fs.writeFileSync(path.join(out, 'Create Desktop Shortcut.cmd'), [
  '@echo off',
  'rem Puts a QMaker icon on the desktop that opens this folder\'s QMaker.exe.',
  'powershell -NoProfile -ExecutionPolicy Bypass -Command "$s = (New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath(\'Desktop\') + \'\\QMaker.lnk\'); $s.TargetPath = \'%~dp0QMaker.exe\'; $s.WorkingDirectory = \'%~dp0\'; $s.IconLocation = \'%~dp0QMaker.exe,0\'; $s.Save()"',
  'echo QMaker shortcut created on the desktop.',
  'pause',
  '',
].join('\r\n'));

fs.writeFileSync(path.join(out, 'README.txt'), [
  `QMaker ${version} - portable (no installation needed)`,
  '',
  'START:     Double-click QMaker.exe',
  'DESKTOP:   Double-click "Create Desktop Shortcut.cmd" once to get a desktop icon.',
  'YOUR DATA: Everything you make is saved in the "data" folder inside this folder.',
  '           To move QMaker to another PC or a pen drive, copy this whole folder.',
  'BACKUP:    Copy the "data" folder, or use Share / Backup > Save backup file inside QMaker.',
  '',
  'Works fully offline on Windows 10 and 11 (64-bit).',
  'If Windows shows "Windows protected your PC", click "More info" then "Run anyway".',
  'Keep this folder somewhere you can write to (Desktop, Documents, D:\\ or a pen drive),',
  'not inside C:\\Program Files.',
  '',
].join('\r\n'));

if (process.platform === 'darwin') execFileSync('ditto', ['-c', '-k', '--keepParent', out, zip]);
else if (process.platform === 'win32') execFileSync('tar', ['-a', '-c', '-f', zip, '-C', path.dirname(out), name]);
else execFileSync('zip', ['-r', '-q', zip, name], { cwd: path.dirname(out) });

console.log(`Folder: ${out}\nZip:    ${zip} (${Math.round(fs.statSync(zip).size / 1e6)} MB)`);
