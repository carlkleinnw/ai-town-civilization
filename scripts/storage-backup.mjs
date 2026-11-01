import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, existsSync, readFileSync, writeFileSync, statfsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { acquireStorageLock } from './storageLock.mjs';
import { applyBackupRetention } from './backupRetention.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backups = path.resolve(root, '../backups');
const repository = path.join(backups, 'restic');
const passwordFile = path.join(backups, '.restic-password');
const executable =
  process.env.AI_TOWN_RESTIC ??
  path.resolve(root, '../tools/restic/restic_0.19.1_windows_amd64.exe');
const runtime = path.join(root, '.runtime/storage');
mkdirSync(runtime, { recursive: true });
const temp = path.join(runtime, 'temp');
mkdirSync(temp, { recursive: true });

function run(program, args) {
  const result = spawnSync(program, args, {
    cwd: root,
    windowsHide: true,
    encoding: 'utf8',
    env: {
      ...process.env,
      RESTIC_CACHE_DIR: path.join(runtime, 'restic-cache'),
      TMP: temp,
      TEMP: temp,
    },
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error || result.status !== 0)
    throw new Error(result.error?.message ?? result.stderr ?? 'Backup command failed');
  return result.stdout;
}
const restic = (args) =>
  run(executable, ['-r', repository, '--password-file', passwordFile, ...args]);
function backendRunning() {
  if (process.platform !== 'win32') throw new Error('This backup launcher requires Windows');
  const prefix = (path.join(root, '.runtime/local-app-data/convex/binaries') + path.sep).replaceAll(
    "'",
    "''",
  );
  return (
    Number(
      run('powershell.exe', [
        '-NoProfile',
        '-Command',
        `@(Get-CimInstance Win32_Process -Filter "Name = 'convex-local-backend.exe'" | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith('${prefix}', [StringComparison]::OrdinalIgnoreCase) }).Count`,
      ]).trim(),
    ) > 0
  );
}
const listening = (port) =>
  new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    socket.setTimeout(1500);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });

let restart = false;
let releaseLock;
try {
  if (!existsSync(executable)) throw new Error('restic is missing; see docs/DATABASE-STORAGE.md');
  const disk = statfsSync(backups);
  if (disk.bavail * disk.bsize < 5 * 1024 ** 3)
    throw new Error('Less than 5 GiB backup space remains');
  releaseLock = acquireStorageLock(path.join(root, '.runtime/storage-operation.lock'), 'backup');
  const wasRunning = await listening(3210);
  if (!wasRunning && backendRunning())
    throw new Error('The backend is still starting; wait until it is ready before backing up');
  if (wasRunning) {
    const pidFile = path.join(root, '.runtime/windows-process.json');
    if (!existsSync(pidFile) || !JSON.parse(readFileSync(pidFile, 'utf8')).pid)
      throw new Error(
        'Backend is running outside the recorded launcher; stop it before backing up',
      );
    run(process.execPath, ['scripts/windows.mjs', '--stop']);
    restart = true;
  }
  if (
    backendRunning() ||
    (await listening(3210)) ||
    (await listening(3211)) ||
    (await listening(5173))
  )
    throw new Error('Project services must be stopped for a consistent complete backup');
  if (!existsSync(passwordFile)) {
    if (existsSync(path.join(repository, 'config')))
      throw new Error('Existing backup password file is missing; refusing to replace it');
    writeFileSync(passwordFile, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 });
    if (process.platform === 'win32')
      run('icacls.exe', [
        passwordFile,
        '/inheritance:r',
        '/grant:r',
        `${process.env.USERDOMAIN}\\${process.env.USERNAME}:(F)`,
      ]);
  }
  if (!existsSync(path.join(repository, 'config'))) restic(['init']);
  const output = restic([
    'backup',
    root,
    '--json',
    '--tag',
    'ai-town-complete',
    ...(process.argv.includes('--critical') ? ['--tag', 'critical-runtime-governance'] : []),
    '--exclude',
    path.join(root, 'node_modules'),
    '--exclude',
    path.join(root, '.git'),
    '--exclude',
    path.join(root, '.runtime'),
    '--exclude',
    path.join(root, 'dist'),
  ]);
  const summary = output
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
    .findLast((line) => line.message_type === 'summary');
  if (!summary?.snapshot_id) throw new Error('Backup completed without a snapshot identifier');
  restic(['check']);
  const report = {
    createdAt: new Date().toISOString(),
    repository,
    snapshot: summary.snapshot_id,
    totalBytes: summary.total_bytes_processed,
    addedBytes: summary.data_added_packed,
    checked: true,
  };
  writeFileSync(path.join(runtime, 'backup.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  console.log(JSON.stringify({ backupRetention: applyBackupRetention(root, restic) }));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  releaseLock?.();
  if (restart) {
    const child = spawn(process.execPath, [path.join(root, 'scripts/background-launch.mjs')], {
      cwd: root,
      detached: true,
      windowsHide: true,
      stdio: 'ignore',
    });
    child.unref();
    console.log('Project restart requested.');
  }
}
