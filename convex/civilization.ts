import { proposeMission } from './civilization/missions';
import { Mission } from './civilization/model';
import { ensureSociety, proposeRules } from './civilization/society';
import { SocialRules } from './civilization/model';
import { cancelLand, proposeLand, LAND_ACTIONS } from './civilization/land';
import { LandAction } from './civilization/model';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import { Id, Doc } from './_generated/dataModel';
import {
  internalMutation,
  internalQuery,
  mutation,
  MutationCtx,
  query,
  QueryCtx,
} from './_generated/server';
import { STRATEGIES } from './civilization/catalog';
import { ensureClock, heartbeat, SPEEDS, continuousTime } from './civilization/clock';
import {
  isObserved,
  shouldPauseUnobserved,
  OBSERVATION_HEARTBEAT_MS,
  OBSERVATION_TIMEOUT_MS,
  isFreshRequest,
  canResume,
} from './civilization/observation';
import { loadWorld as load, storeWorld } from './civilization/worldStore';
import { summarizeWorld } from './civilization/storageCodec';
import {
  encodeArchive,
  decodeArchive,
  restoreSnapshot,
  canArchive,
  EncodedArchive,
} from './civilization/archiveCodec';
import { recordData, ArchiveCache } from './civilization/archiveStore';
import {
  mergeHistory,
  compareHistory,
  historySerial,
  HistoryBoundary,
} from './civilization/historyPage';
import {
  advance,
  changeSettings,
  clone,
  createDecision,
  createWorld,
  event,
  foodDays,
  intervene,
  resolveDecision,
  shelterCapacity,
  storageCapacity,
  validateStrategy,
} from './civilization/engine';
import {
  Action,
  Authority,
  CivEvent,
  Audit,
  Plan,
  Decision,
  Sample,
  Person,
  DecisionKind,
  Persistence,
  Strategy,
  StrategyId,
  World,
  alive,
  pair,
} from './civilization/model';

const idArg = { worldId: v.id('civilizationWorlds') };
const authorityV = v.union(v.literal('human'), v.literal('ai'), v.literal('mixed'));
const persistenceV = v.union(v.literal('locked'), v.literal('node'), v.literal('evolving'));
const kindV = v.union(
  v.literal('crisis'),
  v.literal('direction'),
  v.literal('construction'),
  v.literal('discovery'),
);
function state(row: Doc<'civilizationWorlds'>): World {
  return row.state as World;
}

// Credit only this live scheduling interval. A late callback never settles an offline gap.
async function loadForUpdate(ctx: MutationCtx, worldId: Id<'civilizationWorlds'>) {
  const row = await load(ctx, worldId);
  if (row.deleting) throw new Error('世界正在删除 / World deletion in progress');
  const w = clone(state(row));
  if (w.running && row.clockAnchor !== undefined && row.tickSeconds !== undefined) {
    const elapsed = Date.now() - row.clockAnchor;
    const seconds =
      elapsed < 0 || elapsed > row.tickSeconds * 1000 + 2500
        ? 0
        : Math.min(
            row.tickSeconds,
            continuousTime(w) ? elapsed / 1000 : Math.floor(elapsed / 1000),
          );
    const credit = Math.max(0, seconds - (row.clockCredited ?? 0));
    let credited = 0;
    for (; credited + 1 <= credit + 1e-9 && w.running; credited++) heartbeat(w);
    if (w.running && credit - credited > 1e-9) {
      heartbeat(w, credit - credited);
      credited = credit;
    }
    if (credited)
      await ctx.db.patch(worldId, {
        clockCredited: (row.clockCredited ?? 0) + credited,
        onlineMs: (row.onlineMs ?? 0) + credited * 1000,
      });
  }
  return { ...row, state: w, originalState: state(row) };
}

async function scheduleTick(
  ctx: MutationCtx,
  worldId: Id<'civilizationWorlds'>,
  w: World,
  loop: number,
) {
  const c = ensureClock(w);
  // No hourly rule can change before this boundary. Retain the exact fractional budget.
  const untilBoundary = ((1 - c.budget - 1e-9) * c.secondsPerDay) / (w.speed * 24);
  const seconds = continuousTime(w)
    ? Math.max(0.02, Math.min(5, untilBoundary))
    : Math.max(1, Math.min(5, Math.ceil(untilBoundary)));
  const row = await ctx.db.get(worldId);
  const delay = Math.max(
    1,
    Math.min(seconds * 1000, (row?.observedAt ?? Date.now()) + OBSERVATION_TIMEOUT_MS - Date.now()),
  );
  await ctx.db.patch(worldId, { clockAnchor: Date.now(), tickSeconds: seconds, clockCredited: 0 });
  await ctx.scheduler.runAfter(delay, internal.civilization.tick, { worldId, loop });
}

