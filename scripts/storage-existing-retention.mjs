import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
const root = process.cwd(),
  target = path.resolve(root, '../tmp/runtime-existing-retention');
if (fs.existsSync(target)) throw Error('Isolation directory exists');
fs.mkdirSync(target, { recursive: true });
fs.cpSync(
  path.resolve(root, '../tmp/runtime-governance-restore/E/AI_town/ai-town/.convex'),
  path.join(target, '.convex'),
  { recursive: true },
);
const directory = path.join(target, '.convex/local/default'),
  config = JSON.parse(fs.readFileSync(path.join(directory, 'config.json')));
const file = path.join(directory, 'convex_local_backend.sqlite3');
const log = fs.openSync(path.join(target, 'backend.log'), 'a'),
  start = Date.now();
const child = spawn(
  path.resolve(
    root,
    '.runtime/local-app-data/convex/binaries/precompiled-2026-10-10-72ce13c/convex-local-backend.exe',
  ),
  [
    '--interface',
    '127.0.0.1',
    '--port',
    '3240',
    '--site-proxy-port',
    '3241',
    '--convex-origin',
    'http://127.0.0.1:3240',
    '--convex-site',
    'http://127.0.0.1:3241',
    '--instance-name',
    config.deploymentName,
    '--instance-secret',
    config.instanceSecret,
    '--local-storage',
    path.join(directory, 'convex_local_storage'),
    '--disable-beacon',
    file,
  ],
  {
    cwd: target,
    windowsHide: true,
    stdio: ['ignore', log, log],
    env: {
      ...process.env,
      DOCUMENT_RETENTION_DELAY: '21600',
      INDEX_RETENTION_DELAY: '240',
      TMP: target,
      TEMP: target,
    },
  },
);
fs.writeFileSync(path.join(target, 'process.json'), JSON.stringify({ pid: child.pid, target }));
const report = { documentRetentionSeconds: 21600, indexRetentionSeconds: 240, samples: [] };
const save = () =>
  fs.writeFileSync(path.join(target, 'report.json'), JSON.stringify(report, null, 2));
function metrics() {
  const d = new DatabaseSync(file, { readOnly: true });
  d.exec('pragma busy_timeout=10000');
  try {
    return {
      at: Date.now(),
      versions: d.prepare('select count(*) n from documents').get().n,
      freePages: d.prepare('pragma freelist_count').get().freelist_count,
      bytes: fs.statSync(file).size,
    };
  } finally {
    d.close();
  }
}
async function q(name, args = {}) {
  const r = await fetch('http://127.0.0.1:3240/api/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Convex ' + config.adminKey },
    body: JSON.stringify({ path: 'civilization:' + name, args, format: 'json' }),
  });
  const j = await r.json();
  if (j.status !== 'success') throw Error('Isolated query failed');
  return j.value;
}
try {
  report.samples.push(metrics());
  save();
  for (let i = 0; i < 900; i++) {
    try {
      if ((await fetch('http://127.0.0.1:3240/version', { signal: AbortSignal.timeout(500) })).ok)
        break;
    } catch {}
    if (child.exitCode !== null) throw Error('Backend exited');
    await new Promise((r) => setTimeout(r, 1000));
    if (i === 899) throw Error('Isolated startup timeout');
  }
  report.startupMs = Date.now() - start;
  console.log('Isolated 6-hour backend ready in ' + report.startupMs + ' ms');
  const id = 'mh7fm2xg8twftrfgzsvkk9bfvh8h1wn4',
    original = JSON.parse(fs.readFileSync('.runtime/governance/before-protected.json'));
  assert.deepEqual((await q('get', { worldId: id })).state, original.state);
  for (let i = 0; i < 16; i++) {
    await new Promise((r) => setTimeout(r, 30000));
    report.samples.push(metrics());
    save();
    if (report.samples.at(-1).versions < report.samples[0].versions / 2) break;
  }
  assert.deepEqual((await q('get', { worldId: id })).state, original.state);
  report.protectedStateExact = true;
  report.versionsReclaimed = report.samples[0].versions - report.samples.at(-1).versions;
  const logs = fs.readFileSync(path.join(target, 'backend.log'), 'utf8');
  report.retentionErrors = logs
    .split('\n')
    .filter((l) => /out.of.retention|retention.*(error|failed)/i.test(l)).length;
  assert(report.versionsReclaimed > 10000);
  assert.equal(report.retentionErrors, 0);
} catch (e) {
  report.error = e.message;
  process.exitCode = 1;
} finally {
  child.kill();
  await new Promise((r) => child.once('exit', r));
  report.stopped = true;
  save();
  console.log(JSON.stringify(report));
}
