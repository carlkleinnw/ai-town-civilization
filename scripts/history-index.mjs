import fs from 'node:fs';
import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
const client = new ConvexHttpClient('http://127.0.0.1:3210');
client.setAdminAuth(JSON.parse(fs.readFileSync('.convex/local/default/config.json')).adminKey);
const file = '.runtime/governance/history-index-progress.json';
const progress = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : { worlds: {} };
const worlds = await client.query(makeFunctionReference('civilization:list'), {});
const stats = await client.query(makeFunctionReference('civilization:storageStats'), {});
if (worlds.some((w) => w.running)) throw Error('Pause worlds before indexing');
for (const world of worlds) {
  const previous = progress.worlds[world.id];
  if (stats.find((s) => s.worldId === world.id)?.historyIndexVersion === 1) continue;
  let cursor = previous?.done ? null : (previous?.cursor ?? null),
    count = previous?.done ? 0 : (previous?.changed ?? 0);
  do {
    const result = await client.mutation(makeFunctionReference('civilization:indexHistoryBatch'), {
      worldId: world.id,
      cursor,
    });
    count += result.changed;
    cursor = result.cursor;
    progress.worlds[world.id] = { cursor, changed: count, done: cursor === null };
    fs.writeFileSync(file, JSON.stringify(progress, null, 2));
  } while (cursor !== null);
}
console.log(JSON.stringify(progress));
