// Builds release/QMaker-Share: a folder to copy to other PCs. They double-click "Install QMaker.exe".
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const version = require(path.join(root, 'package.json')).version;
const installer = path.join(root, 'release', 'Install QMaker.exe');
const out = path.join(root, 'release', 'QMaker-Share');

if (!fs.existsSync(installer)) throw new Error('release/Install QMaker.exe missing — run electron-builder --win first');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(installer, path.join(out, 'Install QMaker.exe'));
fs.writeFileSync(path.join(out, 'READ ME FIRST.txt'), [
  `QMaker ${version} - question paper maker`,
  '',
  'TO INSTALL',
  '  1. Double-click "Install QMaker.exe".',
  '  2. If Windows says "Windows protected your PC", click "More info" then "Run anyway".',
  '  3. It installs by itself in a few seconds, puts a QMaker icon on the desktop and opens.',
  '',
  'No internet and no administrator password needed. Works on Windows 10 and 11 (64-bit).',
  '',
  'TO UPDATE: run a newer "Install QMaker.exe" the same way. Your questions and papers are kept.',
  'TO REMOVE: Windows Settings > Apps > QMaker > Uninstall. Your data is kept unless you delete it.',
  '',
].join('\r\n'));
console.log(`Share folder: ${out}`);
