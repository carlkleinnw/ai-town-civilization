import { defineTable } from 'convex/server';
import { v } from 'convex/values';
export const civilizationTables = {
  civilizationWorlds: defineTable({
    name: v.string(),
    state: v.any(),
    storageVersion: v.optional(v.number()),
    storageWrites: v.optional(v.number()),
    storageChars: v.optional(v.number()),
    onlineMs: v.optional(v.number()),
    clockAnchor: v.optional(v.number()),
    tickSeconds: v.optional(v.number()),
    clockCredited: v.optional(v.number()),
    deleting: v.optional(v.boolean()),
    historyIndexVersion: v.optional(v.number()),
    running: v.boolean(),
    updated: v.number(),
    revision: v.number(),
    loop: v.optional(v.number()),
    observedAt: v.optional(v.number()),
    pauseReason: v.optional(v.union(v.literal('manual'), v.literal('unobserved'))),
    lastControl: v.optional(v.object({ at: v.number(), action: v.string() })),
    parent: v.optional(v.id('civilizationWorlds')),
    forkDay: v.optional(v.number()),
    forkSerial: v.optional(v.number()),
    lease: v.optional(v.object({ token: v.string(), decisionId: v.string(), until: v.number() })),
  }).index('running', ['running']),
  civilizationDeletionJobs: defineTable({
    worldId: v.id('civilizationWorlds'),
    name: v.string(),
    backup: v.string(),
    backupChecksum: v.optional(v.string()),
    error: v.optional(v.string()),
    phase: v.number(),
    removed: v.number(),
    status: v.union(v.literal('pending'), v.literal('done')),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('world', ['worldId'])
    .index('status', ['status']),
  civilizationStateParts: defineTable({
    worldId: v.id('civilizationWorlds'),
    key: v.string(),
    data: v.any(),
  }).index('world_key', ['worldId', 'key']),
  civilizationRecords: defineTable({
    worldId: v.id('civilizationWorlds'),
    key: v.string(),
    serial: v.optional(v.number()),
    kind: v.string(),
    day: v.number(),
    data: v.optional(v.any()),
    archiveId: v.optional(v.id('civilizationArchives')),
  })
    .index('world_key', ['worldId', 'key'])
    .index('world_day', ['worldId', 'day'])
    .index('world_kind_day', ['worldId', 'kind', 'day'])
    .index('world_kind_day_serial_key', ['worldId', 'kind', 'day', 'serial', 'key']),
  civilizationPeople: defineTable({
    worldId: v.id('civilizationWorlds'),
    personId: v.string(),
    day: v.number(),
    data: v.optional(v.any()),
    archiveId: v.optional(v.id('civilizationArchives')),
  })
    .index('world_person', ['worldId', 'personId'])
    .index('world_day', ['worldId', 'day']),
  civilizationArchives: defineTable({
    worldId: v.id('civilizationWorlds'),
    kind: v.string(),
    encoding: v.literal('gzip-v1'),
    body: v.bytes(),
    checksum: v.number(),
    plainBytes: v.number(),
    records: v.number(),
    createdAt: v.number(),
  }).index('world', ['worldId']),
  civilizationSaves: defineTable({
    worldId: v.id('civilizationWorlds'),
    name: v.string(),
    day: v.number(),
    state: v.any(),
    savedAt: v.number(),
  }).index('world', ['worldId']),
  civilizationAICache: defineTable({
    key: v.number(),
    context: v.string(),
    choice: v.string(),
    expires: v.number(),
  }).index('key', ['key']),
};
