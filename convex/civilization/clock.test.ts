import { DEFAULT_SECONDS_PER_DAY, ensureClock, heartbeat, MAX_HOURS_PER_TICK } from './clock';
import { advanceHours, clone, createWorld, era, ledgerError, propose } from './engine';
import { pair } from './model';

const fresh = () =>
  createWorld({ name: 'Clock verification', seed: 'river-2026', authority: 'human' });
describe('authoritative hourly clock', () => {
  test('restoration improves the actual work tile and preserves a coordinate receipt', () => {
    const w = fresh();
    const tile = w.tiles.find((t) => t.explored && t.terrain === 'forest')!;
    tile.fertility = 0.05;
    const plan = propose(w, 'restore', 'human', pair('verify', 'verify'), pair('verify', 'verify'));
    expect([plan.x, plan.y]).toEqual([tile.x, tile.y]);
    for (const p of w.people) {
      p.x = tile.x;
      p.y = tile.y;
      p.assignment = { day: 0, willing: true };
    }
    const other = w.tiles.find((t) => t.explored && t.terrain === 'grass')!;
    const old = other.fertility;
    plan.progress = plan.labor - 0.001;
    advanceHours(w, 1, false);
    expect(plan.status).toBe('completed');
    expect(tile.lastRestored?.planId).toBe(plan.id);
    expect(tile.lastRestored!.fertilityAfter - tile.lastRestored!.fertilityBefore).toBeCloseTo(0.2);
    expect(other.fertility - old).toBeLessThan(0.01);
    expect(plan.outcome!.en).toContain(`(${tile.x}, ${tile.y})`);
  });
  test('extraction receipts and deliveries match resource deltas without adding stock twice', () => {
    const w = fresh();
    let extraction = false,
      delivery = false;
    for (let i = 0; i < 24 * 8; i++) {
      const before = clone(w);
      advanceHours(w, 1, false);
      for (const p of w.people) {
        const r = p.lastExecution;
        if (!r || r.day !== w.day || r.hour !== w.clock!.hour) continue;
        if (r.kind === 'harvest') {
          extraction = true;
          expect(r.amount).toBeGreaterThan(0);
          expect(p.carrying?.resource).toBe(r.resource);
          const tile = w.tiles[r.y * 24 + r.x];
          // Several residents may harvest the same tile in this phase.
          // Daily natural regrowth occurs at hour zero before this hour's extraction.
          if (w.day === before.day && before.clock!.hour !== 0)
            expect(before.tiles[r.y * 24 + r.x][r.resource as 'food']).toBeGreaterThan(
              tile[r.resource as 'food'],
            );
          // Other residents can harvest a different resource here later in the same hour.
          if (tile.lastHarvest?.personId === p.id)
            expect(tile.lastHarvest.resource).toBe(r.resource);
        }
        if (r.kind === 'delivery') {
          delivery = true;
          const old = before.people.find((o) => o.id === p.id)!;
          expect(r.amount).toBe(old.carrying!.amount);
          expect(p.carrying).toBeUndefined();
          expect(p.task?.phase).toBe('delivered');
        }
      }
      for (const n of Object.values(ledgerError(w))) expect(Math.abs(n)).toBeLessThan(1e-7);
    }
    expect(extraction).toBe(true);
    expect(delivery).toBe(true);
  });
  test('1× is 120 real heartbeats per day and movement has hourly stages', () => {
    const w = fresh();
    for (let i = 0; i < 4; i++) heartbeat(w);
    expect(w.day).toBe(0);
    expect(w.clock!.hour).toBe(0);
    heartbeat(w);
    expect(w.clock!.hour).toBe(1);
    expect(w.day).toBe(0);
    expect(w.people.some((p) => p.task)).toBe(true);
    for (let i = 0; i < 115; i++) heartbeat(w);
    expect(w.day).toBe(1);
    expect(w.clock!.hour).toBe(0);
    expect(w.ledger.consumed.food).toBeGreaterThan(0);
  });
  test('multiplier changes only the number of executed hourly rules', () => {
    const normal = fresh(),
      fast = clone(normal);
    for (let i = 0; i < 120; i++) heartbeat(normal);
    fast.speed = 5;
    for (let i = 0; i < 24; i++) heartbeat(fast);
    fast.speed = 1;
    normal.clock!.budget = 0;
    fast.clock!.budget = 0;
    expect(fast).toEqual(normal);
  });
  test('a persisted partial day replays exactly without offline catch-up', () => {
    const w = fresh();
    for (let i = 0; i < 17; i++) heartbeat(w);
    const restored = clone(w);
    for (let i = 0; i < 127; i++) {
      heartbeat(w);
      heartbeat(restored);
    }
    expect(restored).toEqual(w);
    expect(restored.onlinePolicy).toBe('no-catch-up');
  });
  test('old saves gain clock fields without changing identity, dates, histories or inventories', () => {
    const w = fresh();
    delete w.clock;
    const before = clone(w);
    ensureClock(w);
    expect(w.clock!.secondsPerDay).toBe(DEFAULT_SECONDS_PER_DAY);
    delete w.clock;
    expect(w).toEqual(before);
  });
  test('high speed is bounded and executes every credited hour', () => {
    const w = fresh(),
      expected = clone(w);
    w.speed = 3600;
    heartbeat(w);
    advanceHours(expected, MAX_HOURS_PER_TICK, false);
    expect(w.clock!.limited).toBe(true);
    expect(w.day).toBe(3);
    expect(w.stock).toEqual(expected.stock);
    expect(w.people).toEqual(expected.people);
  });
  test('collection stays on a real tile, carried supplies reconcile before delivery', () => {
    const w = fresh();
    advanceHours(w, 12, false);
    expect(w.people.some((p) => p.carrying)).toBe(true);
    expect(w.tiles.some((t) => t.food < 20)).toBe(true);
    for (const n of Object.values(ledgerError(w))) expect(Math.abs(n)).toBeLessThan(1e-7);
    advanceHours(w, 24 * 6, false);
    for (const n of Object.values(ledgerError(w))) expect(Math.abs(n)).toBeLessThan(1e-7);
    expect(w.people.every((p) => w.tiles[p.y * 24 + p.x].terrain !== 'water')).toBe(true);
  });
  test('construction pays materials but cannot turn a proposal into a completed building', () => {
    const w = fresh();
    w.stock.wood = w.ledger.injected.wood = 50;
    w.stock.stone = w.ledger.injected.stone = 20;
    const plan = propose(w, 'hut', 'human', pair('verify', 'verify'), pair('verify', 'verify'));
    advanceHours(w, 1, false);
    expect(plan.paid).toBe(true);
    expect(w.ledger.spent.wood).toBe(24);
    expect(w.buildings).toHaveLength(0);
    expect(plan.progress).toBeLessThan(plan.labor);
    advanceHours(w, 24 * 90, false);
    expect(w.buildings.some((b) => b.planId === plan.id)).toBe(true);
    for (const n of Object.values(ledgerError(w))) expect(Math.abs(n)).toBeLessThan(1e-7);
  });
  test('eras depend on production and organization, never the year', () => {
    const w = fresh();
    w.day = 360000;
    expect(era(w)).toBe('foraging');
    w.buildings.push({
      id: 'home',
      kind: 'hut',
      x: 12,
      y: 8,
      planId: 'test',
      built: w.day,
      condition: 1,
    });
    expect(era(w)).toBe('settlement');
    w.buildings[0].condition = 0;
    expect(era(w)).toBe('foraging');
  });
  test('collapsed buildings and interrupted paid sites keep their plan references', () => {
    const w = fresh();
    w.buildings.push({
      id: 'old-home',
      kind: 'hut',
      x: 12,
      y: 8,
      planId: 'original-plan',
      built: 1,
      condition: 0.000001,
    });
    advanceHours(w, 24, false);
    expect(w.ruins).toContainEqual(
      expect.objectContaining({ id: 'old-home', planId: 'original-plan', built: 1 }),
    );
    const stopped = fresh();
    stopped.stock.wood = 30;
    stopped.stock.stone = 10;
    const plan = propose(
      stopped,
      'hut',
      'human',
      pair('verify', 'verify'),
      pair('verify', 'verify'),
    );
    plan.paid = true;
    plan.status = 'executing';
    stopped.day = 721;
    advanceHours(stopped, 1, false);
    expect(plan.status).toBe('failed');
    expect(stopped.ruins).toContainEqual(expect.objectContaining({ id: plan.id, planId: plan.id }));
  });
  test('a workshop improves on-site crafting labor without granting completed tools', () => {
    const w = fresh();
    w.stock.wood = 20;
    w.stock.stone = 20;
    for (const p of w.people) {
      p.x = 12;
      p.y = 8;
      p.assignment = { day: 0, willing: true };
    }
    const workshop = clone(w);
    workshop.buildings.push({
      id: 'shop',
      kind: 'workshop',
      x: 12,
      y: 8,
      planId: 'shop-plan',
      built: 0,
      condition: 1,
    });
    const a = propose(w, 'tools', 'human', pair('verify', 'verify'), pair('verify', 'verify'));
    const b = propose(
      workshop,
      'tools',
      'human',
      pair('verify', 'verify'),
      pair('verify', 'verify'),
    );
    advanceHours(w, 1, false);
    advanceHours(workshop, 1, false);
    expect(b.progress).toBeCloseTo(a.progress * 1.15);
    expect(workshop.stock.tools).toBe(0);
    expect(workshop.buildings[0].uses).toBeGreaterThan(0);
  });
  test('a collapsed school no longer expands actual teaching capacity', () => {
    const w = fresh();
    for (const p of w.people) {
      p.x = 12;
      p.y = 8;
      p.assignment = { day: 0, willing: true };
    }
    w.people[0].known = ['observation'];
    w.buildings.push({
      id: 'collapsed-school',
      kind: 'school',
      x: 12,
      y: 8,
      planId: 'school-plan',
      built: 0,
      condition: 0,
    });
    const plan = propose(w, 'teach', 'human', pair('verify', 'verify'), pair('verify', 'verify'));
    plan.progress = plan.labor - 0.0001;
    advanceHours(w, 1, false);
    expect(plan.status).toBe('completed');
    expect(w.people.filter((p) => p.known.includes('observation'))).toHaveLength(3);
  });
});