/** Archive old history and dead identities before trimming the hot simulation document. */
async function persist(
  ctx: MutationCtx,
  row: Doc<'civilizationWorlds'> & { originalState?: World },
  w: World,
) {
  const previous = row.originalState ?? state(row);
  const old = new Map<string, string>();
  for (const item of [
    ...previous.events,
    ...previous.audits,
    ...previous.decisions,
    ...previous.plans,
    ...(previous.landProjects ?? []),
    ...(previous.society?.proposals ?? []),
    ...(previous.society?.missions ?? []),
  ])
    old.set(item.id, JSON.stringify(item));
  const records = [
    ...(w.society?.proposals ?? []).map((data) => ({
      key: data.id,
      kind: 'social',
      day: data.created,
      data,
    })),
    ...(w.society?.missions ?? []).map((data) => ({
      key: data.id,
      kind: 'mission',
      day: data.created,
      data,
    })),
    ...(w.landProjects ?? []).map((data) => ({
      key: data.id,
      kind: 'land',
      day: data.created,
      data,
    })),
    ...w.events.map((data) => ({ key: data.id, kind: 'event', day: data.day, data })),
    ...w.audits.map((data) => ({ key: data.id, kind: 'audit', day: data.day, data })),
    ...w.decisions.map((data) => ({ key: data.id, kind: 'decision', day: data.day, data })),
    ...w.plans.map((data) => ({ key: data.id, kind: 'plan', day: data.created, data })),
    ...w.samples
      .filter((s) => !previous.samples.some((p) => p.day === s.day))
      .map((data) => ({ key: `sample-${data.day}`, kind: 'sample', day: data.day, data })),
  ];
  for (const record of records) {
    if (old.get(record.key) === JSON.stringify(record.data)) continue;
    if ('at' in record.data && record.data.at === '') record.data.at = new Date().toISOString();
    const existing = await ctx.db
      .query('civilizationRecords')
      .withIndex('world_key', (q) => q.eq('worldId', row._id).eq('key', record.key))
      .unique();
    if (existing)
      await ctx.db.patch(existing._id, {
        ...record,
        serial: historySerial(record.key),
        archiveId: undefined,
      });
    else
      await ctx.db.insert('civilizationRecords', {
        worldId: row._id,
        ...record,
        serial: historySerial(record.key),
      });
  }
  for (const p of w.people.filter((p) => p.died !== undefined)) {
    const existing = await ctx.db
      .query('civilizationPeople')
      .withIndex('world_person', (q) => q.eq('worldId', row._id).eq('personId', p.id))
      .unique();
    if (!existing)
      await ctx.db.insert('civilizationPeople', {
        worldId: row._id,
        personId: p.id,
        day: p.died!,
        data: p,
      });
  }
  w.people = alive(w);
  w.events = w.events.slice(-70);
  w.audits = w.audits.slice(-30);
  w.decisions = [
    ...w.decisions.filter((d) => d.status === 'resolved').slice(-24),
    ...w.decisions.filter((d) => d.status !== 'resolved'),
  ];
  w.plans = [
    ...w.plans.filter((p) => !['planned', 'executing'].includes(p.status)).slice(-40),
    ...w.plans.filter((p) => ['planned', 'executing'].includes(p.status)),
  ];
  if (w.society) {
    w.society.proposals = [
      ...w.society.proposals.filter((p) => p.status !== 'discussion').slice(-24),
      ...w.society.proposals.filter((p) => p.status === 'discussion'),
    ];
    w.society.missions = [
      ...w.society.missions.filter((p) => ['completed', 'failed'].includes(p.status)).slice(-24),
      ...w.society.missions.filter((p) => !['completed', 'failed'].includes(p.status)),
    ];
  }
  if (w.landProjects)
    w.landProjects = [
      ...w.landProjects.filter((p) => ['completed', 'cancelled'].includes(p.status)).slice(-24),
      ...w.landProjects.filter((p) => !['completed', 'cancelled'].includes(p.status)),
    ];
  w.buildings = w.buildings.filter((b) => b.condition > 0);
  // Keep the origin and whole time range, compacting older actual samples.
  if (w.samples.length > 160)
    w.samples = [
      w.samples[0],
      ...w.samples.slice(1, 81).filter((_, i) => i % 2 === 1),
      ...w.samples.slice(81),
    ];
  if (JSON.stringify(w).length > 700000)
    throw new Error('World state too large; pause and export for inspection');
  await storeWorld(ctx, row, w);
}

async function insertWorld(
  ctx: MutationCtx,
  w: World,
  parent?: Id<'civilizationWorlds'>,
  forkDay?: number,
  forkSerial?: number,
) {
  const id = await ctx.db.insert('civilizationWorlds', {
    name: w.name,
    state: w,
    running: false,
    updated: Date.now(),
    revision: w.revision,
    historyIndexVersion: 1,
    ...(parent ? { parent, forkDay, forkSerial } : {}),
  });
  // Empty previous arrays make genesis and inherited recent state durable records too.
  const previous = clone(w);
  previous.events = [];
  previous.audits = [];
  previous.plans = [];
  previous.decisions = [];
  previous.samples = [];
  previous.landProjects = [];
  if (previous.society) {
    previous.society.proposals = [];
    previous.society.missions = [];
  }
  await persist(ctx, { ...(await load(ctx, id)), state: previous }, w);
  return id;
}
export const list = query({
  args: {},
  handler: async (ctx) => {
    const output = [];
    for (const row of await ctx.db.query('civilizationWorlds').order('desc').take(100)) {
      if (row.deleting) continue;
      let summary: ReturnType<typeof summarizeWorld>;
      if (row.storageVersion === undefined) summary = summarizeWorld(state(row));
      else {
        const part = await ctx.db
          .query('civilizationStateParts')
          .withIndex('world_key', (q) => q.eq('worldId', row._id).eq('key', '_summary'))
          .unique();
        if (!part) throw new Error('Missing civilization summary');
        summary = (part.data as [ReturnType<typeof summarizeWorld>])[0];
      }
      const { samples: _samples, ...compact } = summary;
      output.push({ id: row._id, ...compact, name: row.name });
    }
    return output;
  },
});
export const comparisonSamples = query({
  args: { worldIds: v.array(v.id('civilizationWorlds')) },
  handler: async (ctx, { worldIds }) => {
    if (worldIds.length > 4) throw new Error('最多比较四个世界');
    const output = [];
    for (const id of worldIds) {
      const row = await ctx.db.get(id);
      if (!row || row.deleting) continue;
      const part =
        row.storageVersion === 1
          ? await ctx.db
              .query('civilizationStateParts')
              .withIndex('world_key', (q) => q.eq('worldId', id).eq('key', '_summary'))
              .unique()
          : null;
      output.push({
        id,
        samples:
          row.storageVersion === 1
            ? (part?.data as [ReturnType<typeof summarizeWorld>])[0].samples
            : state(row).samples,
      });
    }
    return output;
  },
});
export const get = query({
  args: idArg,
  handler: async (ctx, { worldId }) => {
    const row = await load(ctx, worldId);
    return {
      id: row._id,
      state: state(row),
      presentation: {
        anchor: row.clockAnchor ?? Date.now(),
        credited: row.clockCredited ?? 0,
        seconds: row.tickSeconds ?? 0,
        serverNow: Date.now(),
        loop: row.loop ?? 0,
      },
      modelBusy: !!row.lease && row.lease.until > Date.now(),
      updated: row.updated,
      pauseReason: row.pauseReason ?? null,
      lastControl: row.lastControl ?? null,
    };
  },
});
export const create = mutation({
  args: {
    name: v.string(),
    seed: v.string(),
    population: v.number(),
    strategy: v.string(),
    custom: v.optional(v.string()),
    authority: authorityV,
    persistence: persistenceV,
    stopDay: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (
      !args.name.trim() ||
      !args.seed.trim() ||
      args.name.length > 60 ||
      args.seed.length > 80 ||
      !Number.isInteger(args.population) ||
      args.population < 4 ||
      args.population > 32 ||
      !Object.keys(STRATEGIES).concat('custom').includes(args.strategy) ||
      (args.stopDay !== undefined && (!Number.isInteger(args.stopDay) || args.stopDay < 1))
    )
      throw new Error('Invalid world settings');
    if ((await ctx.db.query('civilizationWorlds').take(101)).length >= 100)
      throw new Error('Maximum 100 experiments; export before creating more');
    const custom = args.custom ? (JSON.parse(args.custom) as Strategy) : undefined;
    if (custom) validateStrategy(custom);
    const w = createWorld({ ...args, strategy: args.strategy as StrategyId, custom });
    w.running = false;
    const id = await insertWorld(ctx, w);
    return id;
  },
});

