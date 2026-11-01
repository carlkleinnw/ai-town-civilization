import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
const client = new ConvexHttpClient('http://127.0.0.1:3210');
client.setAdminAuth(JSON.parse(readFileSync('.convex/local/default/config.json')).adminKey);
const q = (n, a = {}) => client.query(makeFunctionReference('civilization:' + n), a);
const m = (n, a = {}) => client.mutation(makeFunctionReference('civilization:' + n), a);
const keep = 'mh7fm2xg8twftrfgzsvkk9bfvh8h1wn4';
const out = '.runtime/governance';
mkdirSync(out, { recursive: true });
const label = process.argv[2] ?? 'before';
const original = await q('get', { worldId: keep });
assert.equal(original.state.name, '演示·小时行动·知识（规则55年）');
assert.equal(original.state.running, false);
writeFileSync(out + '/' + label + '-protected.json', JSON.stringify(original));
const worldId = await m('branch', { worldId: keep, name: '隔离验收·' + label });
const file = '.convex/local/default/convex_local_backend.sqlite3';
function disk() {
  return {
    bytes: statSync(file).size,
    walBytes: statSync(file + '-wal', { throwIfNoEntry: false })?.size ?? 0,
  };
}
const snapshot = async () => ({
  at: Date.now(),
  disk: disk(),
  stats: (await q('storageStats')).find((w) => w.worldId === worldId),
  state: (await q('get', { worldId })).state,
});
const samples = [];
for (const mode of ['paused', 'visible-paused', 'running']) {
  let timer;
  if (mode !== 'paused') {
    const proof = await m('observe', { worldId, sentAt: Date.now() });
    timer = setInterval(() => m('observe', { worldId, sentAt: Date.now() }).catch(() => {}), 10000);
    if (mode === 'running')
      await m('control', {
        worldId,
        running: true,
        expectedLoop: proof.loop,
        requestedAt: Date.now(),
      });
  }
  const start = await snapshot();
  await new Promise((r) => setTimeout(r, mode === 'running' ? 60000 : 30000));
  const end = await snapshot();
  if (timer) clearInterval(timer);
  if (mode === 'running') await m('control', { worldId, running: false });
  samples.push({ mode, start, end });
  writeFileSync(
    out + '/' + label + '-baseline.json',
    JSON.stringify({ worldId, samples, protectedUnchanged: true }, null, 2),
  );
  console.log(
    mode,
    JSON.stringify({
      milliseconds: end.at - start.at,
      writes: end.stats.writes - start.stats.writes,
      chars: end.stats.writtenChars - start.stats.writtenChars,
      bytes: end.disk.bytes - start.disk.bytes,
      wal: end.disk.walBytes - start.disk.walBytes,
    }),
  );
}
assert.deepEqual((await q('get', { worldId: keep })).state, original.state);
writeFileSync(
  out + '/' + label + '-baseline.json',
  JSON.stringify({ worldId, samples, protectedUnchanged: true }, null, 2),
);
