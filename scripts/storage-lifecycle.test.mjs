import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  symlinkSync,
  existsSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendBounded, cleanExpiredTemp } from './storageLifecycle.mjs';
import { snapshotRetentionPlan, defaultPolicy } from './storagePolicy.mjs';
import { applyBackupRetention } from './backupRetention.mjs';
import { trendTail } from './runtime-service.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function fixture(t) {
  const base = path.join(root, '.runtime/lifecycle/tests');
  mkdirSync(base, { recursive: true });
  const dir = mkdtempSync(path.join(base, 'case-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
test('rotation bounds disk use and retains the newest complete trend records', (t) => {
  const dir = fixture(t),
    file = path.join(dir, 'trend.jsonl');
  for (let i = 0; i < 100; i++)
    appendBounded(file, JSON.stringify({ i }) + '\n', { maxBytes: 32, keep: 2 });
  assert.ok(readdirSync(dir).length <= 3);
  assert.ok(readdirSync(dir).every((n) => statSync(path.join(dir, n)).size <= 32));
  assert.equal(JSON.parse(readFileSync(file, 'utf8').trim().split('\n').at(-1)).i, 99);
  assert.throws(() => appendBounded(file, 'x'.repeat(33), { maxBytes: 32, keep: 2 }));
});
test('trend reads cross rotation boundaries in order and ignores an interrupted final record', async (t) => {
  const dir = fixture(t),
    file = path.join(dir, 'trend.jsonl');
  writeFileSync(file + '.1', '{"i":1}\n{"i":2}\n');
  writeFileSync(file, '{"i":3}\n{"i":');
  assert.deepEqual(await trendTail(file), [{ i: 1 }, { i: 2 }, { i: 3 }]);
});
test('expiry preserves recently used subtrees and never touches game data or evidence', (t) => {
  const dir = fixture(t),
    temp = path.join(dir, '.runtime/temp');
  mkdirSync(path.join(temp, 'used'), { recursive: true });
  writeFileSync(path.join(temp, 'old'), 'temporary');
  writeFileSync(path.join(temp, 'used/new'), 'active');
  mkdirSync(path.join(dir, '.convex'), { recursive: true });
  writeFileSync(path.join(dir, '.convex/old'), 'game');
  const old = new Date(Date.now() - 10 * 86400000);
  utimesSync(path.join(temp, 'old'), old, old);
  utimesSync(path.join(temp, 'used'), old, old);
  assert.deepEqual(
    cleanExpiredTemp(dir).map((p) => path.basename(p)),
    ['old'],
  );
  assert.ok(existsSync(path.join(temp, 'used/new')));
  assert.ok(existsSync(path.join(dir, '.convex/old')));
});
test('cache expiry refuses directory links and preserves the target', (t) => {
  const dir = fixture(t),
    temp = path.join(dir, '.runtime/temp'),
    target = path.join(dir, 'data');
  mkdirSync(temp, { recursive: true });
  mkdirSync(target);
  writeFileSync(path.join(target, 'keep'), 'game');
  const link = path.join(temp, 'link');
  symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => cleanExpiredTemp(dir));
  // Remove only the test link before recursive fixture cleanup.
  rmSync(link);
  assert.equal(readFileSync(path.join(target, 'keep'), 'utf8'), 'game');
});
const snapshot = (i, options = {}) => ({
  id: String(i).padStart(64, 'a'),
  time: new Date(Date.now() - i * 86400000).toISOString(),
  paths: [root],
  tags: ['ai-town-complete'],
  hostname: 'local',
  ...options,
});
test('retention isolates hosts and protects critical, verified and unrelated snapshots', () => {
  const data = [
    snapshot(1),
    snapshot(2),
    snapshot(10),
    snapshot(11, { tags: ['ai-town-complete', 'critical'] }),
    snapshot(12),
    snapshot(13, { paths: [path.join(root, '../tmp')] }),
    snapshot(14, { hostname: 'other' }),
    snapshot(15, { time: 'invalid' }),
  ];
  const plan = snapshotRetentionPlan(data, root, { ...defaultPolicy, keepLast: 2, keepDays: 7 }, [
    { id: data[4].id },
  ]);
  assert.deepEqual(
    plan.filter((s) => s.candidate).map((s) => s.id),
    [data[2].id],
  );
  assert.equal(
    snapshotRetentionPlan([snapshot(99, { time: 'invalid' }), snapshot(30)], root, {
      ...defaultPolicy,
      keepLast: 1,
      keepDays: 1,
    }).some((s) => s.candidate),
    false,
  );
});
test('backup pruning requires a verified restore and retries interrupted pruning', (t) => {
  const dir = fixture(t);
  mkdirSync(path.join(dir, '.runtime/storage'), { recursive: true });
  writeFileSync(
    path.join(dir, 'storage-policy.json'),
    JSON.stringify({ ...defaultPolicy, keepLast: 1, keepDays: 1 }),
  );
  const snapshots = [snapshot(1, { paths: [dir] }), snapshot(10, { paths: [dir] })];
  const calls = [];
  let failPrune = true;
  const restic = (args) => {
    calls.push(args);
    if (args[0] === 'snapshots') return JSON.stringify(snapshots);
    if (args[0] === 'forget') snapshots.splice(1, 1);
    if (args[0] === 'prune' && failPrune) throw new Error('interrupted');
    return '';
  };
  assert.ok(applyBackupRetention(dir, restic).skipped);
  assert.ok(calls.every((c) => c[0] === 'snapshots'));
  writeFileSync(
    path.join(dir, 'storage-verified-restores.json'),
    JSON.stringify({
      snapshots: [
        {
          id: snapshots[0].id,
          quickCheck: 'ok',
          fileHashesVerified: true,
          allStatesExact: true,
        },
      ],
    }),
  );
  assert.throws(() => applyBackupRetention(dir, restic), /interrupted/);
  assert.equal(
    JSON.parse(readFileSync(path.join(dir, '.runtime/storage/retention.json'))).prunePending,
    true,
  );
  failPrune = false;
  assert.equal(applyBackupRetention(dir, restic).prunePending, false);
  assert.equal(calls.filter((c) => c[0] === 'forget').length, 1);
  assert.equal(calls.at(-1)[0], 'check');
});