export const control = mutation({
  args: {
    ...idArg,
    running: v.optional(v.boolean()),
    speed: v.optional(v.number()),
    secondsPerDay: v.optional(v.number()),
    step: v.optional(v.number()),
    expectedLoop: v.optional(v.number()),
    requestedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const row = await loadForUpdate(ctx, args.worldId),
      w = clone(state(row));
    const clock = ensureClock(w);
    if (args.speed !== undefined) {
      if (!SPEEDS.includes(args.speed)) throw new Error('Unsupported time multiplier');
      w.speed = args.speed;
    }
    if (args.secondsPerDay !== undefined) {
      if (
        !Number.isInteger(args.secondsPerDay) ||
        args.secondsPerDay < 24 ||
        args.secondsPerDay > 3600
      )
        throw new Error('A normal day must take 24–3600 real seconds');
      const before = JSON.stringify({ secondsPerDay: clock.secondsPerDay });
      clock.secondsPerDay = args.secondsPerDay;
      w.audits.push({
        id: `a${w.nextId++}`,
        day: w.day,
        at: '',
        actor: 'human',
        reason: 'Time baseline / 调整观察时间基准',
        before,
        after: JSON.stringify({ secondsPerDay: clock.secondsPerDay }),
      });
    }
    if (args.running !== undefined) {
      if (
        args.running &&
        (!isObserved(row.observedAt, Date.now()) ||
          !canResume(
            row.loop ?? 0,
            args.expectedLoop,
            args.requestedAt,
            Date.now(),
            row.lastControl?.at,
          ))
      )
        throw new Error('请打开世界页面后点击继续 / Open the world page before resuming');
      if (args.running && w.endReason)
        throw new Error('This civilization is extinct; create or restore a branch');
      if (args.running && w.stopDay !== null && w.day >= w.stopDay)
        throw new Error('Observation limit reached; extend it in settings');
      if (
        args.running &&
        !w.running &&
        (
          await ctx.db
            .query('civilizationWorlds')
            .withIndex('running', (q) => q.eq('running', true))
            .take(4)
        ).length >= 3
      )
        throw new Error('At most three worlds can run simultaneously');
      w.running = args.running;
    }
    if (args.step !== undefined) {
      if (w.running || !Number.isInteger(args.step) || args.step < 1 || args.step > 30)
        throw new Error('Pause before stepping 1–30 days');
      advance(w, args.step, false);
    }
    await persist(ctx, row, w);
    if (args.running !== undefined)
      await ctx.db.patch(row._id, {
        pauseReason: w.running ? undefined : 'manual',
        lease: w.running ? row.lease : undefined,
        lastControl: { at: Date.now(), action: w.running ? 'manual-resume' : 'manual-pause' },
      });
    await ctx.db.patch(row._id, { loop: (row.loop ?? 0) + 1 });
    if (w.running) await scheduleTick(ctx, row._id, w, (row.loop ?? 0) + 1);
    await queueAI(ctx, row._id, w);
  },
});

export const settings = mutation({
  args: {
    ...idArg,
    authority: authorityV,
    persistence: persistenceV,
    strategy: v.string(),
    humanKinds: v.array(kindV),
    stopDay: v.union(v.number(), v.null()),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await load(ctx, args.worldId),
      w = clone(state(row));
    if (args.stopDay !== null && (!Number.isInteger(args.stopDay) || args.stopDay <= w.day))
      throw new Error('Observation limit must be a future day');
    const strategy = JSON.parse(args.strategy) as Strategy;
    validateStrategy(strategy);
    changeSettings(
      w,
      {
        strategy,
        authority: args.authority as Authority,
        persistence: args.persistence as Persistence,
        humanKinds: args.humanKinds as DecisionKind[],
        stopDay: args.stopDay,
      },
      args.reason,
    );
    createDecision(w);
    await persist(ctx, row, w);
    await ctx.db.patch(row._id, { lease: undefined });
    await queueAI(ctx, row._id, w);
  },
});
export const decide = mutation({
  args: {
    ...idArg,
    decisionId: v.string(),
    action: v.string(),
    reason: v.string(),
    strategy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const row = await load(ctx, args.worldId),
      w = clone(state(row));
    if (!args.reason.trim()) throw new Error('Please give a reason');
    if (args.strategy) {
      const d = w.decisions.find((d) => d.id === args.decisionId);
      if (!d || d.status === 'resolved') throw new Error('Decision expired');
      const s = JSON.parse(args.strategy) as Strategy;
      validateStrategy(s);
      const before = JSON.stringify(w.strategy);
      w.strategy = s;
      w.revision++;
      w.audits.push({
        id: `a${w.nextId++}`,
        day: w.day,
        at: '',
        actor: 'human',
        reason: args.reason,
        before,
        after: JSON.stringify(s),
      });
    }
    resolveDecision(
      w,
      args.decisionId,
      args.action as Action,
      'human',
      pair(args.reason, args.reason),
    );
    await ctx.db.patch(row._id, { lease: undefined });
    await persist(ctx, row, w);
  },
});
export const intervention = mutation({
  args: {
    ...idArg,
    kind: v.union(
      v.literal('food'),
      v.literal('wood'),
      v.literal('rain'),
      v.literal('drought'),
      v.literal('policy'),
    ),
    amount: v.number(),
    reason: v.string(),
    action: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const row = await load(ctx, args.worldId),
      w = clone(state(row));
    if (
      args.kind === 'policy' &&
      w.plans.filter((p) => ['planned', 'executing'].includes(p.status)).length >= 6
    )
      throw new Error('Too many active plans');
    intervene(w, args.kind, args.amount, args.reason, args.action as Action | undefined);
    await persist(ctx, row, w);
  },
});

export const save = mutation({
  args: { ...idArg, name: v.string() },
  handler: async (ctx, { worldId, name }) => {
    if (!name.trim() || name.length > 80) throw new Error('Please name the save');
    if (
      (
        await ctx.db
          .query('civilizationSaves')
          .withIndex('world', (q) => q.eq('worldId', worldId))
          .take(101)
      ).length >= 100
    )
      throw new Error('Maximum 100 checkpoints per world');
    const row = await loadForUpdate(ctx, worldId);
    if (row.running && JSON.stringify(row.state) !== JSON.stringify(row.originalState))
      await persist(ctx, row, state(row));
    await ctx.db.patch(worldId, { updated: Date.now() });
    return await ctx.db.insert('civilizationSaves', {
      worldId,
      name,
      state: encodeArchive(state(row)),
      day: state(row).day,
      savedAt: Date.now(),
    });
  },
});
export const saves = query({
  args: idArg,
  handler: async (ctx, { worldId }) =>
    (
      await ctx.db
        .query('civilizationSaves')
        .withIndex('world', (q) => q.eq('worldId', worldId))
        .order('desc')
        .take(100)
    ).map(({ _id, name, day, savedAt }) => ({ id: _id, name, day, savedAt })),
});
export const branch = mutation({
  args: { ...idArg, name: v.string(), saveId: v.optional(v.id('civilizationSaves')) },
  handler: async (ctx, args) => {
    let row: Doc<'civilizationWorlds'> & { originalState?: World } = await loadForUpdate(
      ctx,
      args.worldId,
    );
    if (row.running && JSON.stringify(row.state) !== JSON.stringify(row.originalState))
      await persist(ctx, row, state(row));
    let w = clone(state(row));
    if (args.saveId) {
      const save = await ctx.db.get(args.saveId);
      if (!save || save.worldId !== args.worldId) throw new Error('Save not found');
      w = clone(restoreSnapshot(save.state as World | EncodedArchive));
    }
    if (!args.name.trim() || args.name.length > 60) throw new Error('Please name the branch');
    let depth = 0;
    while (row.parent) {
      row = await load(ctx, row.parent);
      if (++depth >= 12)
        throw new Error('Branch depth limited to 12; start a fresh seeded experiment');
    }
    if ((await ctx.db.query('civilizationWorlds').take(101)).length >= 100)
      throw new Error('Maximum 100 worlds');
    const forkSerial = w.nextId;
    w.name = args.name;
    w.running = false;
    w.branch = { parent: args.worldId, day: w.day };
    event(
      w,
      'branch',
      pair(
        `人工从第 ${w.day} 天建立实验分支，随机状态保留。`,
        `Human-created branch at day ${w.day}; random state preserved.`,
      ),
      'human',
    );
    return await insertWorld(ctx, w, args.worldId, w.day, forkSerial);
  },
});

