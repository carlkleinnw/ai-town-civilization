import { proposeLand } from './land';
import { ensureSociety, proposeRules } from './society';
import { proposeMission } from './missions';
import {
  observe,
  claim,
  finish,
  control,
  get,
  tick,
  save,
  beginDeletion,
  branch,
  landProject,
} from '../civilization';
import { heartbeat } from './clock';
import { createWorld } from './engine';
import { jest } from '@jest/globals';
import type { MutationCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import type { World } from './model';

async function call(
  target: unknown,
  ctx: MutationCtx,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (typeof target !== 'function') throw new Error('Expected registered Convex function');
  const handler: unknown = Reflect.get(target, '_handler');
  if (typeof handler !== 'function') throw new Error('Registered handler unavailable');
  return (await handler(ctx, args)) as unknown;
}
async function read(ctx: MutationCtx, worldId: Id<'civilizationWorlds'>) {
  return (await call(get, ctx, { worldId })) as { state: World; pauseReason: string | null };
}

// Exercise actual handlers, including state packing, at their database boundary.
function setup(running: boolean, observedAt: number, now = 100000) {
  jest.spyOn(Date, 'now').mockReturnValue(now);
  const id = 'world-test' as Id<'civilizationWorlds'>;
  const w = createWorld({ name: 'Pause', seed: 'pause-regression', authority: 'ai' });
  w.running = running;
  const docs = new Map<string, Record<string, unknown>>([
    [
      id,
      {
        _id: id,
        _creationTime: 1,
        name: w.name,
        state: structuredClone(w),
        running,
        updated: now - 40000,
        revision: w.revision,
        loop: 7,
        observedAt,
        lease: { token: 'in-flight', decisionId: 'decision', until: now + 10000 },
      },
    ],
  ]);
  let serial = 0;
  const db = {
    get: (key: string) => Promise.resolve(structuredClone(docs.get(key) ?? null)),
    patch: (key: string, value: Record<string, unknown>) => {
      const next = { ...docs.get(key), ...value };
      for (const field of Object.keys(next)) if (next[field] === undefined) delete next[field];
      docs.set(key, next);
      return Promise.resolve();
    },
    insert: (table: string, value: Record<string, unknown>) => {
      const key = `${table}:${serial++}`;
      docs.set(key, { _id: key, _creationTime: now, ...structuredClone(value) });
      return Promise.resolve(key);
    },
    delete: (key: string) => {
      docs.delete(key);
      return Promise.resolve();
    },
    query: (table: string) => {
      const filters: [string, unknown][] = [];
      const index = {
        eq: (field: string, value: unknown) => {
          filters.push([field, value]);
          return index;
        },
      };
      const query = {
        withIndex: (_name: string, apply: (q: typeof index) => unknown) => {
          apply(index);
          return query;
        },
        collect: () =>
          Promise.resolve(
            [...docs.entries()]
              .filter(
                ([key, value]) =>
                  key.startsWith(table + ':') &&
                  filters.every(([field, match]) => value[field] === match),
              )
              .map(([, value]) => structuredClone(value)),
          ),
        unique: async () => (await query.collect())[0] ?? null,
        take: async (n: number) => (await query.collect()).slice(0, n),
      };
      return query;
    },
  };
  const scheduled = jest.fn();
  const ctx = { db, scheduler: { runAfter: scheduled } } as unknown as MutationCtx;
  return { ctx, id, w, docs, scheduled };
}

afterEach(() => jest.restoreAllMocks());

test('a delayed heartbeat cannot obtain a new thirty-second lease on receipt', async () => {
  const { ctx, id, docs } = setup(true, 80000);
  await call(observe, ctx, { worldId: id, sentAt: 81000 });
  expect(docs.get(id)?.observedAt).toBeLessThanOrEqual(81000);
});

test('observe arriving before tick pauses an expired running world', async () => {
  const { ctx, id, w, docs } = setup(true, 60000);
  await call(observe, ctx, { worldId: id, sentAt: 100000 });
  const stored = await read(ctx, id);
  expect(stored.state).toEqual({ ...w, running: false });
  expect(stored.pauseReason).toBe('unobserved');
  expect(docs.get(id)?.loop).toBe(8);
  expect(docs.get(id)?.lease).toBeUndefined();
});

test('manual pause rejects AI claims and a late result with the old valid token', async () => {
  const { ctx, id, w } = setup(false, 100000);
  expect(await call(claim, ctx, { worldId: id, token: 'new' })).toBeNull();
  expect(
    await call(finish, ctx, {
      worldId: id,
      token: 'in-flight',
      decisionId: 'decision',
      revision: w.revision,
      selected: 'gather',
      reason: 'late',
      attempts: 1,
      model: 'test',
      source: 'rules',
    }),
  ).toBe(false);
  expect((await read(ctx, id)).state).toEqual(w);
});

test('a queued resume cannot override a newer pause even with a fresh loop proof', async () => {
  const { ctx, id, docs, w } = setup(false, 100000);
  docs.get(id)!.lastControl = { at: 99500, action: 'manual-pause' };
  await expect(
    call(control, ctx, { worldId: id, running: true, expectedLoop: 7, requestedAt: 99000 }),
  ).rejects.toThrow();
  expect((await read(ctx, id)).state).toEqual(w);
});

test('batched clock executes the identical five sequential heartbeats and persists exact RNG', async () => {
  const { ctx, id, docs, w } = setup(true, 100000);
  Object.assign(docs.get(id)!, { clockAnchor: 95000, tickSeconds: 5, clockCredited: 0 });
  const expected = structuredClone(w);
  for (let i = 0; i < 5; i++) heartbeat(expected);
  await call(tick, ctx, { worldId: id, loop: 7 });
  expect((await read(ctx, id)).state).toEqual(expected);
  expect(docs.get(id)?.onlineMs).toBe(5000);
});

test('manual pause preserves elapsed partial budget and invalidates the pending batch', async () => {
  const { ctx, id, docs, w } = setup(true, 100000);
  Object.assign(docs.get(id)!, { clockAnchor: 98000, tickSeconds: 5, clockCredited: 0 });
  const expected = structuredClone(w);
  heartbeat(expected);
  heartbeat(expected);
  expected.running = false;
  await call(control, ctx, { worldId: id, running: false });
  expect((await read(ctx, id)).state).toEqual(expected);
  await call(tick, ctx, { worldId: id, loop: 7 });
  expect((await read(ctx, id)).state).toEqual(expected);
});

test('a named save between ticks does not credit the same partial seconds twice', async () => {
  const { ctx, id, docs, w } = setup(true, 100000);
  Object.assign(docs.get(id)!, { clockAnchor: 98000, tickSeconds: 5, clockCredited: 0 });
  await call(save, ctx, { worldId: id, name: 'mid-interval' });
  const expected = structuredClone(w);
  heartbeat(expected);
  heartbeat(expected);
  expect((await read(ctx, id)).state).toEqual(expected);
  await call(control, ctx, { worldId: id, running: false });
  expected.running = false;
  expect((await read(ctx, id)).state).toEqual(expected);
  expect(docs.get(id)?.onlineMs).toBe(2000);
});

test('offline time is not settled when pausing a stale scheduling interval', async () => {
  const { ctx, id, docs, w } = setup(true, 100000);
  Object.assign(docs.get(id)!, { clockAnchor: 10000, tickSeconds: 5, clockCredited: 0 });
  await call(control, ctx, { worldId: id, running: false });
  expect((await read(ctx, id)).state).toEqual({ ...w, running: false });
  expect(docs.get(id)?.onlineMs).toBeUndefined();
});

test('a checkpoint created after the backup marker prevents deletion until a new backup', async () => {
  const { ctx, id, docs, w } = setup(false, 100000);
  const marker = { expectedUpdated: 60000, expectedWrites: 0 };
  await call(save, ctx, { worldId: id, name: 'new checkpoint after export' });
  await expect(
    call(beginDeletion, ctx, {
      worldId: id,
      backup: 'verified.zip',
      confirmation: w.name,
      ...marker,
    }),
  ).rejects.toThrow('备份期间');
  expect(docs.get(id)?.deleting).toBeUndefined();
  await call(beginDeletion, ctx, {
    worldId: id,
    backup: 'new-verified.zip',
    confirmation: w.name,
    expectedUpdated: 100000,
    expectedWrites: 0,
  });
  expect(docs.get(id)?.deleting).toBe(true);
});

test('the final credited hour is saved even when it reaches the exact stop day', async () => {
  const { ctx, id, docs, w, scheduled } = setup(true, 100000);
  w.stopDay = 1;
  w.clock!.hour = 23;
  w.clock!.budget = 0.8;
  docs.get(id)!.state = structuredClone(w);
  Object.assign(docs.get(id)!, { clockAnchor: 99000, tickSeconds: 1, clockCredited: 0 });
  heartbeat(w);
  expect(w.running).toBe(false);
  await call(tick, ctx, { worldId: id, loop: 7 });
  expect((await read(ctx, id)).state).toEqual(w);
  expect(docs.get(id)?.running).toBe(false);
  expect(scheduled).not.toHaveBeenCalled();
});

test('an AI claim arriving after the last observation expires cannot revive the loop', async () => {
  const { ctx, id, w } = setup(true, 60000);
  expect(await call(claim, ctx, { worldId: id, token: 'expired-observer' })).toBeNull();
  expect((await read(ctx, id)).state).toEqual({ ...w, running: false });
});

test('fractional-second pause survives reload and repeated saves cannot double-credit it', async () => {
  const { ctx, id, docs, w } = setup(true, 100000);
  Object.assign(docs.get(id)!, { clockAnchor: 96350, tickSeconds: 5, clockCredited: 0 });
  await call(save, ctx, { worldId: id, name: 'fractional checkpoint' });
  const saved = (await read(ctx, id)).state;
  expect(saved.clock!.budget).toBeCloseTo(0.73, 10);
  await call(control, ctx, { worldId: id, running: false });
  const paused = (await read(ctx, id)).state;
  expect(paused.clock!.budget).toBeCloseTo(0.73, 10);
  expect(paused.day).toBe(w.day);
  expect(docs.get(id)?.onlineMs).toBeCloseTo(3650, 8);
});
test('fractional save at 3.65 seconds followed by the five-second tick credits only five seconds', async () => {
  const { ctx, id, docs, w } = setup(true, 100000);
  Object.assign(docs.get(id)!, { clockAnchor: 96350, tickSeconds: 5, clockCredited: 0 });
  await call(save, ctx, { worldId: id, name: 'fractional checkpoint' });
  jest.spyOn(Date, 'now').mockReturnValue(101350);
  await call(tick, ctx, { worldId: id, loop: 7 });
  expect((await read(ctx, id)).state.clock!.hour).toBe(1);
  expect((await read(ctx, id)).state.clock!.budget).toBeCloseTo(0, 10);
  expect(docs.get(id)?.onlineMs).toBeCloseTo(5000, 8);
  expect((await read(ctx, id)).state.day).toBe(w.day);
});
test('resuming a fractional normal-speed budget schedules the exact next walking boundary', async () => {
  const { ctx, id, docs, w, scheduled } = setup(false, 100000);
  w.clock!.budget = 0.73;
  docs.get(id)!.state = structuredClone(w);
  await call(control, ctx, { worldId: id, running: true, expectedLoop: 7, requestedAt: 100000 });
  expect(scheduled.mock.calls[0][0]).toBeCloseTo(1350, 3);
});

test('branch pins land, social and mission records before the parent changes them', async () => {
  const { ctx, id, docs, w } = setup(false, 100000);
  ensureSociety(w);
  for (const tile of w.tiles) {
    tile.explored = true;
    tile.terrain = 'grass';
  }
  w.tiles[8 * 24 + 14].wood = 100;
  const project = proposeLand(w, 'clear', 8 * 24 + 14, 'human', 'verify');
  const proposal = proposeRules(w, 'group0', w.people[0].id, { tax: 0.1 }, 'verify', 'human');
  for (const p of w.people) {
    p.personality.curiosity = 1;
    p.values.autonomy = 1;
  }
  const mission = proposeMission(w, {
    kind: 'migration',
    groupId: 'group0',
    target: 8 * 24 + 18,
    reason: 'verify',
  });
  docs.get(id)!.state = structuredClone(w);
  const child = await call(branch, ctx, { worldId: id, name: 'pinned child' });
  const copied = [...docs.values()].filter(
    (d) => d.worldId === child && ['land', 'social', 'mission'].includes(String(d.kind)),
  );
  expect(new Set(copied.map((d) => d.key))).toEqual(new Set([project.id, proposal.id, mission.id]));
  await call(landProject, ctx, {
    worldId: id,
    action: 'clear',
    tile: project.tile,
    reason: 'verify',
    cancel: project.id,
  });
  const frozen = copied.find((d) => d.key === project.id)!.data as { status: string };
  expect(frozen.status).toBe('planned');
  const parent = [...docs.values()].find((d) => d.worldId === id && d.key === project.id)!.data as {
    status: string;
  };
  expect(parent.status).toBe('cancelled');
});
