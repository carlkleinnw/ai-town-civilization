import type { Doc, Id } from '../_generated/dataModel';
import type { QueryCtx, MutationCtx } from '../_generated/server';
import { decodeArchive } from './archiveCodec';

export type ArchiveCache = Map<Id<'civilizationArchives'>, Record<string, unknown>>;

/** Index metadata stays in place, so branch cutoffs and existing lookups still apply. */
export async function recordData<T>(
  ctx: QueryCtx | MutationCtx,
  row: Doc<'civilizationRecords'> | Doc<'civilizationPeople'>,
  cache: ArchiveCache = new Map(),
): Promise<T> {
  if (row.data !== undefined) return row.data as T;
  if (!row.archiveId) throw new Error('History record has no body');
  let values = cache.get(row.archiveId);
  if (!values) {
    const archive = await ctx.db.get(row.archiveId);
    if (!archive || archive.worldId !== row.worldId) throw new Error('Missing history archive');
    values = decodeArchive(archive) as Record<string, unknown>;
    cache.set(row.archiveId, values);
  }
  const key = 'key' in row ? row.key : row.personId;
  if (!(key in values)) throw new Error('Missing record inside history archive');
  return values[key] as T;
}