// Parent cutoffs preserve history at the fork, without exposing the parent's future.
async function lineage(ctx: QueryCtx, worldId: Id<'civilizationWorlds'>) {
  const rows: { id: Id<'civilizationWorlds'>; cutoff: number; serial: number; indexed: boolean }[] =
    [];
  let row = await ctx.db.get(worldId),
    cutoff = Infinity,
    serial = Infinity;
  for (let n = 0; n < 13; n++) {
    if (!row) throw new Error('World history dependency missing');
    rows.push({ id: row._id, cutoff, serial, indexed: row.historyIndexVersion === 1 });
    if (!row.parent) break;
    cutoff = Math.min(cutoff, row.forkDay ?? state(row).day);
    let forkSerial = row.forkSerial;
    if (forkSerial === undefined) {
      const currentId = row._id,
        currentDay = row.forkDay ?? state(row).day;
      // Early local preview branches did not have a serial cutoff. Their own
      // branch event preserves it even when the hot history has been trimmed.
      const records = await ctx.db
        .query('civilizationRecords')
        .withIndex('world_kind_day', (q) =>
          q.eq('worldId', currentId).eq('kind', 'event').eq('day', currentDay),
        )
        .take(200);
      const branchSerials = [0];
      const cache: ArchiveCache = new Map();
      for (const record of records) {
        if ((await recordData<CivEvent>(ctx, record, cache)).kind === 'branch')
          branchSerials.push(Number(record.key.replace(/^[a-z]+/, '')));
      }
      forkSerial = Math.max(...branchSerials);
    }
    serial = Math.min(serial, forkSerial);
    row = await ctx.db.get(row.parent);
  }
  return rows;
}
export const history = query({
  args: { ...idArg, kind: v.string(), before: v.optional(v.number()) },
  handler: async (ctx, { worldId, kind, before }) => {
    if (
      !['event', 'audit', 'plan', 'decision', 'sample', 'land', 'social', 'mission'].includes(kind)
    )
      throw new Error('Invalid history type');
    const output = [];
    for (const item of await lineage(ctx, worldId)) {
      const bound = Math.min(item.cutoff, before ?? Number.MAX_SAFE_INTEGER);
      const rows = await ctx.db
        .query('civilizationRecords')
        .withIndex('world_kind_day', (q) =>
          q.eq('worldId', item.id).eq('kind', kind).lte('day', bound),
        )
        .order('desc')
        .take(100);
      output.push(
        ...rows.filter(
          (record) =>
            record.kind === 'sample' || Number(record.key.replace(/^[a-z]+/, '')) < item.serial,
        ),
      );
    }
    const unique = new Map<string, (typeof output)[number]>();
    for (const r of output) if (!unique.has(r.key)) unique.set(r.key, r);
    const cache: ArchiveCache = new Map();
    const result = [...unique.values()].sort((a, b) => b.day - a.day).slice(0, 100);
    const data: (CivEvent | Audit | Plan | Decision | Sample)[] = [];
    for (const r of result)
      data.push(await recordData<CivEvent | Audit | Plan | Decision | Sample>(ctx, r, cache));
    return data;
  },
});
export const historyPage = query({
  args: {
    ...idArg,
    kind: v.string(),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { worldId, kind, cursor, limit = 50 }) => {
    if (
      !['event', 'audit', 'plan', 'decision', 'sample', 'land', 'social', 'mission'].includes(
        kind,
      ) ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    )
      throw new Error('Invalid history page');
    const token = cursor
      ? (JSON.parse(cursor) as {
          version: number;
          worldId: string;
          kind: string;
          at: number;
          after: HistoryBoundary;
        })
      : null;
    if (
      token &&
      (![1, 2].includes(token.version) ||
        token.worldId !== worldId ||
        token.kind !== kind ||
        !Number.isFinite(token.at) ||
        !Number.isFinite(token.after?.day) ||
        typeof token.after?.key !== 'string')
    )
      throw new Error('Invalid history cursor');
    const at = token?.at ?? Date.now(),
      after = token?.after;
    const sources: Doc<'civilizationRecords'>[][] = [];
    for (const item of await lineage(ctx, worldId)) {
      const bound = Math.min(item.cutoff, after?.day ?? Number.MAX_SAFE_INTEGER);
      if (!item.indexed) {
        // Old recovery points remain readable before the optional index upgrade.
        const candidates: Doc<'civilizationRecords'>[] = [];
        for await (const row of ctx.db
          .query('civilizationRecords')
          .withIndex('world_kind_day', (q) =>
            q.eq('worldId', item.id).eq('kind', kind).lte('day', bound),
          )) {
          if (
            row._creationTime <= at &&
            (kind === 'sample' || historySerial(row.key) < item.serial) &&
            (!after || compareHistory(row, after) > 0)
          )
            candidates.push(row);
        }
        sources.push(mergeHistory([candidates], limit + 1).rows);
        continue;
      }
      const accepted: Doc<'civilizationRecords'>[] = [];
      const read = async (rows: AsyncIterable<Doc<'civilizationRecords'>>) => {
        for await (const row of rows) {
          if (
            row._creationTime > at ||
            (kind !== 'sample' && Number(row.key.replace(/^[a-z]+/, '')) >= item.serial)
          )
            continue;
          accepted.push(row);
          if (accepted.length > limit) break;
        }
      };
      if (after && after.day <= bound) {
        const serial = historySerial(after.key);
        await read(
          ctx.db
            .query('civilizationRecords')
            .withIndex('world_kind_day_serial_key', (q) =>
              q
                .eq('worldId', item.id)
                .eq('kind', kind)
                .eq('day', after.day)
                .eq('serial', serial)
                .lt('key', after.key),
            )
            .order('desc'),
        );
        if (accepted.length <= limit)
          await read(
            ctx.db
              .query('civilizationRecords')
              .withIndex('world_kind_day_serial_key', (q) =>
                q.eq('worldId', item.id).eq('kind', kind).eq('day', after.day).lt('serial', serial),
              )
              .order('desc'),
          );
        if (accepted.length <= limit)
          await read(
            ctx.db
              .query('civilizationRecords')
              .withIndex('world_kind_day_serial_key', (q) =>
                q.eq('worldId', item.id).eq('kind', kind).lt('day', after.day),
              )
              .order('desc'),
          );
      } else
        await read(
          ctx.db
            .query('civilizationRecords')
            .withIndex('world_kind_day_serial_key', (q) =>
              q.eq('worldId', item.id).eq('kind', kind).lte('day', bound),
            )
            .order('desc'),
        );
      sources.push(accepted);
    }
    const { rows, hasMore } = mergeHistory(sources, limit),
      cache: ArchiveCache = new Map();
    const page = [];
    for (const row of rows)
      page.push(await recordData<CivEvent | Audit | Plan | Decision | Sample>(ctx, row, cache));
    const last = rows[rows.length - 1];
    return {
      page,
      cursor:
        hasMore && last
          ? JSON.stringify({
              version: 2,
              worldId,
              kind,
              at,
              after: { day: last.day, key: last.key },
            })
          : null,
    };
  },
});
export const person = query({
  args: { ...idArg, personId: v.string() },
  handler: async (ctx, { worldId, personId }) => {
    const row = await load(ctx, worldId);
    const live = state(row).people.find((p) => p.id === personId);
    if (live) return live;
    for (const item of await lineage(ctx, worldId)) {
      const p = await ctx.db
        .query('civilizationPeople')
        .withIndex('world_person', (q) => q.eq('worldId', item.id).eq('personId', personId))
        .unique();
      if (p && p.day <= item.cutoff) return await recordData<Person>(ctx, p);
    }
    return null;
  },
});
export const plan = query({
  args: { ...idArg, planId: v.string() },
  handler: async (ctx, { worldId, planId }) => {
    if (!/^plan\d+$/.test(planId)) return null;
    for (const item of await lineage(ctx, worldId)) {
      const row = await ctx.db
        .query('civilizationRecords')
        .withIndex('world_key', (q) => q.eq('worldId', item.id).eq('key', planId))
        .unique();
      if (
        row &&
        row.kind === 'plan' &&
        row.day <= item.cutoff &&
        Number(planId.slice(4)) < item.serial
      )
        return await recordData<Plan>(ctx, row);
    }
    return null;
  },
});
export const ancestors = query({
  args: idArg,
  handler: async (ctx, { worldId }) => {
    const people: Person[] = [];
    const cache: ArchiveCache = new Map();
    for (const item of await lineage(ctx, worldId))
      for (const row of await ctx.db
        .query('civilizationPeople')
        .withIndex('world_day', (q) =>
          q.eq('worldId', item.id).lte('day', Math.min(item.cutoff, Number.MAX_SAFE_INTEGER)),
        )
        .order('desc')
        .take(200))
        people.push(await recordData<Person>(ctx, row, cache));
    const unique = new Map(people.map((p) => [p.id, p]));
    return [...unique.values()].slice(0, 200);
  },
});

