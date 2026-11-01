// Official export/import only. Both databases are stopped and compared before any switch.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import { acquireStorageLock } from './storageLock.mjs';
const root = process.cwd();
if (root.toLowerCase() !== 'e:\\ai_town\\ai-town')
  throw Error('Run from the verified project root');
if (!process.argv.includes('--apply'))
  throw Error(
    'Usage: node scripts/storage-rebuild.mjs --apply (creates backups, verifies isolation, then stops and restores services)',
  );
const disk = fs.statfsSync(root);
if (disk.bavail * disk.bsize < 10 * 1024 ** 3) throw Error('Need at least 10 GiB free on E');
const stamp = new Date().toISOString().replace(/[:.]/g, '-'),
  directory = path.resolve(root, '../tmp/governance-rebuild-' + stamp),
  backup = path.resolve(root, '../backups/before-governance-switch-' + stamp);
assert(directory.startsWith('E:\\AI_town\\tmp\\'));
assert(backup.startsWith('E:\\AI_town\\backups\\'));
fs.mkdirSync(directory, { recursive: true });
fs.mkdirSync(backup, { recursive: true });
const report = {
  createdAt: new Date().toISOString(),
  backup,
  directory,
  backend: '72ce13c',
  retention: { documentSeconds: 21600, indexSeconds: 240, batchIntervalSeconds: 2 },
};
const runtime = path.join(root, '.runtime/governance'),
  reportFile = path.join(runtime, 'rebuild.json');
const save = () => fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
const config = JSON.parse(fs.readFileSync('.convex/local/default/config.json'));
const client = (port) => {
  const c = new ConvexHttpClient('http://127.0.0.1:' + port);
  c.setAdminAuth(config.adminKey);
  return c;
};
const live = client(3210),
  isolated = client(3250),
  q = (c, n, a = {}) => c.query(makeFunctionReference('civilization:' + n), a);
const env = {
  ...process.env,
  TMP: path.join(root, '.runtime/temp'),
  TEMP: path.join(root, '.runtime/temp'),
};
delete env.NODE_TLS_REJECT_UNAUTHORIZED;
const run = (exe, args, cwd = root) => {
  const r = spawnSync(exe, args, {
    cwd,
    env,
    windowsHide: true,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 ** 2,
  });
  fs.appendFileSync(path.join(directory, 'operations.log'), r.stdout + r.stderr);
  if (r.status !== 0)
    throw Error('Maintenance command failed; see ' + path.join(directory, 'operations.log'));
  return r.stdout;
};
const cli = (args, cwd = root) =>
  run(process.execPath, [path.join(root, 'node_modules/convex/bin/main.js'), ...args], cwd);
let release,
  child,
  liveStopped = false,
  switched = false;
