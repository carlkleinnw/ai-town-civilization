import { ACTIONS, STRATEGIES } from './catalog';
import {
  advance,
  changeSettings,
  createDecision,
  createWorld,
  feasible,
  foodDays,
  intervene,
  ledgerError,
  propose,
  resolveDecision,
  shelterCapacity,
} from './engine';
import { World, age, alive, pair } from './model';

const world = (strategy: keyof typeof STRATEGIES = 'survival') =>
  createWorld({ name: 'Test', seed: 'river-2026', strategy });
function run(w: World, days: number) {
  for (let n = 0; n < days && !w.endReason; n += 360) advance(w, Math.min(360, days - n));
  return w;
}
function balanced(w: World) {
  for (const n of Object.values(ledgerError(w))) expect(Math.abs(n)).toBeLessThan(0.000001);
  for (const n of Object.values(w.stock)) expect(n).toBeGreaterThanOrEqual(-1e-8);
}

describe('civilization causal simulation', () => {
  test('seed recreates all initial state with no human buildings', () => {
    expect(world()).toEqual(world());
    expect(world().buildings).toHaveLength(0);
    expect(world().stock.wood).toBe(0);
    expect(new Set(world().people.map((p) => p.id)).size).toBe(12);
  });
  test('resource collection, consumption and construction reconcile over 3 years', () => {
    const w = run(world('agriculture'), 1080);
    balanced(w);
    expect(w.ledger.gathered.food).toBeGreaterThan(0);
    expect(w.ledger.consumed.food).toBeGreaterThan(0);
    expect(w.buildings.length).toBeGreaterThan(0);
    for (const b of w.buildings) {
      const p = w.plans.find((p) => p.id === b.planId)!;
      expect(p.paid).toBe(true);
      expect(p.progress).toBeGreaterThanOrEqual(p.labor);
      expect(p.started).toBeLessThan(p.finished!);
    }
  });
  test('proposing cannot create materials or instantly finish a building', () => {
    const w = world();
    const p = propose(w, 'hut', 'ollama', pair('test', 'test'), pair('test', 'test'));
    expect(p.status).toBe('failed');
    expect(w.buildings).toHaveLength(0);
    expect(w.stock.wood).toBe(0);
    balanced(w);
  });
  test('actual labor and materials are required after an intervention', () => {
    const w = world();
    intervene(w, 'wood', 50, 'test supply');
    w.stock.stone += 10;
    w.ledger.injected.stone += 10;
    const p = propose(w, 'hut', 'human', pair('test', 'test'), pair('test', 'test'));
    expect(p.status).toBe('planned');
    expect(p.humanInfluenced).toBe(true);
    expect(w.humanInterventions).toBe(1);
    expect(w.buildings).toHaveLength(0);
    advance(w, 1);
    expect(p.paid).toBe(true);
    expect(w.stock.wood).toBeLessThan(50);
    expect(w.buildings).toHaveLength(0);
    advance(w, 180);
    expect(w.buildings.some((b) => b.planId === p.id)).toBe(true);
    balanced(w);
  });
  test('locked mode rejects automatic core strategy change', () => {
    const w = world('knowledge');
    const d = createDecision(w)!;
    resolveDecision(w, d.id, d.recommendation, 'ollama', pair('危机', 'crisis'), 'survival');
    expect(w.strategy.id).toBe('knowledge');
    expect(w.events.some((e) => e.kind === 'strategy-conflict')).toBe(true);
    run(w, 1440);
    expect(w.strategy.id).toBe('knowledge');
    expect(w.plans.every((p) => p.strategy === 'knowledge')).toBe(true);
  });
  test('evolving mode can change direction with a recorded reason', () => {
    const w = world('knowledge');
    w.persistence = 'evolving';
    const d = createDecision(w)!;
    resolveDecision(w, d.id, d.recommendation, 'ollama', pair('饥荒', 'famine'), 'survival');
    expect(w.strategy.id).toBe('survival');
    expect(w.audits[0].actor).toBe('ai');
    expect(w.audits[0].reason).toBe('famine');
  });
  test('authority and persistence are independent and user changes are audited', () => {
    for (const authority of ['human', 'ai', 'mixed'] as const)
      for (const persistence of ['locked', 'node', 'evolving'] as const) {
        const w = world();
        changeSettings(w, { authority, persistence }, 'user experiment');
        expect(w.authority).toBe(authority);
        expect(w.persistence).toBe(persistence);
        expect(w.audits).toHaveLength(1);
        const d = createDecision(w)!;
        expect(d.status).toBe(
          authority === 'human' || (authority === 'mixed' && w.humanKinds.includes(d.kind))
            ? 'waiting'
            : 'queued',
        );
      }
  });
  test('model cannot choose an unknown action', () => {
    const w = world();
    const d = createDecision(w)!;
    expect(() =>
      resolveDecision(w, d.id, 'free_city' as typeof d.recommendation, 'ollama', pair('', '')),
    ).toThrow();
    expect(w.buildings).toHaveLength(0);
  });
  test('identical settings and seed replay exactly after save/restore', () => {
    const w = run(world('knowledge'), 400);
    const restored = JSON.parse(JSON.stringify(w)) as World;
    advance(w, 1000);
    advance(restored, 1000);
    expect(restored).toEqual(w);
    balanced(w);
  });
  test('strategies change actual action mixtures across paired initial conditions without guaranteeing a single winner', () => {
    let different = 0;
    for (const seed of ['paired-river-1', 'paired-river-2', 'paired-river-3', 'paired-river-4']) {
      const k = createWorld({ name: 'paired', seed, strategy: 'knowledge' });
      const a = createWorld({ name: 'paired', seed, strategy: 'agriculture' });
      expect(k.tiles).toEqual(a.tiles);
      expect(k.people).toEqual(a.people);
      run(k, 360);
      run(a, 360);
      const mix = (w: World) =>
        ACTIONS.map((action) =>
          w.plans.filter((p) => p.action === action).reduce((n, p) => n + p.progress, 0),
        );
      if (JSON.stringify(mix(k)) !== JSON.stringify(mix(a))) different++;
      balanced(k);
      balanced(a);
    }
    expect(different).toBe(4);
  });
  test('a harsh exhausted world can decline and become extinct under its locked strategy', () => {
    const w = world('knowledge');
    for (const t of w.tiles) {
      t.food = 0;
      t.fertility = 0;
    }
    w.climate = 0.1;
    w.ledger.consumed.food += w.stock.food;
    w.stock.food = 0;
    run(w, 360);
    expect(w.deaths).toBe(12);
    expect(alive(w)).toHaveLength(0);
    expect(w.endReason).not.toBeNull();
    expect(w.strategy.id).toBe('knowledge');
    balanced(w);
  });
  test('births, mortality and inheritance preserve identities over generations', () => {
    const w = run(world('survival'), 360 * 55);
    console.log(
      '55-year actual simulation',
      JSON.stringify({
        day: w.day,
        population: alive(w).length,
        births: w.births,
        deaths: w.deaths,
        buildings: w.buildings.length,
        generations: Math.max(...w.people.map((p) => p.generation)) + 1,
      }),
    );
    expect(w.births).toBeGreaterThan(0);
    expect(w.deaths).toBeGreaterThan(0);
    expect(w.people.some((p) => p.generation >= 1 && age(p, w.day) >= 16)).toBe(true);
    expect(w.people.length).toBe(12 + w.births);
    expect(alive(w).length).toBe(12 + w.births - w.deaths);
    for (const p of w.people.filter((p) => p.parents.length))
      for (const id of p.parents)
        expect(w.people.find((parent) => parent.id === id)?.children).toContain(p.id);
    balanced(w);
  }, 120000);
  test('capacity, illness, food and shelter gate childbirth', () => {
    const w = world();
    expect(shelterCapacity(w)).toBe(0);
    advance(w, 90);
    expect(w.people.length).toBeLessThanOrEqual(w.populationCap);
    expect(w.people.every((p) => p.generation === 0)).toBe(true);
  });
  test('custom weights validate and influence feasible actions without output bonuses', () => {
    const w = world();
    const custom = structuredClone(STRATEGIES.knowledge);
    custom.id = 'custom';
    custom.name = pair('观察者', 'Observers');
    changeSettings(w, { strategy: custom }, 'custom experiment');
    expect(w.strategy.id).toBe('custom');
    custom.weights.research = Infinity;
    expect(() => changeSettings(w, { strategy: custom }, 'bad')).toThrow();
    expect(ACTIONS.every((a) => typeof feasible(w, a) === 'boolean')).toBe(true);
  });
  test('observation limit stops on exact day and never uses wall time', () => {
    const w = world();
    w.stopDay = 20;
    advance(w, 100);
    expect(w.day).toBe(20);
    expect(w.running).toBe(false);
    expect(w.onlinePolicy).toBe('no-catch-up');
    expect(foodDays(w)).toBeGreaterThanOrEqual(0);
  });
  test('annual direction nodes do not require an exact year-boundary tick', () => {
    const w = world('knowledge');
    w.day = 361;
    w.lastDecision = 271;
    w.persistence = 'node';
    const d = createDecision(w)!;
    expect(d.kind).toBe('direction');
    resolveDecision(
      w,
      d.id,
      d.recommendation,
      'ollama',
      pair('年度调整', 'Annual adjustment'),
      'survival',
    );
    expect(w.strategy.id).toBe('survival');
    expect(w.audits[0].actor).toBe('ai');
  });
  test('children learn from living family instead of inheriting technology at birth', () => {
    const w = world();
    const child = w.people[2];
    child.born = -6 * 360;
    child.parents = [w.people[0].id];
    child.known = [];
    w.people[0].known = ['observation'];
    w.technologies[0].discovered = 0;
    expect(child.known).toHaveLength(0);
    advance(w, 300);
    expect(child.known).toContain('observation');
    expect(w.events.some((e) => e.kind === 'inheritance')).toBe(true);
    expect(child.memories.some((m) => m.important && m.text.en.includes('Learned'))).toBe(true);
  });
});