async function queueAI(ctx: MutationCtx, worldId: Id<'civilizationWorlds'>, w: World) {
  if (!w.running) return;
  if (w.decisions.some((d) => d.status === 'queued')) {
    const row = await load(ctx, worldId);
    if (!row.lease || row.lease.until <= Date.now())
      await ctx.scheduler.runAfter(0, internal.civilizationAI.decide, { worldId });
  }
}
export const tick = internalMutation({
  args: { ...idArg, loop: v.number() },
  handler: async (ctx, { worldId, loop }) => {
    const meta = await ctx.db.get(worldId);
    if (!meta || meta.deleting || !meta.running || meta.loop !== loop) return;
    if (shouldPauseUnobserved(true, meta.observedAt, Date.now())) {
      await pauseUnobserved(ctx, worldId);
      return;
    }
    const row = await loadForUpdate(ctx, worldId),
      w = clone(state(row));
    if (shouldPauseUnobserved(w.running, row.observedAt, Date.now())) {
      await pauseUnobserved(ctx, worldId);
      return;
    }
    // Only the scheduler owns time. It schedules from now; no offline catch-up.
    // Compatibility for an already scheduled pre-upgrade one-second tick.
    if (row.clockAnchor === undefined) heartbeat(w);
    await persist(ctx, row, w);
    await queueAI(ctx, worldId, w);
    if (w.running) await scheduleTick(ctx, worldId, w, loop);
  },
});

/** Observation only renews visibility; it can never resume a paused civilization. */
export const observe = mutation({
  args: { ...idArg, sentAt: v.optional(v.number()) },
  handler: async (ctx, { worldId, sentAt }) => {
    const row = await ctx.db.get(worldId);
    if (!row) throw new Error('World not found');
    const now = Date.now();
    if (sentAt !== undefined && !isFreshRequest(sentAt, now, OBSERVATION_TIMEOUT_MS)) return null;
    if (shouldPauseUnobserved(row.running, row.observedAt, now))
      await pauseUnobserved(ctx, worldId);
    const latest = await ctx.db.get(worldId);
    const sent = Math.min(sentAt ?? now, now);
    const previous =
      latest?.observedAt !== undefined && latest.observedAt <= now + 1000 ? latest.observedAt : 0;
    if (previous < sent - OBSERVATION_HEARTBEAT_MS / 2)
      await ctx.db.patch(worldId, { observedAt: Math.max(previous, sent) });
    return { loop: latest?.loop ?? 0 };
  },
});

