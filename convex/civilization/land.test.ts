import { advanceHours, clone, createWorld, ledgerError } from './engine';
import { cancelLand, landFeasibility, landOf, proposeLand, workLand } from './land';
import { emptyStock } from './model';
import { splitWorld, joinWorld } from './storageCodec';
import { ensureSociety } from './society';

const fresh = () => createWorld({ name: 'land', seed: 'land' });
describe('land work and compatible persistence', () => {
  test('legacy layer read is non-mutating and never mistakes trees for landform', () => {
    const w = fresh(),
      before = clone(w),
      t = w.tiles.find((t) => t.terrain === 'forest')!;
    expect(landOf(t).base).toBe('plain');
    expect(landOf(t).vegetation).toBeGreaterThan(0);
    expect(w).toEqual(before);
  });
  test('no remote clearing; partial work carries actual extracted timber and survives cancellation', () => {
    const w = fresh(),
      tile = w.tiles.findIndex((t) => t.explored && t.terrain === 'forest'),
      t = w.tiles[tile],
      p = w.people[0];
    p.x = 12;
    p.y = 8;
    const project = proposeLand(w, 'clear', tile, 'human', 'verify');
    const wood = t.wood;
    workLand(w, p, 1 / 24);
    expect(t.wood).toBe(wood);
    expect(project.progress).toBe(0);
    delete p.motion;
    delete p.route;
    p.x = t.x;
    p.y = t.y;
    workLand(w, p, 1 / 24);
    expect(t.wood).toBeLessThan(wood);
    expect(project.progress).toBeGreaterThan(0);
    expect(p.carrying!.amount).toBeCloseTo(wood - t.wood);
    expect(w.stock.wood).toBe(0);
    cancelLand(w, project.id);
    const partial = clone(w);
    const packed = splitWorld(w);
    expect(joinWorld(packed.core, packed.parts)).toEqual(w);
    workLand(w, p, 1 / 24);
    expect(w).toEqual(partial);
    expect(landOf(t).base).toBe('plain');
    for (const n of Object.values(ledgerError(w))) expect(Math.abs(n)).toBeLessThan(1e-7);
  });
  test('terraces and leveling require real tools, knowledge, costs and on-site completion', () => {
    const w = fresh(),
      tile = w.tiles.findIndex((t) => t.explored && t.terrain === 'hill'),
      t = w.tiles[tile],
      p = w.people[0];
    expect(landFeasibility(w, 'terrace', tile)).not.toBeNull();
    w.stock = { food: 160, wood: 50, stone: 50, tools: 5 };
    w.ledger.injected = { food: 0, wood: 50, stone: 50, tools: 5 };
    p.known = ['cultivation'];
    p.x = t.x;
    p.y = t.y;
    const project = proposeLand(w, 'terrace', tile, 'rules', 'verify');
    for (let i = 0; i < 4000 && project.status !== 'completed'; i++) workLand(w, p, 1 / 24);
    expect(project.status).toBe('completed');
    expect(project.spent.stone).toBe(8);
    expect(project.spent.tools).toBeCloseTo(0.48);
    expect(landOf(t).base).toBe('hill');
    expect(landOf(t).terraces).toBe(1);
    expect(landOf(t).use).toBe('field');
    expect(w.events.some((e) => e.kind === 'terrain' && e.evidence?.cost)).toBe(true);
    for (const n of Object.values(ledgerError(w))) expect(Math.abs(n)).toBeLessThan(1e-7);
  });
  test('unpaid or blocked projects produce neither progress nor terrain outcomes', () => {
    const w = fresh(),
      tile = w.tiles.findIndex((t) => t.explored && t.terrain === 'grass' && t.wood === 0),
      t = w.tiles[tile],
      p = w.people[0];
    w.stock.tools = 1;
    const project = proposeLand(w, 'road', tile, 'rules', 'verify');
    p.x = t.x;
    p.y = t.y;
    w.stock = emptyStock();
    workLand(w, p, 1 / 24);
    expect(project.progress).toBe(0);
    expect(project.paid).toBe(false);
    expect(landOf(t).use).toBe('wild');
  });
  test('save, reload and forked rule execution preserve modified tiles and pending paths', () => {
    const w = fresh();
    const t = w.tiles.findIndex((t) => t.explored && t.terrain === 'forest');
    proposeLand(w, 'clear', t, 'rules', 'verify');
    advanceHours(w, 240, false);
    const fork = clone(w);
    advanceHours(w, 240, false);
    advanceHours(fork, 240, false);
    expect(fork).toEqual(w);
  });
  test('privately held tools cannot be used or falsely charged by a public project', () => {
    const w = fresh(),
      tile = w.tiles.findIndex((t) => t.explored && t.terrain === 'grass' && t.wood === 0),
      p = w.people[0];
    w.stock.tools = 1;
    w.stock.stone = 10;
    w.stock.wood = 10;
    const project = proposeLand(w, 'road', tile, 'rules', 'verify');
    p.assets = { ...emptyStock(), tools: 1 };
    p.x = w.tiles[tile].x;
    p.y = w.tiles[tile].y;
    workLand(w, p, 1 / 24);
    expect(project.progress).toBe(0);
    expect(project.spent.tools ?? 0).toBe(0);
    expect(w.ledger.consumed.tools).toBe(0);
    expect(p.assets.tools).toBe(1);
  });
  test('an independent group can modify its own plot using only its own tools and materials', () => {
    const w = fresh(),
      society = ensureSociety(w),
      p = w.people[0];
    const group = {
      ...clone(society.groups[0]),
      id: 'local',
      treasury: { food: 0, wood: 10, stone: 10, tools: 1 },
    };
    society.groups.push(group);
    p.groupId = group.id;
    w.stock.wood = w.ledger.injected.wood = 10;
    w.stock.stone = w.ledger.injected.stone = 10;
    w.stock.tools = w.ledger.injected.tools = 1;
    const tile = w.tiles.findIndex((t) => t.explored && t.terrain === 'grass' && t.wood === 0),
      t = w.tiles[tile];
    t.control = { groupId: group.id, since: 0, cause: 'test' };
    expect(landFeasibility(w, 'road', tile)).not.toBeNull();
    const project = proposeLand(w, 'road', tile, 'human', 'verify own rights', group.id);
    const outsider = w.people[1];
    outsider.x = t.x;
    outsider.y = t.y;
    expect(workLand(w, outsider, 1 / 24)).toBe(false);
    p.x = t.x;
    p.y = t.y;
    workLand(w, p, 1 / 24);
    expect(project.progress).toBeGreaterThan(0);
    expect(group.treasury.wood).toBe(9);
    expect(group.treasury.stone).toBe(7);
    expect(group.treasury.tools).toBeLessThan(1);
    for (const error of Object.values(ledgerError(w))) expect(Math.abs(error)).toBeLessThan(1e-7);
  });
});