try {
  release = acquireStorageLock(
    path.join(root, '.runtime/storage-operation.lock'),
    'verified official restore',
  );
  const worlds = await q(live, 'list');
  if (worlds.some((w) => w.running)) throw Error('Pause all worlds before maintenance');
  if (worlds.length !== 1 || worlds[0].id !== 'mh7fm2xg8twftrfgzsvkk9bfvh8h1wn4')
    throw Error('Protected-world inventory mismatch');
  const original = (await q(live, 'get', { worldId: worlds[0].id })).state;
  const snapshot = path.join(backup, 'complete-snapshot.zip');
  cli(['export', '--include-file-storage', '--path', snapshot]);
  const modelEnv = dotenv.parse(cli(['env', 'list']));
  // Companion source includes uncommitted files. Dependencies/cache stay out of backup.
  fs.cpSync(root, path.join(backup, 'project'), {
    recursive: true,
    filter: (source) =>
      !['node_modules', '.git', '.runtime', '.convex', 'dist'].includes(
        path.relative(root, source).split(path.sep)[0],
      ),
  });
  run('git', ['bundle', 'create', path.join(backup, 'history.bundle'), '--all']);
  fs.writeFileSync(path.join(backup, 'uncommitted.patch'), run('git', ['diff', '--binary']));
  for (const name of ['convex', 'data', 'package.json', 'tsconfig.json', 'convex.json'])
    if (fs.existsSync(name)) fs.cpSync(name, path.join(directory, name), { recursive: true });
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(directory, 'node_modules'), 'junction');
  fs.writeFileSync(
    path.join(directory, '.env.local'),
    `CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3250\nCONVEX_SELF_HOSTED_ADMIN_KEY=${config.adminKey}\n`,
  );
  const deployment = path.join(directory, '.convex/local/default');
  fs.mkdirSync(deployment, { recursive: true });
  fs.copyFileSync('.convex/local/default/config.json', path.join(deployment, 'config.json'));
  const file = path.join(deployment, 'convex_local_backend.sqlite3'),
    log = fs.openSync(path.join(directory, 'backend.log'), 'a');
  child = spawn(
    path.resolve(
      '.runtime/local-app-data/convex/binaries/precompiled-2026-10-10-72ce13c/convex-local-backend.exe',
    ),
    [
      '--interface',
      '127.0.0.1',
      '--port',
      '3250',
      '--site-proxy-port',
      '3251',
      '--convex-origin',
      'http://127.0.0.1:3250',
      '--convex-site',
      'http://127.0.0.1:3251',
      '--instance-name',
      config.deploymentName,
      '--instance-secret',
      config.instanceSecret,
      '--local-storage',
      path.join(deployment, 'convex_local_storage'),
      '--disable-beacon',
      file,
    ],
    {
      cwd: directory,
      windowsHide: true,
      stdio: ['ignore', log, log],
      env: {
        ...env,
        DOCUMENT_RETENTION_DELAY: '21600',
        INDEX_RETENTION_DELAY: '240',
        DOCUMENT_RETENTION_BATCH_INTERVAL_SECONDS: '2',
      },
    },
  );
  fs.writeFileSync(
    path.join(directory, 'process.json'),
    JSON.stringify({ pid: child.pid, directory }),
  );
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch('http://127.0.0.1:3250/version')).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
    if (i === 119) throw Error('Isolated startup timed out');
  }
  cli(['import', '--replace-all', '--yes', snapshot], directory);
  cli(['dev', '--once', '--typecheck', 'disable'], directory);
  for (const [key, value] of Object.entries(modelEnv)) cli(['env', 'set', key, value], directory);
  assert.deepEqual((await q(isolated, 'get', { worldId: worlds[0].id })).state, original);
  let apiChecks = 1;
  for (const name of ['saves', 'ancestors']) {
    assert.deepEqual(
      await q(isolated, name, { worldId: worlds[0].id }),
      await q(live, name, { worldId: worlds[0].id }),
    );
    apiChecks++;
  }
  for (const kind of ['event', 'audit', 'plan', 'decision', 'sample']) {
    assert.deepEqual(
      await q(isolated, 'history', { worldId: worlds[0].id, kind }),
      await q(live, 'history', { worldId: worlds[0].id, kind }),
    );
    apiChecks++;
  }
  report.apiChecks = apiChecks;
  report.protectedStateExact = true;
  save();
  child.kill();
  await new Promise((r) => child.once('exit', r));
  child = undefined;
  run('python', [
    'scripts/storage-compare-export.py',
    snapshot,
    file,
    path.join(directory, 'isolated-typed-comparison.json'),
  ]);
  run('python', ['scripts/storage-audit.py', file, path.join(runtime, 'database-audit.json')]);
  // Stop by verified launcher ownership; never replace a database that is open.
  run(process.execPath, ['scripts/windows.mjs', '--stop']);
  liveStopped = true;
  run('python', [
    'scripts/storage-compare-export.py',
    snapshot,
    path.join(root, '.convex/local/default/convex_local_backend.sqlite3'),
    path.join(directory, 'source-typed-comparison.json'),
  ]);
  report.beforeBytes = fs.statSync('.convex/local/default/convex_local_backend.sqlite3').size;
  report.afterBytes = fs.statSync(file).size;
  const originalDir = path.join(backup, 'original.convex');
  fs.renameSync(path.join(root, '.convex'), originalDir);
  try {
    fs.renameSync(path.join(directory, '.convex'), path.join(root, '.convex'));
    switched = true;
  } catch (error) {
    fs.renameSync(originalDir, path.join(root, '.convex'));
    throw error;
  }
  const settings = path.join(root, '.env.windows.local'),
    previous = fs.existsSync(settings) ? dotenv.parse(fs.readFileSync(settings)) : {};
  fs.writeFileSync(
    settings,
    Object.entries({
      ...previous,
      DOCUMENT_RETENTION_DELAY: '21600',
      INDEX_RETENTION_DELAY: '240',
      DOCUMENT_RETENTION_BATCH_INTERVAL_SECONDS: '2',
    })
      .map(([key, value]) => `${key}=${value}`)
      .join('\n') + '\n',
  );
  report.typedComparison = JSON.parse(
    fs.readFileSync(path.join(directory, 'isolated-typed-comparison.json')),
  );
  report.switched = true;
  report.rollback = originalDir;
  fs.writeFileSync(
    path.join(backup, 'RESTORE.md'),
    'Stop the project. Preserve the current .convex separately. Restore original.convex as project .convex together with project/ source, then restore the saved environment configuration. Never mix database generations or replace live files. This backup is protected; do not prune.\n',
  );
  save();
  console.log(
    JSON.stringify({
      beforeBytes: report.beforeBytes,
      afterBytes: report.afterBytes,
      typedComparison: report.typedComparison,
      rollback: originalDir,
    }),
  );
} catch (error) {
  report.error = error.message;
  report.switched = switched;
  save();
  process.exitCode = 1;
  console.error(error.message);
} finally {
  if (child) {
    child.kill();
    await new Promise((r) => child.once('exit', r));
  }
  release?.();
  if (liveStopped) {
    const fd = fs.openSync(path.join(runtime, 'rebuild-startup.log'), 'a');
    const c = spawn(process.execPath, [path.join(root, 'scripts/windows.mjs')], {
      cwd: root,
      env,
      detached: true,
      windowsHide: true,
      stdio: ['ignore', fd, fd],
    });
    c.unref();
    console.log('Service restart requested; original paused intention retained.');
  }
}
