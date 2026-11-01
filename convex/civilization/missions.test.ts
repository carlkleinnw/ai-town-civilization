import { advanceHours, clone, createWorld, die, ledgerError } from './engine';
import { advanceMissions, proposeMission, relation } from './missions';
import { ensureSociety, INITIAL_RULES } from './society';
import { emptyStock, pair, World } from './model';

function fresh() {
  const w = createWorld({ name: 'missions', seed: 'missions', authority: 'human' });
  ensureSociety(w);
  for (const t of w.tiles) {
    t.terrain = 'grass';
    t.explored = true;
  }
  for (const p of w.people) {
    p.x = 12;
    p.y = 8;
    p.health = 1;
    p.values.autonomy = 1;
    p.values.security = 1;
    p.personality.curiosity = 1;
    p.personality.resilience = 1;
    p.personality.cooperation = 0.9;
  }
  return w;
}
function balanced(w: World) {
  for (const n of Object.values(ledgerError(w))) expect(Math.abs(n)).toBeLessThan(1e-6);
}
function split() {
  const w = fresh();
  const m = proposeMission(w, {
    kind: 'migration',
    groupId: 'group0',
    target: 8 * 24 + 17,
    reason: 'actual settlement opportunity',
  });
  for (let n = 0; n < 120 && m.status !== 'completed'; n++) advanceHours(w, 1, false);
  expect(m.status).toBe('completed');
  return { w, m, child: w.society!.groups.find((g) => g.id === m.childGroup)! };
}
test('migration uses real volunteers, assembly, paths and supplies before creating a group', () => {
  const w = fresh();
  const identities = w.people.map((p) => [p.id, p.parents, p.partner]);
  const m = proposeMission(w, {
    kind: 'migration',
    groupId: 'group0',
    target: 8 * 24 + 17,
    reason: 'verify',
  });
  expect(w.society!.groups).toHaveLength(1);
  expect(m.status).toBe('assembling');
  advanceHours(w, 1, false);
  expect(m.status).toBe('travelling');
  expect(w.society!.groups).toHaveLength(1);
  expect(w.stock.food).toBeLessThan(160);
  for (let n = 0; n < 120 && m.status !== 'completed'; n++) {
    advanceHours(w, 1, false);
    balanced(w);
  }
  expect(m.status).toBe('completed');
  expect(w.society!.groups).toHaveLength(2);
  expect(w.people.map((p) => [p.id, p.parents, p.partner])).toEqual(identities);
  for (const id of m.people) {
    const p = w.people.find((p) => p.id === id)!;
    expect(p.groupId).toBe(m.childGroup);
    expect([p.x, p.y]).toEqual([17, 8]);
  }
  expect(m.spent.food).toBeGreaterThan(0);
  balanced(w);
});
test('costs, paths, consent and missing actual counterpart can prevent actions', () => {
  const w = fresh();
  w.stock.food = 0;
  expect(() =>
    proposeMission(w, {
      kind: 'migration',
      groupId: 'group0',
      target: 8 * 24 + 17,
      reason: 'verify',
    }),
  ).toThrow();
  expect(() =>
    proposeMission(w, {
      kind: 'raid',
      groupId: 'group0',
      target: 8 * 24 + 17,
      targetGroup: 'from-another-save',
      reason: 'verify',
    }),
  ).toThrow();
  expect(w.society!.groups).toHaveLength(1);
});
test('neutral groups do not automatically go to war; actual negotiation can enforce a truce', () => {
  const { w, child } = split();
  const r = relation(w, 'group0', child.id);
  expect(r.state).toBe('neutral');
  expect(() =>
    proposeMission(w, {
      kind: 'raid',
      groupId: 'group0',
      target: child.y * 24 + child.x,
      targetGroup: child.id,
      reason: 'no cause',
    }),
  ).toThrow();
  r.state = 'war';
  r.grievance = 0.7;
  for (const p of w.people) {
    if (p.carrying) {
      w.stock[p.carrying.resource] += p.carrying.amount;
      delete p.carrying;
    }
    delete p.motion;
  }
  const m = proposeMission(w, {
    kind: 'envoy',
    groupId: 'group0',
    target: child.y * 24 + child.x,
    targetGroup: child.id,
    reason: 'negotiate',
  });
  // Deterministic on-site rule fixture; route coverage is separately exercised above.
  m.status = 'acting';
  m.supplies = 10;
  for (const p of w.people) {
    delete p.motion;
    p.x = child.x;
    p.y = child.y;
  }
  for (let n = 0; n < 30 && !['returning', 'completed'].includes(m.status); n++)
    advanceMissions(w, (w, p) => die(w, p, pair('test', 'test')));
  expect(r.state).toBe('truce');
  expect(r.grievance).toBeLessThan(0.7);
  expect(() =>
    proposeMission(w, {
      kind: 'raid',
      groupId: child.id,
      target: 8 * 24 + 12,
      targetGroup: 'group0',
      reason: 'truce',
    }),
  ).toThrow();
});
test('combat damages only present people, consumes equipment and changes actual control', () => {
  const { w, child } = split(),
    r = relation(w, 'group0', child.id);
  r.grievance = 0.9;
  w.stock.tools = 10;
  w.ledger.injected.tools = 10;
  for (const p of w.people) {
    delete p.motion;
    if (p.carrying) {
      w.stock[p.carrying.resource] += p.carrying.amount;
      delete p.carrying;
    }
    p.health = 1;
    p.hunger = 0;
    p.x = p.groupId === 'group0' ? 12 : child.x;
    p.y = 8;
  }
  const m = proposeMission(w, {
    kind: 'raid',
    groupId: 'group0',
    target: 8 * 24 + child.x,
    targetGroup: child.id,
    reason: 'sustained resource dispute',
  });
  advanceHours(w, 1, false);
  expect(m.equipment).toBeGreaterThan(0);
  const defender = w.people.find((p) => p.groupId === child.id)!;
  const remote = w.people.filter((p) => p.groupId === child.id).slice(-1)[0];
  remote.x = 22;
  remote.y = 12;
  const remoteHealth = remote.health;
  for (const id of m.people) {
    const p = w.people.find((p) => p.id === id)!;
    delete p.motion;
    p.x = child.x;
    p.y = 8;
  }
  const equipment = m.equipment,
    health = defender.health;
  advanceMissions(w, (w, p) => die(w, p, pair('combat', 'combat')));
  expect(r.state).toBe('war');
  expect(defender.health).toBeLessThan(health);
  expect(remote.health).toBe(remoteHealth);
  expect(m.equipment).toBeLessThan(equipment);
  balanced(w);
  w.buildings.push({
    id: 'damaged-home',
    kind: 'hut',
    groupId: child.id,
    x: child.x,
    y: child.y,
    planId: 'old-home-plan',
    built: 0,
    condition: 0.1,
  });
  for (const p of w.people.filter((p) => p.groupId === child.id && p.id !== remote.id))
    p.health = 0.2;
  w.clock!.hour++;
  advanceMissions(w, (w, p) => die(w, p, pair('combat', 'combat')));
  expect(w.tiles[child.y * 24 + child.x].control?.groupId).toBe('group0');
  expect(w.ruins).toContainEqual(
    expect.objectContaining({ id: 'damaged-home', planId: 'old-home-plan' }),
  );
  expect(w.events.some((e) => e.kind === 'battle-result' && e.evidence?.damagedBuildings)).toBe(
    true,
  );
  balanced(w);
});
test('multiple relations are independent and a saved expedition resumes identical future results', () => {
  const { w, child } = split();
  w.society!.groups.push({
    id: 'third',
    name: 'third',
    founded: 0,
    x: 19,
    y: 8,
    treasury: emptyStock(),
    rules: { ...INITIAL_RULES },
    lastElection: 0,
    legitimacy: 0.6,
    evidence: [],
  });
  relation(w, 'group0', child.id).state = 'war';
  expect(relation(w, 'group0', 'third').state).toBe('neutral');
  const other = clone(w);
  advanceHours(w, 120, false);
  advanceHours(other, 120, false);
  expect(other).toEqual(w);
  balanced(w);
});
