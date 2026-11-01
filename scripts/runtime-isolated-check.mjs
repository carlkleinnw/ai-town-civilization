import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
const root = process.cwd(),
  directory = path.resolve(root, '../tmp/runtime-feature-verification-' + Date.now());
if (fs.existsSync(directory)) throw Error('Isolation target exists');
fs.mkdirSync(directory, { recursive: true });
for (const name of ['convex', 'data', 'package.json', 'tsconfig.json', 'convex.json'])
  if (fs.existsSync(name)) fs.cpSync(name, path.join(directory, name), { recursive: true });
fs.symlinkSync(path.join(root, 'node_modules'), path.join(directory, 'node_modules'), 'junction');
const config = JSON.parse(fs.readFileSync('.convex/local/default/config.json'));
fs.writeFileSync(
  path.join(directory, '.env.local'),
  `CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3230\nCONVEX_SELF_HOSTED_ADMIN_KEY=${config.adminKey}\n`,
);
// Test fixtures and a copy of the pre-change tick exist ONLY in this isolated project.
fs.appendFileSync(
  path.join(directory, 'convex/civilization.ts'),
  `
export const legacyTick = internalMutation({args:{...idArg,loop:v.number()},handler:async(ctx,{worldId,loop})=>{
const row=await load(ctx,worldId),w=clone(state(row));if(!w.running||row.loop!==loop)return;
if(shouldPauseUnobserved(w.running,row.observedAt,Date.now())){await pauseUnobserved(ctx,worldId);return;}
heartbeat(w);await persist(ctx,row,w);await queueAI(ctx,worldId,w);
if(w.running)await ctx.scheduler.runAfter(1000,internal.civilization.legacyTick,{worldId,loop});}});
export const legacyStart=internalMutation({args:idArg,handler:async(ctx,{worldId})=>{const row=await ctx.db.get(worldId);if(!row)throw Error('missing');const loop=(row.loop??0)+1;await ctx.db.patch(worldId,{loop});await ctx.scheduler.runAfter(1000,internal.civilization.legacyTick,{worldId,loop});}});
export const seedHistory=internalMutation({args:{...idArg,future:v.optional(v.boolean())},handler:async(ctx,{worldId,future})=>{
const row=await load(ctx,worldId),w=clone(state(row));
if(future){await ctx.db.insert('civilizationRecords',{worldId,key:'e7000',serial:7000,kind:'event',day:w.day,data:{id:'e7000',day:w.day,kind:'test',actor:'human',text:pair('later','later')}});return;}
w.nextId=6000;await storeWorld(ctx,row,w);const values:Record<string,unknown>={};for(let i=0;i<250;i++){const id='e'+(900+i);values[id]={id,day:w.day,kind:'test',actor:'human',text:pair('精确同日 '+i,'Exact same day '+i)};}
const archiveId=await ctx.db.insert('civilizationArchives',{worldId,kind:'event',...encodeArchive(values),records:250,createdAt:Date.now()});
for(const [key,data]of Object.entries(values))await ctx.db.insert('civilizationRecords',{worldId,key,serial:historySerial(key),kind:'event',day:w.day,archiveId});
}});
`,
);
const file = path.join(directory, 'database.sqlite3'),
  log = fs.openSync(path.join(directory, 'backend.log'), 'a');