async function pauseUnobserved(ctx: MutationCtx, worldId: Id<'civilizationWorlds'>) {
  const row = await loadForUpdate(ctx, worldId),
    w = clone(state(row));
  if (!w.running) return;
  w.running = false;
  await persist(ctx, row, w);
  await ctx.db.patch(worldId, {
    loop: (row.loop ?? 0) + 1,
    lease: undefined,
    pauseReason: 'unobserved',
    observedAt: undefined,
    lastControl: { at: Date.now(), action: 'auto-pause-unobserved' },
  });
}
export const recover = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const row of await ctx.db
      .query('civilizationWorlds')
      .withIndex('running', (q) => q.eq('running', true))
      .take(3)) {
      if (shouldPauseUnobserved(row.running, row.observedAt, Date.now())) {
        await pauseUnobserved(ctx, row._id);
        continue;
      }
      // Restart only stale loops; pending jobs normally survive a backend restart.
      if (row.updated < Date.now() - 20000) {
        const loop = (row.loop ?? 0) + 1;
        await ctx.db.patch(row._id, { loop, updated: Date.now() });
        await ctx.scheduler.runAfter(0, internal.civilization.tick, { worldId: row._id, loop });
      }
    }
  },
});
export const pauseAfterRestart = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const row of await ctx.db
      .query('civilizationWorlds')
      .withIndex('running', (q) => q.eq('running', true))
      .take(3)) {
      const full = await load(ctx, row._id),
        w = clone(state(full));
      w.running = false;
      await persist(ctx, full, w);
      await ctx.db.patch(row._id, {
        loop: (row.loop ?? 0) + 1,
        lease: undefined,
        observedAt: undefined,
        pauseReason: 'unobserved',
        lastControl: { at: Date.now(), action: 'restart-manual-resume-required' },
      });
    }
  },
});
export const pauseBeforeShutdown = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const row of await ctx.db
      .query('civilizationWorlds')
      .withIndex('running', (q) => q.eq('running', true))
      .take(3))
      await pauseUnobserved(ctx, row._id);
  },
});
export const claim = internalMutation({
  args: { ...idArg, token: v.string() },
  handler: async (ctx, { worldId, token }) => {
    const meta = await ctx.db.get(worldId);
    if (!meta || meta.deleting || !meta.running) return null;
    if (shouldPauseUnobserved(true, meta.observedAt, Date.now())) {
      await pauseUnobserved(ctx, worldId);
      return null;
    }
    const row = await load(ctx, worldId);
    if (!row.running) return null;
    if (row.lease && row.lease.until > Date.now()) return null;
    const w = state(row),
      d = w.decisions.find((d) => d.status === 'queued');
    if (!d) return null;
    await ctx.db.patch(worldId, { lease: { token, decisionId: d.id, until: Date.now() + 55000 } });
    return {
      decision: d,
      day: w.day,
      strategy: w.strategy,
      persistence: w.persistence,
      population: alive(w).length,
      stock: w.stock,
      climate: w.climate,
      environment: {
        season: Math.floor(w.day / 90) % 4,
        foodDays: foodDays(w),
        shelterCapacity: shelterCapacity(w),
        storageCapacity: storageCapacity(w),
        naturalFood: w.tiles.filter((t) => t.explored).reduce((s, t) => s + t.food, 0),
        naturalWood: w.tiles.filter((t) => t.explored).reduce((s, t) => s + t.wood, 0),
        knowledge: w.technologies
          .filter((t) => t.discovered !== undefined && t.lost === undefined)
          .map((t) => t.id),
        recentOutcomes: w.plans
          .filter((p) => p.finished !== undefined)
          .slice(-3)
          .map((p) => ({ action: p.action, outcome: p.outcome })),
      },
    };
  },
});
export const finish = internalMutation({
  args: {
    ...idArg,
    token: v.string(),
    decisionId: v.string(),
    revision: v.number(),
    selected: v.string(),
    reason: v.string(),
    reasonEn: v.optional(v.string()),
    suggestedStrategy: v.optional(v.string()),
    attempts: v.number(),
    model: v.string(),
    error: v.optional(v.string()),
    cached: v.optional(v.boolean()),
    source: v.union(v.literal('ollama'), v.literal('rules')),
  },
  handler: async (ctx, args) => {
    const meta = await ctx.db.get(args.worldId);
    if (!meta || meta.deleting || !meta.running) return false;
    if (shouldPauseUnobserved(true, meta.observedAt, Date.now())) {
      await pauseUnobserved(ctx, args.worldId);
      return false;
    }
    const row = await load(ctx, args.worldId),
      w = clone(state(row));
    if (!w.running || row.lease?.token !== args.token) return false;
    await ctx.db.patch(row._id, { lease: undefined });
    const d = w.decisions.find((d) => d.id === args.decisionId);
    if (!d || d.status !== 'queued' || w.revision !== args.revision) return false;
    d.attempts = args.attempts;
    d.model = args.model;
    d.cached = args.cached ?? false;
    if (args.error) d.error = args.error;
    resolveDecision(
      w,
      d.id,
      args.selected as Action,
      args.source,
      pair(args.reason, args.reasonEn ?? args.reason),
      args.suggestedStrategy as StrategyId | undefined,
    );
    await persist(ctx, row, w);
    return true;
  },
});
export const modelConfig = internalQuery({
  args: {},
  handler: () => ({
    host: process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434',
    model: process.env.OLLAMA_MODEL ?? 'qwen3.5:4b',
  }),
});

export const cachedChoice = internalQuery({
  args: { key: v.number(), context: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query('civilizationAICache')
      .withIndex('key', (q) => q.eq('key', args.key))
      .take(5);
    return (
      rows.find((row) => row.context === args.context && row.expires > Date.now())?.choice ?? null
    );
  },
});
export const cacheChoice = internalMutation({
  args: { key: v.number(), context: v.string(), choice: v.string() },
  handler: async (ctx, args) => {
    if (args.context.length > 30000 || args.choice.length > 4000) return;
    const existing = (
      await ctx.db
        .query('civilizationAICache')
        .withIndex('key', (q) => q.eq('key', args.key))
        .take(5)
    ).find((row) => row.context === args.context);
    if (existing)
      await ctx.db.patch(existing._id, { choice: args.choice, expires: Date.now() + 86400000 });
    else await ctx.db.insert('civilizationAICache', { ...args, expires: Date.now() + 86400000 });
    // Bound cache storage without affecting durable decision records.
    const rows = await ctx.db.query('civilizationAICache').order('asc').take(1001);
    for (const row of rows.slice(0, Math.max(0, rows.length - 1000))) await ctx.db.delete(row._id);
  },
});

