import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import { readFile, mkdir, writeFile, stat, statfs } from 'node:fs/promises';
import { deepStrictEqual } from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(
  await readFile(path.join(root, '.convex/local/default/config.json'), 'utf8'),
);
const client = new ConvexHttpClient('http://127.0.0.1:3210');
client.setAdminAuth(config.adminKey);
const query = (name, args = {}) =>
  client.query(makeFunctionReference(`civilization:${name}`), args);
const mutate = (name, args) => client.mutation(makeFunctionReference(`civilization:${name}`), args);
const directory = path.join(root, '.runtime/storage');
await mkdir(directory, { recursive: true });
const command = process.argv[2] ?? 'status';

try {
  if (command === 'status') {
    const worlds = await query('storageStats');
    const file = await stat(path.join(root, '.convex/local/default/convex_local_backend.sqlite3'));
    const disk = await statfs(root);
    const report = {
      checkedAt: new Date().toISOString(),
      databaseBytes: file.size,
      freeBytes: disk.bavail * disk.bsize,
      worlds,
    };
    await writeFile(path.join(directory, 'status.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } else if (command === 'migrate') {
    const worlds = await query('list');
    let migrated = 0,
      checkpoints = 0,
      verified = 0;
    for (const world of worlds) {
      const before = world.running ? null : (await query('get', { worldId: world.id })).state;
      const result = await mutate('migrateStorage', { worldId: world.id });
      migrated += Number(result.migrated);
      for (const save of await query('saves', { worldId: world.id })) {
        const result = await mutate('migrateSaveStorage', { saveId: save.id });
        checkpoints += Number(result.migrated);
      }
      if (before) {
        deepStrictEqual((await query('get', { worldId: world.id })).state, before);
        verified++;
      }
    }
    const report = {
      worlds: worlds.length,
      migrated,
      checkpoints,
      unchangedPausedWorlds: verified,
    };
    await writeFile(path.join(directory, 'migration.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } else if (command === 'archive') {
    let records = 0,
      plainBytes = 0,
      compressedBytes = 0,
      verified = 0;
    for (const world of await query('list')) {
      if (world.day <= 180) continue;
      const worldId = world.id,
        before = world.day - 180;
      const views = new Map();
      if (!world.running) {
        for (const kind of [
          'event',
          'audit',
          'plan',
          'decision',
          'sample',
          'land',
          'social',
          'mission',
        ])
          views.set(kind, await query('history', { worldId, kind, before }));
        views.set('ancestors', await query('ancestors', { worldId }));
      }
      for (const kind of [
        'event',
        'audit',
        'plan',
        'decision',
        'sample',
        'land',
        'social',
        'mission',
        'person',
      ]) {
        let cursor = null;
        do {
          const result = await mutate('archiveBatch', { worldId, kind, before, cursor });
          records += result.records;
          plainBytes += result.plainBytes;
          compressedBytes += result.compressedBytes;
          cursor = result.cursor;
        } while (cursor !== null);
      }
      for (const [kind, value] of views) {
        const current =
          kind === 'ancestors'
            ? await query(kind, { worldId })
            : await query('history', { worldId, kind, before });
        deepStrictEqual(current, value);
      }
      verified += views.size;
    }
    const report = { records, plainBytes, compressedBytes, verifiedHistoryViews: verified };
    await writeFile(path.join(directory, 'archive.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } else throw new Error('Usage: node scripts/storage.mjs status|migrate|archive');
} catch (error) {
  // Do not print clients, request headers or configuration objects containing credentials.
  console.error(error.message);
  process.exitCode = 1;
}