const child = spawn(
  path.resolve(
    '.runtime/local-app-data/convex/binaries/precompiled-2026-10-10-72ce13c/convex-local-backend.exe',
  ),
  [
    '--interface',
    '127.0.0.1',
    '--port',
    '3230',
    '--site-proxy-port',
    '3231',
    '--convex-origin',
    'http://127.0.0.1:3230',
    '--convex-site',
    'http://127.0.0.1:3231',
    '--instance-name',
    config.deploymentName,
    '--instance-secret',
    config.instanceSecret,
    '--local-storage',
    path.join(directory, 'storage'),
    '--disable-beacon',
    file,
  ],
  {
    cwd: directory,
    windowsHide: true,
    stdio: ['ignore', log, log],
    env: { ...process.env, TMP: directory, TEMP: directory },
  },
);
const client = new ConvexHttpClient('http://127.0.0.1:3230');
client.setAdminAuth(config.adminKey);
const q = (n, a = {}) => client.query(makeFunctionReference('civilization:' + n), a),
  m = (n, a = {}) => client.mutation(makeFunctionReference('civilization:' + n), a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  report = { tests: [], benchmarks: [] };
const save = () =>
  fs.writeFileSync(
    '.runtime/governance/isolated-features-final.json',
    JSON.stringify(report, null, 2),
  );
const cli = (args) => {
  const env = { ...process.env, TMP: directory, TEMP: directory };
  delete env.NODE_TLS_REJECT_UNAUTHORIZED;
  const r = spawnSync(
    process.execPath,
    [path.join(root, 'node_modules/convex/bin/main.js'), ...args],
    { cwd: directory, env, windowsHide: true, encoding: 'utf8', maxBuffer: 8 * 1024 ** 2 },
  );
  fs.appendFileSync(path.join(directory, 'cli.log'), r.stdout + r.stderr);
  if (r.status !== 0) throw Error('Isolated deploy/import failed');
};
try {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch('http://127.0.0.1:3230/version')).ok) break;
    } catch {}
    await sleep(500);
  }
  cli([
    'import',
    '--replace-all',
    '--yes',
    path.resolve('../backups/before-runtime-governance-20261027.zip'),
  ]);
  cli(['dev', '--once', '--typecheck', 'disable']);
  const keep = 'mh7fm2xg8twftrfgzsvkk9bfvh8h1wn4',
    original = (await q('get', { worldId: keep })).state;
  const parent = await m('create', {
    name: '隔离·父世界',
    seed: 'pagination-boundary',
    population: 8,
    strategy: 'survival',
    authority: 'human',
    persistence: 'locked',
  });
  await m('seedHistory', { worldId: parent });
  const branch = await m('branch', { worldId: parent, name: '隔离·保留分支' });
  await m('seedHistory', { worldId: parent, future: true });
  let cursor,
    all = [];
  do {
    const r = await q('historyPage', {
      worldId: branch,
      kind: 'event',
      limit: 37,
      ...(cursor ? { cursor } : {}),
    });
    all.push(...r.page);
    cursor = r.cursor;
  } while (cursor);
  assert.equal(
    all.filter((r) => Number(r.id.slice(1)) >= 900 && Number(r.id.slice(1)) < 1150).length,
    250,
  );
  assert.deepEqual(
    all
      .filter((r) => Number(r.id.slice(1)) >= 900 && Number(r.id.slice(1)) < 1150)
      .map((r) => Number(r.id.slice(1))),
    Array.from({ length: 250 }, (_, i) => 1149 - i),
  );
  assert.equal(new Set(all.map((r) => r.id)).size, all.length);
  assert(!all.some((r) => r.id === 'e7000'));
  report.tests.push(
    'compressed same-day pagination: all 250 records, no duplicate, parent post-fork record excluded',
  );
  await assert.rejects(
    m('beginDeletion', {
      worldId: keep,
      backup: 'test',
      confirmation: original.name,
      expectedUpdated: 0,
      expectedWrites: 0,
    }),
  );
  await assert.rejects(
    m('beginDeletion', {
      worldId: parent,
      backup: 'test',
      confirmation: '隔离·父世界',
      expectedUpdated: 0,
      expectedWrites: 0,
    }),
  );
  report.tests.push('protected world and parent with retained child cannot be deleted');
  await m('save', { worldId: branch, name: '删除恢复验收' });
  const branchBefore = (await q('get', { worldId: branch })).state;
  const marker = (await q('storageStats')).find((w) => w.worldId === branch);
  const recovery = path.join(directory, 'before-fixture-deletion.zip');
  cli(['export', '--include-file-storage', '--path', recovery]);
  const deletionArgs = {
    worldId: branch,
    backup: recovery,
    confirmation: '隔离·保留分支',
    expectedUpdated: marker.updated,
    expectedWrites: marker.writes,
  };
  const jobId = await m('beginDeletion', deletionArgs);
  assert.equal(await m('beginDeletion', deletionArgs), jobId);
  let job = await m('deletionBatch', { jobId });
  assert.equal(job.status, 'pending');
  // Leave the first batch committed, reconnect, and resume using the persisted job identifier.
  await sleep(200);
  while (job.status !== 'done') job = await m('deletionBatch', { jobId });
  assert.equal((await m('deletionBatch', { jobId })).removed, job.removed);
  await assert.rejects(q('get', { worldId: branch }));
  assert((await q('historyPage', { worldId: parent, kind: 'event' })).page.length > 0);
  report.tests.push(
    'deletion batch interruption, persisted resume, retry idempotency and parent history preserved',
  );
  save();
  for (const mode of process.argv.includes('--features-only') ? [] : ['legacy', 'batched']) {
    const id = await m('branch', { worldId: keep, name: '隔离·正常速度·' + mode });
    await m('control', { worldId: id, speed: 1 });
    const proof = await m('observe', { worldId: id, sentAt: Date.now() });
    await m('control', {
      worldId: id,
      running: true,
      expectedLoop: proof.loop,
      requestedAt: Date.now(),
    });
    if (mode === 'legacy') await m('legacyStart', { worldId: id });
    const timer = setInterval(
      () => m('observe', { worldId: id, sentAt: Date.now() }).catch(() => {}),
      10000,
    );
    const start = {
      at: Date.now(),
      stats: (await q('storageStats')).find((w) => w.worldId === id),
      state: (await q('get', { worldId: id })).state,
      bytes: fs.statSync(file).size,
    };
    await sleep(60000);
    const end = {
      at: Date.now(),
      stats: (await q('storageStats')).find((w) => w.worldId === id),
      state: (await q('get', { worldId: id })).state,
      bytes: fs.statSync(file).size,
    };
    clearInterval(timer);
    await m('control', { worldId: id, running: false });
    const result = {
      mode,
      milliseconds: end.at - start.at,
      writes: end.stats.writes - start.stats.writes,
      chars: end.stats.writtenChars - start.stats.writtenChars,
      bytes: end.bytes - start.bytes,
      startClock: start.state.clock,
      endClock: end.state.clock,
      startDay: start.state.day,
      endDay: end.state.day,
    };
    report.benchmarks.push(result);
    save();
    console.log(JSON.stringify(result));
  }
  assert.deepEqual((await q('get', { worldId: keep })).state, original);
  report.protectedWorldUnchanged = true;
  cli(['import', '--replace-all', '--yes', recovery]);
  assert.deepEqual((await q('get', { worldId: branch })).state, branchBefore);
  assert((await q('saves', { worldId: branch })).some((s) => s.name === '删除恢复验收'));
  assert.equal(
    (await q('historyPage', { worldId: branch, kind: 'event', limit: 100 })).page.length,
    100,
  );
  report.deletedBranchRestoredWithSaveAndExactState = true;
  const named = (await q('saves', { worldId: keep }))[0];
  if (named) {
    const restored = await m('branch', {
      worldId: keep,
      saveId: named.id,
      name: '隔离·原存档校验',
    });
    assert.equal((await q('get', { worldId: restored })).state.day, named.day);
    report.originalCheckpointDecodedAndRestored = true;
  }
} catch (e) {
  report.error = e.message;
  process.exitCode = 1;
} finally {
  child.kill();
  await new Promise((r) => child.once('exit', r));
  save();
  console.log(JSON.stringify(report));
}
