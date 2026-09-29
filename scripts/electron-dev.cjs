// Launches Electron against the Vite dev server. VS Code terminals set ELECTRON_RUN_AS_NODE,
// which makes Electron behave like plain Node, so it is removed here.
const { spawn } = require('node:child_process');
const electron = require('electron');

const env = { ...process.env, VITE_DEV_URL: 'http://localhost:5173' };
delete env.ELECTRON_RUN_AS_NODE;
spawn(electron, ['.'], { stdio: 'inherit', env }).on('exit', (code) => process.exit(code ?? 0));
