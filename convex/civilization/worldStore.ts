import type { MutationCtx, QueryCtx } from '../_generated/server';
import type { Doc, Id } from '../_generated/dataModel';
import type { World } from './model';
import { changedParts, joinWorld, splitWorld, WorldCore } from './storageCodec';

export async function loadWorld(ctx: QueryCtx | MutationCtx, id: Id<'civilizationWorlds'>) {
  const row = await ctx.db.get(id);
  if (!row) throw new Error('World not found');
  if (row.deleting) throw new Error('世界正在删除 / World deletion in progress');
  if (row.storageVersion === undefined) return row;
  if (row.storageVersion !== 1) throw new Error('Unsupported civilization storage version');
  const parts = await ctx.db
    .query('civilizationStateParts')
    .withIndex('world_key', (q) => q.eq('worldId', id))
    .collect();
  return { ...row, state: joinWorld(row.state as WorldCore, parts), loadedParts: parts };
}

/** All chunk and manifest changes commit in the same Convex transaction. */
export async function storeWorld(
  ctx: MutationCtx,
  row: Doc<'civilizationWorlds'> & { loadedParts?: Doc<'civilizationStateParts'>[] },
  w: World,
) {
  const packed = splitWorld(w);
  const existing =
    row.loadedParts ??
    (await ctx.db
      .query('civilizationStateParts')
      .withIndex('world_key', (q) => q.eq('worldId', row._id))
      .collect());
  const byKey = new Map(existing.map((p) => [p.key, p]));
  const changed = changedParts(existing, packed.parts);
  const keys = new Set(packed.parts.map((p) => p.key));
  for (const part of changed) {
    const old = byKey.get(part.key);
    if (old) await ctx.db.patch(old._id, { data: part.data });
    else await ctx.db.insert('civilizationStateParts', { worldId: row._id, ...part });
  }
  for (const old of existing) if (!keys.has(old.key)) await ctx.db.delete(old._id);
  const bytes =
    JSON.stringify(packed.core).length +
    changed.reduce((sum, part) => sum + JSON.stringify(part.data).length, 0);
  await ctx.db.patch(row._id, {
    state: packed.core,
    storageVersion: 1,
    running: w.running,
    updated: Date.now(),
    revision: w.revision,
    storageWrites: (row.storageWrites ?? 0) + changed.length + 1,
    storageChars: (row.storageChars ?? 0) + bytes,
  });
  return { changed: changed.length, parts: packed.parts.length, chars: bytes };
}
