import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendLog } from './storageLifecycle.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const child = spawn(process.execPath, [path.join(root, 'scripts/windows.mjs')], {
  cwd: root,
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});
child.stdout.on('data', (chunk) =>
  appendLog(path.join(root, '.runtime/storage/restart.log'), chunk),
);
child.stderr.on('data', (chunk) =>
  appendLog(path.join(root, '.runtime/storage/restart-error.log'), chunk),
);
child.on('error', (error) => {
  appendLog(path.join(root, '.runtime/storage/restart-error.log'), error.message + '\n');
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
