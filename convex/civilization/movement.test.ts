import { createWorld, advanceHours, clone, propose } from './engine';
import { actionHour, move, settleMovement } from './movement';
import { pair } from './model';

describe('reserved physical walking', () => {
  test('each edge stays adjacent, routes around water, commits only at arrival', () => {
    const w = createWorld({ name: 'route', seed: 'route' });
    w.tiles.forEach((t) => {
      t.terrain = 'grass';
    });
    w.tiles[8 * 24 + 13].terrain = 'water';
    const p = w.people[0];
    p.x = 12;
    p.y = 8;
    let travelled = 0;
    while (p.x !== 14 || p.y !== 8) {
      const from = { x: p.x, y: p.y };
      expect(move(w, p, 14, 8)).toBe(false);
      const m = p.motion!;
      expect(Math.abs(m.toX - p.x) + Math.abs(m.toY - p.y)).toBe(1);
      expect(w.tiles[m.toY * 24 + m.toX].terrain).not.toBe('water');
      expect({ x: p.x, y: p.y }).toEqual(from);
      expect(m.start).toBe(actionHour(w));
      settleMovement(w, p);
      expect(p.motion).toBeDefined();
      w.clock!.hour++;
      settleMovement(w, p);
      expect(p.motion).toBeUndefined();
      travelled++;
      if (travelled > 10) throw Error('route never arrives');
    }
    expect(travelled).toBe(4);
    expect(move(w, p, 14, 8)).toBe(true);
  });
  test('in-transit people do not harvest, construct or begin a new remote task', () => {
    const w = createWorld({ name: 'in transit', seed: 'in transit' });
    w.clock!.hour = 1;
    const p = w.people[0];
    p.motion = { fromX: p.x, fromY: p.y, toX: p.x + 1, toY: p.y, start: 1, end: 10 };
    const before = clone(p);
    advanceHours(w, 1, false);
    expect(p).toEqual(before);
    expect(p.lastExecution).toBeUndefined();
  });
  test('cancelling work in transit never teleports or grants labor; save resumes same edge', () => {
    const w = createWorld({ name: 'cancel', seed: 'cancel' });
    w.stock.wood = 100;
    w.stock.stone = 100;
    const plan = propose(w, 'hut', 'human', pair('test', 'test'), pair('test', 'test'));
    advanceHours(w, 1, false);
    plan.status = 'rejected';
    const progress = plan.progress,
      restored = clone(w);
    advanceHours(w, 8, false);
    advanceHours(restored, 8, false);
    expect(w).toEqual(restored);
    expect(plan.progress).toBe(progress);
    expect(w.buildings.some((b) => b.planId === plan.id)).toBe(false);
  });
  test('stale cached path is revalidated and unreachable targets wait without moving', () => {
    const w = createWorld({ name: 'stale', seed: 'stale' });
    const p = w.people[0];
    p.x = 12;
    p.y = 8;
    w.tiles.forEach((t) => {
      t.terrain = 'water';
    });
    w.tiles[p.y * 24 + p.x].terrain = 'grass';
    p.route = { x: 14, y: 8, steps: [14 + 8 * 24] };
    expect(move(w, p, 14, 8)).toBe(false);
    expect(p.motion).toBeUndefined();
    expect(p.x).toBe(12);
  });
});
