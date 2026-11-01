// Isolated official-backend test. Never opens the live database for writing.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
const root = process.cwd(),
  directory = path.resolve(root, '../tmp/runtime-retention-verification-5');
if (fs.existsSync(directory))
  throw Error('Isolation directory already exists; choose a new target');
fs.mkdirSync(directory, { recursive: true });
for (const name of ['convex', 'data', 'package.json', 'tsconfig.json', 'convex.json'])
  if (fs.existsSync(name)) fs.cpSync(name, path.join(directory, name), { recursive: true });
fs.symlinkSync(path.join(root, 'node_modules'), path.join(directory, 'node_modules'), 'junction');
fs.writeFileSync(
  path.join(directory, 'convex/retentionProbe.ts'),
  `import {internalMutation} from './_generated/server';import {v} from 'convex/values';export const write=internalMutation({args:{id:v.optional(v.id('civilizationAICache')),value:v.optional(v.number())},handler:async(ctx,args)=>{if(args.id){await ctx.db.patch(args.id,{context:String(args.value)+'x'.repeat(10000)});return true;}return ctx.db.insert('civilizationAICache',{key:-1234567,context:'0'+'x'.repeat(10000),choice:'probe',expires:9999999999999});}});`,
);
const config = JSON.parse(fs.readFileSync('.convex/local/default/config.json'));
fs.writeFileSync(
  path.join(directory, '.env.local'),
  `CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3230\nCONVEX_SELF_HOSTED_ADMIN_KEY=${config.adminKey}\n`,
);
const file = path.join(directory, 'isolated.sqlite3');
const exe = path.resolve(
  '.runtime/local-app-data/convex/binaries/precompiled-2026-10-10-72ce13c/convex-local-backend.exe',
);
const log = fs.openSync(path.join(directory, 'backend.log'), 'a');
const processBackend = spawn(
  exe,
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
    env: {
      ...process.env,
      DOCUMENT_RETENTION_DELAY: '60',
      INDEX_RETENTION_DELAY: '10',
      RETENTION_CHECKPOINT_PERIOD_SECS: '5',
      DOCUMENT_RETENTION_BATCH_INTERVAL_SECONDS: '2',
      TMP: directory,
      TEMP: directory,
    },
  },
);
fs.writeFileSync(
  path.join(directory, 'process.json'),
  JSON.stringify({ pid: processBackend.pid, directory }),
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cli = (args) => {
  const env = { ...process.env, TMP: directory, TEMP: directory };
  delete env.NODE_TLS_REJECT_UNAUTHORIZED;
  const result = spawnSync(
    process.execPath,
    [path.join(root, 'node_modules/convex/bin/main.js'), ...args],
    { cwd: directory, windowsHide: true, encoding: 'utf8', maxBuffer: 8 * 1024 ** 2, env },
  );
  fs.appendFileSync(path.join(directory, 'cli.log'), result.stdout + result.stderr);
  if (result.status !== 0) throw Error('Isolated CLI failed; see local cli.log');
};
async function repl(source, mutation = false, args = {}) {
  if (mutation) {
    const r = await fetch('http://127.0.0.1:3230/api/mutation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Convex ' + config.adminKey },
      body: JSON.stringify({ path: 'retentionProbe:write', args, format: 'json' }),
    });
    const j = await r.json();
    if (j.status !== 'success') throw Error(JSON.stringify(j));
    return j.value;
  }
  const result = await fetch('http://127.0.0.1:3230/api/run_test_function', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Convex ' + config.adminKey },
    body: JSON.stringify({
      adminKey: config.adminKey,
      args,
      bundle: {
        path: 'probe.js',
        source: `import {${mutation ? 'mutation' : 'query'}} from "convex:/_system/repl/wrappers.js";export default ${mutation ? 'mutation' : 'query'}({handler:async(ctx,args)=>{${source}}});`,
      },
      format: 'json',
    }),
  });
  const data = await result.json();
  if (data.status !== 'success') throw Error(JSON.stringify(data).slice(0, 1800));
  return data.value;
}
function metrics() {
  const d = new DatabaseSync(file, { readOnly: true });
  d.exec('PRAGMA busy_timeout=10000');
  try {
    return {
      at: Date.now(),
      versions: d.prepare('select count(*) n from documents').get().n,
      freePages: d.prepare('pragma freelist_count').get().freelist_count,
      bytes: fs.statSync(file).size,
      retention: d
        .prepare("select key,json_value from persistence_globals where key like '%retention%'")
        .all(),
    };
  } finally {
    d.close();
  }
}
const report = {
  backend: '72ce13c',
  documentRetentionSeconds: 60,
  indexRetentionSeconds: 10,
  samples: [],
};
try {
  const start = Date.now();
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch('http://127.0.0.1:3230/version')).ok) break;
    } catch {}
    await sleep(500);
    if (i === 119) throw Error('Isolated backend did not start');
  }
  report.freshStartupMs = Date.now() - start;
  cli([
    'import',
    '--replace-all',
    '--yes',
    path.resolve(root, '../backups/before-runtime-governance-20261027.zip'),
  ]);
  cli(['dev', '--once', '--typecheck', 'disable']);
  console.log('Isolated snapshot imported and deployed');
  const clientQuery = async (name, args = {}) => {
    const r = await fetch('http://127.0.0.1:3230/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Convex ' + config.adminKey },
      body: JSON.stringify({ path: 'civilization:' + name, args, format: 'json' }),
    });
    const j = await r.json();
    if (j.status !== 'success') throw Error(j.errorMessage);
    return j.value;
  };
  const id = 'mh7fm2xg8twftrfgzsvkk9bfvh8h1wn4';
  const original = JSON.parse(fs.readFileSync('.runtime/governance/before-protected.json'));
  assert.deepEqual((await clientQuery('get', { worldId: id })).state, original.state);
  report.restoredWorldExact = true;
  const saves = await clientQuery('saves', { worldId: id });
  report.readableSaves = saves.length;
  console.log('Reading isolated business baseline');
  const baseline = await repl(
    'const out={};for(const table of ["civilizationWorlds","civilizationRecords","civilizationPeople","civilizationArchives","civilizationSaves","civilizationStateParts"]){out[table]=(await ctx.db.query(table).collect()).map(r=>{const text=JSON.stringify(r,(_,v)=>v instanceof ArrayBuffer?Array.from(new Uint8Array(v)):v);let h=2166136261;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);return [r._id,h];});}return out;',
  );
  console.log('Writing controlled versions');
  const probeId = await repl(
    'return await ctx.db.insert("civilizationAICache",{key:-1234567,context:"0"+"x".repeat(10000),choice:"probe",expires:9999999999999});',
    true,
  );
  for (let i = 1; i <= 200; i++)
    await repl(
      'await ctx.db.patch(args.id,{context:String(args.value)+"x".repeat(10000)});return true;',
      true,
      { id: probeId, value: i },
    );
  report.samples.push(metrics());
  for (let i = 0; i < 8; i++) {
    await sleep(15000);
    report.samples.push(metrics());
    fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify(report, null, 2));
  }
  const latest = await repl('return await ctx.db.get(args.id);', false, { id: probeId });
  assert.equal(latest.context, '200' + 'x'.repeat(10000));
  const after = await repl(
    'const out={};for(const table of ["civilizationWorlds","civilizationRecords","civilizationPeople","civilizationArchives","civilizationSaves","civilizationStateParts"]){out[table]=(await ctx.db.query(table).collect()).map(r=>{const text=JSON.stringify(r,(_,v)=>v instanceof ArrayBuffer?Array.from(new Uint8Array(v)):v);let h=2166136261;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);return [r._id,h];});}return out;',
  );
  assert.deepEqual(after, baseline);
  report.businessDocumentsUnchanged = true;
  report.businessDocuments = Object.values(baseline).reduce((n, v) => n + v.length, 0);
  report.versionsReclaimed = report.samples[0].versions - report.samples.at(-1).versions;
  assert(report.versionsReclaimed > 100);
  report.latestValuePreserved = true;
} catch (e) {
  report.error = e.message;
  process.exitCode = 1;
} finally {
  processBackend.kill();
  await new Promise((r) => processBackend.once('exit', r));
  const d = new DatabaseSync(file, { readOnly: true });
  report.quickCheck = d.prepare('pragma quick_check').get().quick_check;
  d.close();
  const text = fs.readFileSync(path.join(directory, 'backend.log'), 'utf8');
  report.retentionErrors = text
    .split('\n')
    .filter((l) => /out.of.retention|retention.*(error|failed)/i.test(l)).length;
  fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      ...report,
      samples: report.samples.map((s) => ({
        at: s.at,
        versions: s.versions,
        freePages: s.freePages,
      })),
    }),
  );
}
