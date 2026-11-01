import { advanceHours, clone, createWorld, die, ledgerError, propose } from './engine';
import {
  allocateDelivery,
  ensureSociety,
  feedSociety,
  proposeRules,
  reviewSociety,
  workSociety,
} from './society';
import { canPay, pay, publicStock } from './economy';
import { emptyStock, pair } from './model';

const fresh = () => {
  const w = createWorld({ name: 'society', seed: 'society', authority: 'human' });
  ensureSociety(w);
  return w;
};
test('household property blocks communal spending and inheritance transfers without creating stock', () => {
  const w = fresh(),
    g = w.society!.groups[0],
    p = w.people[0],
    child = w.people[1];
  g.rules.property = 'household';
  g.rules.inheritance = 'family';
  g.rules.tax = 0;
  w.stock.wood = 10;
  w.ledger.injected.wood = 10;
  allocateDelivery(w, p, 'wood', 10);
  expect(p.assets!.wood).toBe(7);
  expect(publicStock(w).wood).toBe(3);
  expect(canPay(w, { wood: 5 })).toBe(false);
  expect(pay(w, { wood: 5 })).toBe(false);
  p.children = [child.id];
  delete p.partner;
  die(w, p, pair('test', 'test'));
  expect(child.assets!.wood).toBe(7);
  expect(w.stock.wood).toBe(10);
  for (const error of Object.values(ledgerError(w))) expect(Math.abs(error)).toBeLessThan(1e-7);
});
test('distribution changes actual rations, hunger opportunity and keeps budget exact', () => {
  const w = fresh();
  w.stock.food = 1;
  w.society!.groups[0].rules.distribution = 'effort';
  w.people[0].laborCredit = 5;
  w.people[1].laborCredit = 0;
  const before = w.stock.food,
    rations = feedSociety(w)!;
  expect(rations.get(w.people[0].id)).toBeGreaterThan(rations.get(w.people[1].id)!);
  expect(w.stock.food).toBeCloseTo(0);
  expect(w.ledger.consumed.food).toBeCloseTo(before);
});
test('proposed rule names change nothing until actual on-site votes, labor and cost', () => {
  const w = fresh(),
    g = w.society!.groups[0],
    p = w.people[0];
  const proposal = proposeRules(
    w,
    g.id,
    p.id,
    { property: 'household', tax: 0.2, inheritance: 'family' },
    'verify',
    'human',
  );
  expect(g.rules.property).toBe('common');
  p.x = 11;
  p.y = 8;
  workSociety(w, p, 1 / 24);
  expect(proposal.supporters).toHaveLength(0);
  expect(proposal.progress).toBe(0);
  for (const q of w.people) {
    delete q.motion;
    q.x = g.x;
    q.y = g.y;
    q.values.autonomy = 1;
    q.personality.cooperation = 0.5;
  }
  for (let n = 0; n < 60 && proposal.status === 'discussion'; n++)
    for (const q of w.people) workSociety(w, q, 1 / 24);
  expect(proposal.status).toBe('adopted');
  expect(g.rules.property).toBe('household');
  expect(proposal.spent.food).toBe(1);
  expect(proposal.supporters.length).toBeGreaterThan(0);
  expect(
    w.events.some((e) => e.kind === 'institution' && e.evidence?.before && e.evidence?.after),
  ).toBe(true);
});
test('power concentration can be refused and elapsed days cannot force classes', () => {
  const w = fresh(),
    g = w.society!.groups[0];
  const proposal = proposeRules(
    w,
    g.id,
    w.people[0].id,
    { decision: 'hereditary', migration: 'consent', obligation: 1 },
    'verify',
    'human',
  );
  for (const p of w.people) {
    p.x = g.x;
    p.y = g.y;
    p.values.autonomy = 1;
    p.values.security = 0;
    p.personality.cooperation = 0;
  }
  for (let n = 0; n < 60 && proposal.status === 'discussion'; n++)
    for (const p of w.people) workSociety(w, p, 1 / 24);
  expect(proposal.status).toBe('rejected');
  expect(g.rules.decision).toBe('assembly');
  w.day = 10000;
  reviewSociety(w);
  expect(g.rules.decision).toBe('assembly');
});
test('save/reload preserves property and pending votes with identical future execution', () => {
  const w = fresh(),
    g = w.society!.groups[0];
  proposeRules(w, g.id, w.people[0].id, { tax: 0.1, obligation: 0.2 }, 'verify', 'human');
  advanceHours(w, 120, false);
  const restored = clone(w);
  advanceHours(w, 120, false);
  advanceHours(restored, 120, false);
  expect(restored).toEqual(w);
  for (const error of Object.values(ledgerError(w))) expect(Math.abs(error)).toBeLessThan(1e-7);
  expect(publicStock(w).food).toBeGreaterThanOrEqual(-1e-7);
  expect(w.society!.groups[0].treasury).toEqual(emptyStock());
});
test('a hereditary successor is found from living parent links after the dead leader is archived', () => {
  const w = fresh(),
    g = w.society!.groups[0],
    heir = w.people[3];
  g.rules.decision = 'hereditary';
  g.leader = 'archived-parent';
  heir.parents = ['archived-parent'];
  heir.skills.social = 0;
  reviewSociety(w);
  expect(g.leader).toBe(heir.id);
});
test('mixed mode preserves human authority over direction instead of enacting automatic institutions', () => {
  const w = createWorld({ name: 'mixed', seed: 'mixed', authority: 'mixed', strategy: 'military' });
  w.day = 60;
  w.humanKinds = ['direction', 'crisis'];
  reviewSociety(w);
  expect(w.society!.proposals).toHaveLength(0);
});
test('an independent settlement pays for and receives its actual crafted output', () => {
  const w = fresh(),
    s = w.society!,
    g = {
      ...clone(s.groups[0]),
      id: 'local',
      x: 17,
      y: 8,
      treasury: { food: 30, wood: 20, stone: 20, tools: 0 },
    };
  s.groups.push(g);
  for (const r of ['food', 'wood', 'stone', 'tools'] as const) {
    w.stock[r] += g.treasury[r];
    w.ledger.injected[r] += g.treasury[r];
  }
  for (const p of w.people.slice(0, 6)) {
    p.groupId = g.id;
    p.x = g.x;
    p.y = g.y;
    p.assignment = { day: 0, willing: true };
  }
  w.clock!.hour = 1;
  const plan = propose(
    w,
    'tools',
    'rules',
    pair('verify', 'verify'),
    pair('verify', 'verify'),
    g.id,
  );
  plan.progress = plan.labor - 0.001;
  advanceHours(w, 1, false);
  expect(plan.status).toBe('completed');
  expect(g.treasury.tools).toBe(8);
  expect(g.treasury.wood).toBe(12);
  expect(g.treasury.stone).toBe(12);
  expect(publicStock(w).tools).toBe(0);
  for (const error of Object.values(ledgerError(w))) expect(Math.abs(error)).toBeLessThan(1e-7);
});