/** Developer verification only: advance using the real rules, explicitly no model inference. */
export const ruleExperiment = internalMutation({
  args: { ...idArg, days: v.number() },
  handler: async (ctx, { worldId, days }) => {
    if (!Number.isInteger(days) || days < 1 || days > 180)
      throw new Error('Experiment batches are limited to 180 daily steps');
    const row = await load(ctx, worldId),
      w = clone(state(row));
    if (w.running || (row.lease && row.lease.until > Date.now()))
      throw new Error('Pause and finish model work before running a rules experiment');
    const pending = w.decisions.find((d) => d.status === 'queued');
    if (pending)
      resolveDecision(
        w,
        pending.id,
        pending.recommendation,
        'rules',
        pair(
          '开发验收使用规则决策，无模型调用。',
          'Developer verification uses rule decisions, with no model call.',
        ),
      );
    if (w.day === 0)
      event(
        w,
        'experiment',
        pair(
          '此演示使用真实逐日规则与规则决策加速生成，不是大模型长期运行证据。',
          'This demo uses actual daily rules and rule decisions; it is not evidence of long-term LLM operation.',
        ),
        'human',
      );
    advance(w, days, true);
    await persist(ctx, row, w);
    return {
      day: w.day,
      births: w.births,
      deaths: w.deaths,
      population: alive(w).length,
      extinct: !!w.endReason,
    };
  },
});
export const refreshSampleRollup = internalMutation({
  args: idArg,
  handler: async (ctx, { worldId }) => {
    const row = await load(ctx, worldId),
      w = clone(state(row));
    const samples = await ctx.db
      .query('civilizationRecords')
      .withIndex('world_kind_day', (q) => q.eq('worldId', worldId).eq('kind', 'sample'))
      .order('asc')
      .take(10000);
    const cache: ArchiveCache = new Map();
    w.samples = [];
    for (const sample of samples) w.samples.push(await recordData<Sample>(ctx, sample, cache));
    while (w.samples.length > 160)
      w.samples = [
        w.samples[0],
        ...w.samples.slice(1, 81).filter((_, i) => i % 2 === 1),
        ...w.samples.slice(81),
      ];
    await storeWorld(ctx, row, w);
  },
});

/** Upgrade one world atomically, without executing or trimming simulation history. */
export const migrateStorage = internalMutation({
  args: idArg,
  handler: async (ctx, { worldId }) => {
    const row = await load(ctx, worldId);
    if (row.storageVersion === 1) return { migrated: false };
    return { migrated: true, ...(await storeWorld(ctx, row, state(row))) };
  },
});
export const indexHistoryBatch = internalMutation({
  args: { ...idArg, cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { worldId, cursor }) => {
    const world = await ctx.db.get(worldId);
    if (!world || world.deleting || world.running)
      throw new Error('请先暂停有效世界再建立历史索引');
    const result = await ctx.db
      .query('civilizationRecords')
      .withIndex('world_day', (q) => q.eq('worldId', worldId))
      .paginate({ cursor, numItems: 200 });
    let changed = 0;
    for (const record of result.page)
      if (record.serial !== historySerial(record.key)) {
        await ctx.db.patch(record._id, { serial: historySerial(record.key) });
        changed++;
      }
    if (result.isDone) await ctx.db.patch(worldId, { historyIndexVersion: 1 });
    return { changed, cursor: result.isDone ? null : result.continueCursor };
  },
});

export const storageStats = internalQuery({
  args: {},
  handler: async (ctx) =>
    (await ctx.db.query('civilizationWorlds').take(100)).map((row) => ({
      worldId: row._id,
      name: row.name,
      storageVersion: row.storageVersion ?? 0,
      writes: row.storageWrites ?? 0,
      writtenChars: row.storageChars ?? 0,
      running: row.running,
      updated: row.updated,
      onlineMs: row.onlineMs ?? 0,
      pauseReason: row.pauseReason ?? null,
      lastControl: row.lastControl ?? null,
      deleting: row.deleting ?? false,
      historyIndexVersion: row.historyIndexVersion ?? 0,
    })),
});

/** Only the loopback maintenance service calls these after creating a complete backup. */
export const deletionJobs = internalQuery({
  args: {},
  handler: async (ctx) => {
    const pending = await ctx.db
      .query('civilizationDeletionJobs')
      .withIndex('status', (q) => q.eq('status', 'pending'))
      .take(100);
    const recent = await ctx.db
      .query('civilizationDeletionJobs')
      .withIndex('status', (q) => q.eq('status', 'done'))
      .order('desc')
      .take(30);
    return [...pending, ...recent];
  },
});
export const beginDeletion = internalMutation({
  args: {
    ...idArg,
    backup: v.string(),
    backupChecksum: v.optional(v.string()),
    confirmation: v.string(),
    expectedUpdated: v.number(),
    expectedWrites: v.number(),
  },
  handler: async (
    ctx,
    { worldId, backup, backupChecksum, confirmation, expectedUpdated, expectedWrites },
  ) => {
    if (worldId === 'mh7fm2xg8twftrfgzsvkk9bfvh8h1wn4') throw new Error('此世界受保护，不能删除');
    const existing = await ctx.db
      .query('civilizationDeletionJobs')
      .withIndex('world', (q) => q.eq('worldId', worldId))
      .unique();
    if (existing) return existing._id;
    const row = await ctx.db.get(worldId);
    if (!row || confirmation !== row.name || !backup.trim())
      throw new Error('请输入完整世界名，且必须先创建恢复备份');
    if (row.running) throw new Error('请先手动暂停此世界');
    if (row.updated !== expectedUpdated || (row.storageWrites ?? 0) !== expectedWrites)
      throw new Error('备份期间世界或存档有变化，本次未删除，请重新备份重试');
    const children = (await ctx.db.query('civilizationWorlds').take(100)).filter(
      (w) => w.parent === worldId,
    );
    if (children.length)
      throw new Error(
        '仍有分支依赖此世界，请先处理这些分支：' + children.map((w) => w.name).join('、'),
      );
    await ctx.db.patch(worldId, { deleting: true, loop: (row.loop ?? 0) + 1, lease: undefined });
    return ctx.db.insert('civilizationDeletionJobs', {
      worldId,
      name: row.name,
      backup,
      ...(backupChecksum ? { backupChecksum } : {}),
      phase: 0,
      removed: 0,
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});
export const deletionBatch = internalMutation({
  args: { jobId: v.id('civilizationDeletionJobs') },
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get(jobId);
    if (!job) throw new Error('Deletion job not found');
    if (job.status === 'done') return job;
    if (job.worldId === 'mh7fm2xg8twftrfgzsvkk9bfvh8h1wn4') throw new Error('Protected world');
    const row = await ctx.db.get(job.worldId);
    if (!row?.deleting || row.running) throw new Error('Invalid deletion state');
    // Recheck dependencies on every committed batch. A paused job can safely be retried.
    if ((await ctx.db.query('civilizationWorlds').take(100)).some((w) => w.parent === job.worldId))
      throw new Error('World still has dependent branches');
    const phases = [
      'civilizationRecords',
      'civilizationPeople',
      'civilizationSaves',
      'civilizationStateParts',
      'civilizationArchives',
    ] as const;
    let phase = job.phase,
      removed = job.removed;
    if (phase < phases.length) {
      const table = phases[phase];
      const rows =
        table === 'civilizationRecords'
          ? await ctx.db
              .query('civilizationRecords')
              .withIndex('world_day', (q) => q.eq('worldId', job.worldId))
              .take(50)
          : table === 'civilizationPeople'
            ? await ctx.db
                .query('civilizationPeople')
                .withIndex('world_day', (q) => q.eq('worldId', job.worldId))
                .take(50)
            : table === 'civilizationSaves'
              ? await ctx.db
                  .query('civilizationSaves')
                  .withIndex('world', (q) => q.eq('worldId', job.worldId))
                  .take(50)
              : table === 'civilizationStateParts'
                ? await ctx.db
                    .query('civilizationStateParts')
                    .withIndex('world_key', (q) => q.eq('worldId', job.worldId))
                    .take(50)
                : await ctx.db
                    .query('civilizationArchives')
                    .withIndex('world', (q) => q.eq('worldId', job.worldId))
                    .take(50);
      for (const item of rows) await ctx.db.delete(item._id);
      removed += rows.length;
      if (rows.length < 50) phase++;
    } else {
      await ctx.db.delete(job.worldId);
      phase++;
    }
    const next = {
      phase,
      removed,
      status: phase > phases.length ? ('done' as const) : ('pending' as const),
      updatedAt: Date.now(),
    };
    await ctx.db.patch(jobId, { ...next, error: undefined });
    return { ...job, ...next };
  },
});
export const deletionFailure = internalMutation({
  args: { jobId: v.id('civilizationDeletionJobs'), error: v.string() },
  handler: async (ctx, { jobId, error }) => {
    const job = await ctx.db.get(jobId);
    if (job?.status === 'pending')
      await ctx.db.patch(jobId, { error: error.slice(0, 1000), updatedAt: Date.now() });
  },
});

export const migrateSaveStorage = internalMutation({
  args: { saveId: v.id('civilizationSaves') },
  handler: async (ctx, { saveId }) => {
    const row = await ctx.db.get(saveId);
    if (!row) throw new Error('Save not found');
    if ('encoding' in row.state) return { migrated: false };
    const packed = encodeArchive(row.state);
    if (JSON.stringify(decodeArchive(packed)) !== JSON.stringify(row.state))
      throw new Error('Checkpoint verification failed');
    await ctx.db.patch(saveId, { state: packed });
    return {
      migrated: true,
      plainBytes: packed.plainBytes,
      compressedBytes: packed.body.byteLength,
    };
  },
});

const archiveKind = v.union(
  v.literal('event'),
  v.literal('audit'),
  v.literal('plan'),
  v.literal('decision'),
  v.literal('sample'),
  v.literal('land'),
  v.literal('social'),
  v.literal('mission'),
  v.literal('person'),
);

/** Compress a bounded page atomically; keep index stubs for existing history/branch queries. */
export const archiveBatch = internalMutation({
  args: {
    ...idArg,
    kind: archiveKind,
    before: v.number(),
    cursor: v.union(v.string(), v.null()),
    schedule: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    { worldId, kind, before, cursor, schedule },
  ): Promise<{
    done: boolean;
    cursor: string | null;
    records: number;
    plainBytes: number;
    compressedBytes: number;
  }> => {
    const world = await ctx.db.get(worldId);
    if (!world) throw new Error('World not found');
    // The cutoff cannot include the latest 180 simulated days, even for a manual request.
    const cutoff = Math.min(before, (world.state as Pick<World, 'day'>).day - 180);
    const options = { cursor, numItems: 24 };
    const page =
      kind === 'person'
        ? await ctx.db
            .query('civilizationPeople')
            .withIndex('world_day', (q) => q.eq('worldId', worldId).lt('day', cutoff))
            .paginate(options)
        : await ctx.db
            .query('civilizationRecords')
            .withIndex('world_kind_day', (q) =>
              q.eq('worldId', worldId).eq('kind', kind).lt('day', cutoff),
            )
            .paginate(options);
    const rows: (Doc<'civilizationRecords'> | Doc<'civilizationPeople'>)[] = page.page;
    const candidates = rows.filter((row) => canArchive(kind, row.data as unknown));
    let plainBytes = 0,
      compressedBytes = 0,
      records = 0;
    if (candidates.length) {
      const values = Object.fromEntries(
        candidates.map((row) => ['key' in row ? row.key : row.personId, row.data]),
      );
      const packed = encodeArchive(values);
      if (JSON.stringify(decodeArchive(packed)) !== JSON.stringify(values))
        throw new Error('History archive verification failed');
      // Avoid replacing a small record with a larger compressed object plus reference overhead.
      if (packed.body.byteLength + 120 * candidates.length < packed.plainBytes) {
        const archiveId = await ctx.db.insert('civilizationArchives', {
          worldId,
          kind,
          ...packed,
          records: candidates.length,
          createdAt: Date.now(),
        });
        for (const row of candidates) await ctx.db.patch(row._id, { data: undefined, archiveId });
        plainBytes = packed.plainBytes;
        compressedBytes = packed.body.byteLength;
        records = candidates.length;
      }
    }
    if (schedule && !page.isDone)
      await ctx.scheduler.runAfter(0, internal.civilization.archiveBatch, {
        worldId,
        kind,
        before,
        cursor: page.continueCursor,
        schedule,
      });
    return {
      done: page.isDone,
      cursor: page.isDone ? null : page.continueCursor,
      records,
      plainBytes,
      compressedBytes,
    };
  },
});

export const archiveOldHistory = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const row of await ctx.db.query('civilizationWorlds').take(100)) {
      const before = (row.state as Pick<World, 'day'>).day - 180;
      if (before <= 0) continue;
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
      ] as const)
        await ctx.scheduler.runAfter(0, internal.civilization.archiveBatch, {
          worldId: row._id,
          kind,
          before,
          cursor: null,
          schedule: true,
        });
    }
  },
});

export const landProject = mutation({
  args: {
    ...idArg,
    action: v.string(),
    tile: v.number(),
    reason: v.string(),
    cancel: v.optional(v.string()),
    groupId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const row = await loadForUpdate(ctx, args.worldId),
      w = clone(state(row));
    if (args.cancel) cancelLand(w, args.cancel);
    else {
      if (!(args.action in LAND_ACTIONS)) throw Error('Unknown land action');
      proposeLand(w, args.action as LandAction, args.tile, 'human', args.reason, args.groupId);
    }
    await persist(ctx, row, w);
  },
});

export const socialProposal = mutation({
  args: {
    ...idArg,
    groupId: v.string(),
    proposer: v.string(),
    patch: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await loadForUpdate(ctx, args.worldId),
      w = clone(state(row));
    ensureSociety(w);
    proposeRules(
      w,
      args.groupId,
      args.proposer,
      JSON.parse(args.patch) as Partial<SocialRules>,
      args.reason,
      'human',
    );
    await persist(ctx, row, w);
  },
});

export const mission = mutation({
  args: {
    ...idArg,
    kind: v.string(),
    groupId: v.string(),
    target: v.number(),
    targetGroup: v.optional(v.string()),
    people: v.optional(v.array(v.string())),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    if (!['migration', 'envoy', 'trade', 'raid'].includes(args.kind))
      throw Error('Unknown mission');
    const row = await loadForUpdate(ctx, args.worldId),
      w = clone(state(row));
    proposeMission(w, { ...args, kind: args.kind as Mission['kind'] }, true);
    await persist(ctx, row, w);
  },
});
