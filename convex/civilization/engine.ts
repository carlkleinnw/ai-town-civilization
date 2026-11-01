import { advanceMissions, reviewRelations, territorialUse, workMission } from './missions';
import {
  allocateDelivery,
  ensureSociety,
  feedSociety,
  groupOf,
  inheritAssets,
  reviewSociety,
  workSociety,
} from './society';
import {
  autonomousLand,
  ensureLand,
  extractionImpact,
  landOf,
  recoverLand,
  workLand,
} from './land';
import { add, pay, ledgerAdd, canPay, availableStock } from './economy';
export { canPay } from './economy';
import { actionHour, move, settleMovement } from './movement';
import { ACTIONS, RECIPES, STRATEGIES, TECHS } from './catalog';
import {
  Action,
  Authority,
  Decision,
  DecisionKind,
  Pair,
  Person,
  Persistence,
  Plan,
  Resource,
  Strategy,
  StrategyId,
  World,
  adults,
  age,
  alive,
  emptyStock,
  pair,
} from './model';
import { clamp, hashSeed, random } from './random';

export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function uid(w: World, prefix: string) {
  return `${prefix}${w.nextId++}`;
}
export function event(
  w: World,
  kind: string,
  text: Pair,
  actor: 'human' | 'simulation' | 'ollama' | 'rules' = 'simulation',
  people: string[] = [],
) {
  w.events.push({ id: uid(w, 'e'), day: w.day, kind, text, actor, people });
}
function remember(w: World, p: Person, text: Pair, important = false) {
  p.memories.push({ day: w.day, text, important });
  if (p.memories.length > 24) {
    const expendable = p.memories.findIndex((m) => !m.important);
    p.memories.splice(expendable < 0 ? 0 : expendable, 1);
  }
}
function person(w: World, born: number, parents: Person[] = []): Person {
  const id = uid(w, 'p');
  const trait = (key: 'cooperation' | 'curiosity' | 'resilience') =>
    clamp(
      (parents.length
        ? parents.reduce((s, p) => s + p.personality[key], 0) / parents.length
        : 0.5) *
        0.5 +
        random(w) * 0.5,
    );
  const skills = {
    gathering: 0.2 + random(w) * 0.3,
    building: random(w) * 0.4,
    farming: random(w) * 0.25,
    learning: random(w) * 0.4,
    social: random(w) * 0.4,
  };
  const names = ['禾', '岚', '川', '宁', '青', '朔', '棠', '原', '星', '沐', '榆', '溪'];
  const p: Person = {
    id,
    name: `${names[Math.floor(random(w) * names.length)]}·${id.slice(1)}`,
    sex: random(w) < 0.5 ? 'f' : 'm',
    born,
    generation: parents.length ? Math.max(...parents.map((p) => p.generation)) + 1 : 0,
    parents: parents.map((p) => p.id),
    children: [],
    lastBirth: -1000,
    personality: {
      cooperation: trait('cooperation'),
      curiosity: trait('curiosity'),
      resilience: trait('resilience'),
    },
    values: { security: random(w), learning: random(w), autonomy: random(w) },
    interests: [
      random(w) > 0.5 ? 'learning' : 'gathering',
      random(w) > 0.5 ? 'building' : 'social',
    ],
    goal:
      random(w) > 0.5
        ? pair('让家人有安稳生活', 'Build a secure life for family')
        : pair('认识更远的世界', 'Understand the wider world'),
    skills,
    known: [],
    health: 0.85 + random(w) * 0.15,
    hunger: 0,
    fatigue: 0,
    mood: 0.7,
    illness: 0,
    x: parents[0]?.x ?? 10 + Math.floor(random(w) * 4),
    y: parents[0]?.y ?? 6 + Math.floor(random(w) * 4),
    job: born >= 0 ? 'child' : 'gather',
    activity: pair('熟悉环境', 'Getting oriented'),
    relationships: [],
    memories: [],
  };
  if (parents.length) {
    for (const key of Object.keys(skills) as (keyof typeof skills)[])
      p.skills[key] =
        random(w) * 0.08 +
        (parents.reduce((s, parent) => s + parent.skills[key], 0) / parents.length) * 0.1;
    p.health = 0.8;
    // No inherited technology: a child must learn from living people.
  }
  return p;
}

export function createWorld(input: {
  name: string;
  seed: string;
  population?: number;
  strategy?: StrategyId;
  custom?: Strategy;
  authority?: Authority;
  persistence?: Persistence;
  stopDay?: number | null;
}): World {
  const initial = { food: 160, wood: 0, stone: 0, tools: 0 };
  const ledger = {
    initial: { ...initial },
    gathered: emptyStock(),
    produced: emptyStock(),
    consumed: emptyStock(),
    spent: emptyStock(),
    spoiled: emptyStock(),
    injected: emptyStock(),
    tradedIn: emptyStock(),
    tradedOut: emptyStock(),
  };
  const w: World = {
    version: 1,
    name: input.name.slice(0, 60),
    seed: input.seed.slice(0, 80),
    rng: hashSeed(input.seed),
    day: 0,
    nextId: 1,
    revision: 0,
    running: false,
    speed: 1,
    clock: { version: 2, hour: 0, budget: 0, secondsPerDay: 120, limited: false },
    era: 'foraging',
    ruins: [],
    stopDay: input.stopDay ?? null,
    endReason: null,
    authority: input.authority ?? 'ai',
    persistence: input.persistence ?? 'locked',
    humanKinds: ['direction', 'crisis'],
    strategy: clone(
      input.custom ??
        STRATEGIES[input.strategy === 'custom' ? 'survival' : (input.strategy ?? 'survival')],
    ),
    populationCap: 64,
    climate: 1,
    tiles: [],
    people: [],
    stock: { ...initial },
    ledger,
    buildings: [],
    plans: [],
    technologies: TECHS.map((t) => ({ id: t.id, progress: 0, contributors: [] })),
    institutions: [],
    decisions: [],
    events: [],
    audits: [],
    samples: [],
    births: 0,
    deaths: 0,
    lastDecision: -90,
    lastCrisis: -180,
    tradeContacts: 0,
    onlinePolicy: 'no-catch-up',
  };
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 24; x++) {
      const r = random(w);
      const water = x === 3 + Math.floor(Math.sin(y / 3) * 1.5) || (x > 20 && y < 3);
      const terrain = water ? 'water' : r < 0.3 ? 'forest' : r < 0.43 ? 'hill' : 'grass';
      w.tiles.push({
        x,
        y,
        terrain,
        food:
          terrain === 'grass'
            ? 30 + random(w) * 40
            : terrain === 'forest'
              ? 20 + random(w) * 20
              : 0,
        wood: terrain === 'forest' ? 90 + random(w) * 90 : 0,
        stone: terrain === 'hill' ? 120 + random(w) * 80 : 0,
        fertility: 0.6 + random(w) * 0.4,
        explored: x >= 7 && x <= 17 && y >= 3 && y <= 12,
      });
    }
  // Spawn on passable ground with no pre-existing human structures.
  for (let i = 0; i < clamp(Math.floor(input.population ?? 12), 4, 32); i++) {
    const p = person(w, -Math.floor((18 + random(w) * (i < 2 ? 38 : 17)) * 360));
    p.sex = i % 2 === 0 ? 'f' : 'm';
    const t = w.tiles.find((t) => t.x === p.x && t.y === p.y)!;
    t.terrain = 'grass';
    w.people.push(p);
  }
  const founders = alive(w);
  for (let i = 0; i + 1 < founders.length; i += 2) {
    const a = founders[i],
      b = founders[i + 1];
    a.partner = b.id;
    b.partner = a.id;
    a.relationships.push({ person: b.id, affinity: 0.7 });
    b.relationships.push({ person: a.id, affinity: 0.7 });
  }
  event(
    w,
    'origin',
    pair(
      `${founders.length} 位先民来到河谷，携带 160 份食物，没有建筑。`,
      `${founders.length} founders arrive with 160 food and no buildings.`,
    ),
  );
  event(
    w,
    'strategy',
    pair(`确立长期取向：${w.strategy.name.zh}。`, `Direction chosen: ${w.strategy.name.en}.`),
    'human',
  );
  sample(w);
  return w;
}

export const foodNeed = (w: World, groupId?: string) =>
  alive(w)
    .filter((p) => !groupId || p.groupId === groupId)
    .reduce((s, p) => s + (age(p, w.day) < 12 ? 0.4 : 0.7), 0);
export const foodDays = (w: World, groupId?: string) => {
  const food = groupId
    ? availableStock(w, groupId).food +
      alive(w)
        .filter((p) => p.groupId === groupId)
        .reduce((n, p) => n + (p.assets?.food ?? 0), 0)
    : w.stock.food;
  return food / Math.max(0.1, foodNeed(w, groupId));
};
export const shelterCapacity = (w: World, groupId?: string) =>
  w.buildings.filter(
    (b) => b.kind === 'hut' && b.condition > 0 && (!groupId || (b.groupId ?? 'group0') === groupId),
  ).length * 6;
export const storageCapacity = (w: World, groupId?: string) =>
  200 *
    (groupId
      ? 1
      : Math.max(1, w.society?.groups.filter((g) => g.extinct === undefined).length ?? 1)) +
  w.buildings.filter(
    (b) =>
      b.kind === 'granary' && b.condition > 0 && (!groupId || (b.groupId ?? 'group0') === groupId),
  ).length *
    220;
export function hasKnowledge(w: World, id: string, groupId?: string) {
  return alive(w).some(
    (p) => (!groupId || !w.society || p.groupId === groupId) && p.known.includes(id),
  );
}
function site(w: World, action: Action, groupId?: string) {
  const group = w.society?.groups.find((g) => g.id === (groupId ?? 'group0'));
  const centerX = group?.x ?? 12,
    centerY = group?.y ?? 8;
  const occupied = (x: number, y: number) =>
    w.buildings.some((b) => b.x === x && b.y === y && b.condition > 0) ||
    w.plans.some(
      (p) =>
        ['planned', 'executing'].includes(p.status) &&
        RECIPES[p.action].building &&
        p.x === x &&
        p.y === y,
    );
  const facilityKind =
    action === 'teach' ? 'school' : ['tools', 'research'].includes(action) ? 'workshop' : undefined;
  const facility = w.buildings.find(
    (b) =>
      (b.groupId ?? 'group0') === (groupId ?? 'group0') &&
      b.kind === facilityKind &&
      b.condition > 0,
  );
  if (facility) return w.tiles[facility.y * 24 + facility.x];
  const candidates = w.tiles.filter(
    (t) =>
      t.explored &&
      (!t.control || t.control.groupId === (groupId ?? 'group0')) &&
      t.terrain !== 'water' &&
      (action !== 'farm' ||
        ((landOf(t).base === 'plain' || landOf(t).terraces >= 0.99) &&
          t.wood <= 15 &&
          t.fertility > 0.25)) &&
      (!RECIPES[action].building ||
        (!occupied(t.x, t.y) &&
          !w.landProjects?.some(
            (p) => p.tile === t.y * 24 + t.x && !['cancelled', 'completed'].includes(p.status),
          ))),
  );
  if (action === 'restore') return candidates.sort((a, b) => a.fertility - b.fertility)[0];
  return candidates.sort(
    (a, b) =>
      (action === 'farm'
        ? Number(landOf(b).use === 'field') - Number(landOf(a).use === 'field')
        : 0) ||
      Math.abs(a.x - centerX) +
        Math.abs(a.y - centerY) -
        Math.abs(b.x - centerX) -
        Math.abs(b.y - centerY),
  )[0];
}
export function feasible(w: World, action: Action, groupId?: string): boolean {
  const r = RECIPES[action];
  if (!r || !adults(w).length || !canPay(w, r.cost, groupId) || !site(w, action, groupId))
    return false;
  if (r.needs && !hasKnowledge(w, r.needs, groupId ?? w.society?.groups[0]?.id)) return false;
  if (
    w.plans.some(
      (p) =>
        (p.groupId ?? 'group0') === (groupId ?? 'group0') &&
        p.action === action &&
        ['planned', 'executing'].includes(p.status),
    )
  )
    return false;
  if (action === 'trade' && !w.tradeContacts) return false;
  if (
    action === 'teach' &&
    !alive(w).some((p) => p.known.some((k) => alive(w).some((other) => !other.known.includes(k))))
  )
    return false;
  if (
    action === 'research' &&
    w.technologies.every((t) => t.discovered !== undefined && t.lost === undefined)
  )
    return false;
  if (action === 'explore' && w.tiles.every((t) => t.explored)) return false;
  if (['defend', 'council'].includes(action) && w.institutions.includes(action)) return false;
  if (action === 'gather' && !w.tiles.some((t) => t.explored && t.food > 0.1)) return false;
  if (action === 'logging' && !w.tiles.some((t) => t.explored && t.wood > 0.1)) return false;
  if (action === 'quarry' && !w.tiles.some((t) => t.explored && t.stone > 0.1)) return false;
  return true;
}

export function rankedActions(w: World, groupId?: string): Action[] {
  const localGroup = groupId ?? w.society?.groups[0]?.id;
  const supplies = availableStock(w, localGroup);
  const pop = alive(w).filter((p) => !localGroup || p.groupId === localGroup).length,
    days = foodDays(w, localGroup);
  const scored = ACTIONS.filter((a) => feasible(w, a, groupId)).map((a) => {
    let score = w.strategy.weights[a];
    const count = w.buildings.filter(
      (b) =>
        b.kind === a && b.condition > 0 && (!localGroup || (b.groupId ?? 'group0') === localGroup),
    ).length;
    if (RECIPES[a].building) score /= 1 + count * 1.6;
    const achievableReserve = Math.min(
      w.strategy.reserveDays,
      (storageCapacity(w, localGroup) / Math.max(1, foodNeed(w, localGroup))) * 0.55,
    );
    if (a === 'gather') score += days < 5 ? 60 : days < achievableReserve ? 6 : -4;
    if (a === 'hut') score += shelterCapacity(w, localGroup) < pop + 2 ? 8 : -8;
    if (a === 'granary' && supplies.food < storageCapacity(w, localGroup) * 0.65) score -= 3;
    if (a === 'farm') score += Math.max(0, pop * 0.15 - count) * 1.2;
    // Upstream collection follows the preferred actual recipe, never a free bonus.
    if (a === 'logging' || a === 'quarry') {
      const resource = a === 'logging' ? 'wood' : 'stone';
      const need = ACTIONS.filter((x) => !['logging', 'quarry'].includes(x)).reduce(
        (n, x) =>
          Math.max(
            n,
            (RECIPES[x].cost[resource] ?? 0) > supplies[resource] ? w.strategy.weights[x] : 0,
          ),
        0,
      );
      score += need * 0.9;
      if (supplies[resource] > pop * 12) score -= 12;
    }
    if (a === 'tools' && supplies.tools > pop * 0.8) score -= 8;
    if (a === 'restore' && w.tiles.filter((t) => t.explored).every((t) => t.fertility > 0.9))
      score -= 5;
    if (days < 5 && !['gather', 'logging'].includes(a)) score -= 12;
    return { a, score };
  });
  return scored
    .sort((a, b) => b.score - a.score || ACTIONS.indexOf(a.a) - ACTIONS.indexOf(b.a))
    .map((x) => x.a);
}

export function propose(
  w: World,
  action: Action,
  source: Plan['source'],
  reason: Pair,
  trigger: Pair,
  groupId?: string,
): Plan {
  const r = RECIPES[action],
    loc = site(w, action, groupId);
  const p: Plan = {
    id: uid(w, 'plan'),
    ...(groupId ? { groupId } : {}),
    action,
    strategy: w.strategy.id,
    strategyName: { ...w.strategy.name },
    trigger,
    reason,
    status: 'proposed',
    created: w.day,
    cost: { ...r.cost },
    paid: false,
    labor: r.labor,
    progress: 0,
    workers: [],
    x: loc?.x ?? 12,
    y: loc?.y ?? 8,
    expected: r.benefit,
    source,
    humanInfluenced:
      source === 'human' ||
      (w.humanInterventions ?? 0) > 0 ||
      Object.values(w.ledger.injected).some((n) => n > 0),
  };
  w.plans.push(p);
  event(
    w,
    'proposal',
    pair(`提议：${r.name.zh}。${reason.zh}`, `Proposed: ${r.name.en}. ${reason.en}`),
    source === 'human' ? 'human' : source,
  );
  if (!feasible(w, action, groupId)) {
    p.status = 'failed';
    p.finished = w.day;
    p.outcome = pair(
      '资源、知识、地点或人员条件不满足，未支付成本。',
      'Resources, knowledge, site or labor unavailable; no cost paid.',
    );
    event(w, 'failure', p.outcome);
  } else p.status = 'planned';
  return p;
}

export function createDecision(w: World): Decision | null {
  if (w.decisions.some((d) => d.status !== 'resolved')) return null;
  const crisis = foodDays(w) < 6 && w.day - w.lastCrisis >= 90;
  if (!crisis && w.day - w.lastDecision < 90) return null;
  const options = rankedActions(w).slice(0, 5);
  if (!options.length) return null;
  const kind: DecisionKind = crisis
    ? 'crisis'
    : Math.floor(w.day / 360) > Math.floor(Math.max(0, w.lastDecision) / 360)
      ? 'direction'
      : RECIPES[options[0]].building
        ? 'construction'
        : 'discovery';
  const trigger = crisis
    ? pair(
        `食物只够 ${foodDays(w).toFixed(1)} 天，既定取向与生存投入发生冲突。`,
        `Food covers ${foodDays(w).toFixed(1)} days; the chosen direction competes with survival.`,
      )
    : pair(
        `根据人口 ${alive(w).length}、资源与${w.strategy.name.zh}评估下一步。`,
        `Review population ${alive(w).length}, resources and ${w.strategy.name.en}.`,
      );
  const needsHuman =
    w.authority === 'human' || (w.authority === 'mixed' && w.humanKinds.includes(kind));
  const d: Decision = {
    id: uid(w, 'd'),
    day: w.day,
    kind,
    trigger,
    options,
    recommendation: options[0],
    status: needsHuman ? 'waiting' : 'queued',
    attempts: 0,
    revision: w.revision,
  };
  w.decisions.push(d);
  w.lastDecision = w.day;
  if (crisis) w.lastCrisis = w.day;
  event(w, 'decision', trigger, 'rules');
  return d;
}

export function resolveDecision(
  w: World,
  id: string,
  selected: Action,
  source: Plan['source'],
  reason: Pair,
  suggestedStrategy?: StrategyId,
) {
  const d = w.decisions.find((d) => d.id === id);
  if (!d || d.status === 'resolved' || !d.options.includes(selected))
    throw new Error('Decision or action invalid');
  // Core direction can ONLY change automatically in evolving mode.
  if (
    source !== 'human' &&
    suggestedStrategy &&
    suggestedStrategy !== 'custom' &&
    suggestedStrategy !== w.strategy.id
  ) {
    if (
      w.persistence === 'evolving' ||
      (w.persistence === 'node' && ['direction', 'crisis'].includes(d.kind))
    )
      changeSettings(w, { strategy: clone(STRATEGIES[suggestedStrategy]) }, reason.en, 'ai', true);
    else
      event(
        w,
        'strategy-conflict',
        pair(
          'AI 提出改变取向，当前持续方式禁止自动更换；保留原策略。',
          'AI proposed a direction change; current persistence forbids it. Direction retained.',
        ),
        source,
      );
  }
  d.status = 'resolved';
  d.selected = selected;
  d.source = source;
  d.reason = reason;
  propose(w, selected, source, reason, d.trigger);
}

export function changeSettings(
  w: World,
  patch: {
    strategy?: Strategy;
    authority?: Authority;
    persistence?: Persistence;
    humanKinds?: DecisionKind[];
    stopDay?: number | null;
  },
  reason: string,
  actor: 'human' | 'ai' = 'human',
  atNode = false,
) {
  if (!reason.trim()) throw new Error('A reason is required');
  if (
    actor === 'ai' &&
    (!(w.persistence === 'evolving' || (w.persistence === 'node' && atNode)) ||
      patch.authority ||
      patch.persistence)
  )
    throw new Error('AI cannot change these settings');
  const before = JSON.stringify({
    strategy: w.strategy,
    authority: w.authority,
    persistence: w.persistence,
    humanKinds: w.humanKinds,
    stopDay: w.stopDay,
  });
  if (patch.strategy) validateStrategy(patch.strategy);
  Object.assign(w, patch);
  w.revision++;
  w.audits.push({
    id: uid(w, 'a'),
    day: w.day,
    at: '',
    actor,
    reason: reason.slice(0, 500),
    before,
    after: JSON.stringify(patch),
  });
  // Invalidate in-flight decisions. New authority is applied at the next node.
  for (const d of w.decisions)
    if (d.status !== 'resolved') {
      d.status = 'resolved';
      d.source = 'rules';
      d.reason = pair(
        '设置已变更，本节点作废并重新评估。',
        'Settings changed; node invalidated for reassessment.',
      );
    }
  w.lastDecision = w.day - 90;
  event(
    w,
    'settings',
    pair(`设置变更：${reason}`, `Settings changed: ${reason}`),
    actor === 'human' ? 'human' : 'ollama',
  );
}
export function validateStrategy(s: Strategy) {
  if (
    !s ||
    !Object.keys(STRATEGIES).concat('custom').includes(s.id) ||
    !s.name?.zh?.trim() ||
    !s.name?.en?.trim() ||
    !Number.isFinite(s.reserveDays) ||
    s.reserveDays < 1 ||
    s.reserveDays > 90 ||
    !Number.isFinite(s.harvestLimit) ||
    s.harvestLimit < 0.1 ||
    s.harvestLimit > 1 ||
    ACTIONS.some((a) => !Number.isFinite(s.weights[a]) || s.weights[a] < 0 || s.weights[a] > 10)
  )
    throw new Error('Invalid strategy: weights 0–10, reserve 1–90, harvest 0.1–1');
}

export function intervene(
  w: World,
  kind: 'food' | 'wood' | 'rain' | 'drought' | 'policy',
  amount: number,
  reason: string,
  action?: Action,
) {
  if (!reason.trim() || !Number.isFinite(amount) || amount < 0 || amount > 10000)
    throw new Error('Invalid intervention');
  if (kind === 'policy' && (!action || !ACTIONS.includes(action)))
    throw new Error('Invalid policy');
  const before = JSON.stringify({ stock: w.stock, climate: w.climate });
  w.humanInterventions = (w.humanInterventions ?? 0) + 1;
  if (kind === 'food' || kind === 'wood') {
    w.stock[kind] += amount;
    w.ledger.injected[kind] += amount;
  } else if (kind === 'rain') w.climate = clamp(w.climate + amount / 100, 0.1, 1.5);
  else if (kind === 'drought') w.climate = clamp(w.climate - amount / 100, 0.1, 1.5);
  else if (action && ACTIONS.includes(action))
    propose(
      w,
      action,
      'human',
      pair(reason, reason),
      pair(
        '人工强制政策，仍须支付成本与劳动。',
        'Human policy; material and labor costs still apply.',
      ),
    );
  else throw new Error('Invalid policy');
  w.audits.push({
    id: uid(w, 'a'),
    day: w.day,
    at: '',
    actor: 'human',
    reason,
    before,
    after: JSON.stringify({ kind, amount, action: action ?? null }),
  });
  event(
    w,
    'intervention',
    pair(
      `人工干预：${kind} ${amount}；${reason}`,
      `Human intervention: ${kind} ${amount}; ${reason}`,
    ),
    'human',
  );
}

function useBuilding(w: World, id: string, personId: string) {
  const b = w.buildings.find((b) => b.id === id && b.condition > 0);
  if (!b) return;
  b.uses = (b.uses ?? 0) + 1;
  b.lastUsed = w.day;
  b.users = [...new Set([...(b.users ?? []), personId])].slice(-64);
}
function recordExecution(
  w: World,
  p: Person,
  execution: Omit<NonNullable<Person['lastExecution']>, 'day' | 'hour' | 'x' | 'y'>,
) {
  const at = actionHour(w);
  if (execution.kind === 'labor') p.laborCredit = (p.laborCredit ?? 0) + (execution.amount ?? 0);
  p.lastExecution = { day: Math.floor(at / 24), hour: at % 24, x: p.x, y: p.y, ...execution };
}

function haul(w: World, p: Person) {
  const cargo = p.carrying!;
  const home = groupOf(w, p);
  const store = w.buildings.find(
    (b) =>
      (b.groupId ?? 'group0') === (p.groupId ?? 'group0') &&
      b.kind === (cargo.resource === 'food' ? 'granary' : 'workshop') &&
      b.condition > 0,
  );
  p.task = {
    phase: 'hauling',
    x: store?.x ?? home?.x ?? 12,
    y: store?.y ?? home?.y ?? 8,
    ...(store ? { buildingId: store.id } : {}),
  };
  p.activity = pair('搬运物资回储藏点', 'Hauling supplies to storage');
  if (move(w, p, p.task.x, p.task.y)) {
    w.stock[cargo.resource] += cargo.amount;
    allocateDelivery(w, p, cargo.resource, cargo.amount);
    recordExecution(w, p, { kind: 'delivery', resource: cargo.resource, amount: cargo.amount });
    if (store) useBuilding(w, store.id, p.id);
    delete p.carrying;
    p.task.phase = 'delivered';
    p.activity = pair('物资已送达公共储藏点', 'Supplies delivered to collective storage');
  }
}
function collect(w: World, p: Person, resource: 'food' | 'wood' | 'stone', dt = 1) {
  if (dt < 1 && p.carrying && p.carrying.resource !== resource) {
    haul(w, p);
    return 0;
  }
  const targets = w.tiles.filter(
    (t) =>
      t.explored &&
      t.terrain !== 'water' &&
      t[resource] >
        (resource === 'stone'
          ? 0.1
          : resource === 'wood'
            ? (1 - w.strategy.harvestLimit) * 90
            : (1 - w.strategy.harvestLimit) * 20),
  );
  targets.sort(
    (a, b) => Math.abs(a.x - p.x) + Math.abs(a.y - p.y) - Math.abs(b.x - p.x) - Math.abs(b.y - p.y),
  );
  const t = targets[0];
  if (!t) {
    if (p.task) p.task.phase = 'waiting';
    p.activity = pair(
      '没有可持续采收的资源，等待恢复或探索',
      'Waiting for resources to recover or be explored',
    );
    return 0;
  }
  if (p.task) {
    p.task.x = t.x;
    p.task.y = t.y;
  }
  if (!move(w, p, t.x, t.y)) return 0;
  const tool = availableStock(w, p.groupId).tools > 0 ? 1.2 : 1;
  const amount = Math.min(
    t[resource],
    (resource === 'food' ? 3.3 : resource === 'wood' ? 2.4 : 1.8) *
      (0.65 + p.skills.gathering) *
      p.health *
      tool *
      Math.max(0.2, 1 - landOf(t).degradation) *
      dt,
  );
  ensureLand(t);
  t[resource] -= amount;
  extractionImpact(w, t, p, resource, amount);
  territorialUse(w, p, t.y * 24 + t.x, amount);
  if (amount > 0) {
    recordExecution(w, p, {
      kind: 'harvest',
      resource,
      amount,
      ...(p.task?.planId ? { planId: p.task.planId } : {}),
    });
    t.lastHarvest = {
      day: Math.floor(actionHour(w) / 24),
      hour: actionHour(w) % 24,
      personId: p.id,
      resource,
      amount,
    };
  }
  if (dt < 1 && amount > 0) {
    p.carrying = { resource, amount: amount + (p.carrying?.amount ?? 0) };
    ledgerAdd(w, 'gathered', resource, amount);
    if (p.carrying.amount >= 2 || t[resource] < 0.1)
      p.task = {
        phase: 'hauling',
        x: 12,
        y: 8,
        ...(p.task?.planId ? { planId: p.task.planId } : {}),
      };
  } else add(w, resource, amount, 'gathered');
  if (resource === 'wood') t.fertility = clamp(t.fertility - amount * 0.0008);
  p.skills.gathering = clamp(p.skills.gathering + 0.0008 * dt);
  return amount;
}

function complete(w: World, plan: Plan) {
  const action = plan.action,
    r = RECIPES[action];
  plan.status = 'completed';
  plan.finished = w.day;
  let outcome = pair(`${r.name.zh}完成。`, `${r.name.en} completed.`);
  const contributors = plan.workers
    .map((id) => w.people.find((p) => p.id === id))
    .filter((p): p is Person => !!p && p.died === undefined);
  if (r.building) {
    ensureLand(w.tiles[plan.y * 24 + plan.x]).use = action === 'farm' ? 'field' : 'settlement';
    w.buildings.push({
      id: uid(w, 'b'),
      groupId: plan.groupId ?? 'group0',
      kind: action,
      x: plan.x,
      y: plan.y,
      built: w.day,
      condition: 1,
      planId: plan.id,
    });
  } else if (action === 'tools') add(w, 'tools', 8, 'produced', plan.groupId);
  else if (action === 'research') {
    const tech = w.technologies.find((t) => t.discovered === undefined || t.lost !== undefined);
    if (tech && contributors.length) {
      if (random(w) < 0.2) {
        plan.status = 'failed';
        outcome = pair(
          '试验失败，材料和劳动已消耗，未获得新技术。',
          'Experiment failed; materials and labor consumed without discovery.',
        );
      } else {
        tech.progress +=
          1 + contributors.reduce((s, p) => s + p.skills.learning, 0) / contributors.length;
        for (const p of contributors)
          if (!tech.contributors.includes(p.id)) tech.contributors.push(p.id);
        const def = TECHS.find((t) => t.id === tech.id)!;
        outcome = pair(
          `${def.name.zh}积累 ${tech.progress.toFixed(1)}/${def.threshold} 次有效试验。`,
          `${def.name.en}: ${tech.progress.toFixed(1)}/${def.threshold} effective experiments.`,
        );
        if (tech.progress >= def.threshold) {
          tech.discovered = w.day;
          delete tech.lost;
          for (const p of contributors) if (!p.known.includes(tech.id)) p.known.push(tech.id);
          event(
            w,
            'discovery',
            pair(
              `通过实际试验形成知识：${def.name.zh}。`,
              `Knowledge established through experiments: ${def.name.en}.`,
            ),
            'simulation',
            contributors.map((p) => p.id),
          );
        }
      }
    }
  } else if (action === 'teach') {
    let taught = 0;
    for (const teacher of contributors)
      for (const k of teacher.known) {
        const students = alive(w)
          .filter(
            (p) =>
              !p.known.includes(k) &&
              age(p, w.day) >= 5 &&
              (!w.clock || (p.x === plan.x && p.y === plan.y)),
          )
          .slice(0, w.buildings.some((b) => b.kind === 'school' && b.condition > 0) ? 6 : 2);
        for (const p of students) {
          p.known.push(k);
          p.skills.learning = clamp(p.skills.learning + 0.06);
          taught++;
          remember(
            w,
            p,
            pair(`向${teacher.name}学习知识。`, `Learned from ${teacher.name}.`),
            true,
          );
        }
      }
    outcome = pair(
      `完成 ${taught} 次人物知识传授。`,
      `${taught} person-to-person knowledge transfers completed.`,
    );
    if (!taught) {
      plan.status = 'failed';
      outcome = pair(
        '缺少老师或学生，传授未能发生。',
        'No eligible teacher or student; transfer failed.',
      );
    }
  } else if (action === 'explore') {
    const hidden = w.tiles
      .filter((t) => !t.explored)
      .sort(
        (a, b) =>
          Math.abs(a.x - plan.x) +
          Math.abs(a.y - plan.y) -
          Math.abs(b.x - plan.x) -
          Math.abs(b.y - plan.y),
      );
    for (const t of hidden.slice(0, 14)) t.explored = true;
    if (random(w) < 0.2) w.tradeContacts++;
    if (!w.institutions.includes('defend') && random(w) < 0.2 && contributors[0]) {
      contributors[0].health = clamp(contributors[0].health - 0.25);
      outcome = pair(
        '探索揭开新地块，一位探险者受伤。',
        'New land revealed; an explorer was injured.',
      );
    }
  } else if (action === 'trade') {
    // Timber was reserved at start; it leaves the economy rather than disappearing.
    if (random(w) < 0.25) {
      plan.status = 'failed';
      outcome = pair(
        '交换途中失去货物，木材已运出，未换得食物。',
        'Cargo lost in transit; exported timber yielded no food.',
      );
    } else {
      const food = 20 + random(w) * 25;
      add(w, 'food', food, 'tradedIn', plan.groupId);
      outcome = pair(
        `以 15 木材换得 ${food.toFixed(1)} 食物（环境商队）。`,
        `Exchanged 15 timber for ${food.toFixed(1)} food from environmental traders.`,
      );
    }
  } else if (action === 'council' || action === 'defend') {
    const support =
      alive(w).reduce((s, p) => s + p.personality.cooperation * p.mood, 0) /
      Math.max(1, alive(w).length);
    if (support < 0.24 || random(w) > support + 0.45) {
      plan.status = 'failed';
      outcome = pair(
        '讨论后接受不足，组织未能建立。',
        'Insufficient acceptance after discussion; organization failed.',
      );
    } else {
      w.institutions.push(action);
      outcome = pair(
        '群体接受提议，开始执行轮值规则。',
        'The group accepted the proposal and adopted shared duties.',
      );
    }
  } else if (action === 'restore') {
    const t = w.tiles[plan.y * 24 + plan.x];
    if (t && t.terrain !== 'water') {
      const before = t.fertility;
      t.fertility = clamp(t.fertility + 0.2);
      if (t.terrain === 'forest') t.wood += 12;
      ensureLand(t).vegetation = Math.min(1, t.wood / 180);
      t.lastRestored = {
        day: w.day,
        planId: plan.id,
        fertilityBefore: before,
        fertilityAfter: t.fertility,
        woodAdded: t.terrain === 'forest' ? 12 : 0,
      };
      outcome = pair(
        `在 (${t.x}, ${t.y}) 完成休耕与育林，肥力 ${before.toFixed(2)} → ${t.fertility.toFixed(2)}。`,
        `Land restored at (${t.x}, ${t.y}); fertility ${before.toFixed(2)} → ${t.fertility.toFixed(2)}.`,
      );
    }
  }
  plan.outcome = outcome;
  event(
    w,
    plan.status === 'failed' ? 'failure' : 'achievement',
    outcome,
    plan.source === 'human' ? 'human' : 'simulation',
    plan.workers,
  );
  for (const p of contributors) remember(w, p, outcome);
}

export function die(w: World, p: Person, cause: Pair) {
  inheritAssets(w, p);
  delete p.motion;
  delete p.route;
  if (p.carrying) {
    ledgerAdd(w, 'spoiled', p.carrying.resource, p.carrying.amount);
    delete p.carrying;
  }
  p.died = w.day;
  p.cause = cause;
  p.activity = cause;
  w.deaths++;
  event(
    w,
    'death',
    pair(
      `${p.name}去世，享年 ${Math.floor(age(p, w.day))} 岁：${cause.zh}。`,
      `${p.name} died aged ${Math.floor(age(p, w.day))}: ${cause.en}.`,
    ),
    'simulation',
    [p.id],
  );
  for (const relative of alive(w))
    if (
      p.children.includes(relative.id) ||
      p.parents.includes(relative.id) ||
      relative.partner === p.id
    ) {
      relative.mood = clamp(relative.mood - 0.25);
      remember(w, relative, pair(`亲人${p.name}去世。`, `Relative ${p.name} died.`), true);
      if (relative.partner === p.id) delete relative.partner;
    }
}

function demography(w: World) {
  const people = alive(w),
    need = foodNeed(w),
    baselineFed = need ? Math.min(1, w.stock.food / need) : 1;
  const rations = feedSociety(w);
  if (!rations) pay(w, { food: Math.min(w.stock.food, need) }, 'consumed');
  const globalHoused = Math.min(1, shelterCapacity(w) / Math.max(1, people.length));
  for (const p of people) {
    const fed = rations?.get(p.id) ?? baselineFed;
    const housed = p.groupId
      ? Math.min(
          1,
          shelterCapacity(w, p.groupId) /
            Math.max(1, people.filter((q) => q.groupId === p.groupId).length),
        )
      : globalHoused;
    p.hunger = clamp(p.hunger + (1 - fed) * 0.09 - fed * 0.035);
    if (p.illness > 0) {
      p.illness--;
      p.health = clamp(p.health - 0.0025);
    } else if (random(w) < 0.00035 * (2 - housed)) {
      p.illness = 12 + Math.floor(random(w) * 30);
      remember(w, p, pair('经历疾病。', 'Experienced illness.'));
    }
    p.health = clamp(
      p.health +
        (fed > 0.95 && !p.illness ? 0.0011 * (0.5 + housed) : -0.003) -
        p.hunger * 0.013 -
        Math.max(0, age(p, w.day) - 64) * 0.00001,
    );
    p.mood = clamp(p.mood * 0.99 + (fed * 0.55 + housed * 0.25) * 0.01 - p.hunger * 0.005);
    if (p.health <= 0 || p.hunger > 0.95) die(w, p, pair('饥饿或疾病', 'Hunger or illness'));
    else if (age(p, w.day) > 65 + p.personality.resilience * 20 && random(w) < 0.012)
      die(w, p, pair('衰老', 'Old age'));
    if (Math.floor(age(p, w.day) * 360) === 16 * 360) {
      remember(
        w,
        p,
        pair('成年，开始参与生产。', 'Reached adulthood and joined production.'),
        true,
      );
      event(
        w,
        'generation',
        pair(
          `${p.name}成年，第 ${p.generation + 1} 代开始参与劳动。`,
          `${p.name} reached adulthood; generation ${p.generation + 1} joined the workforce.`,
        ),
        'simulation',
        [p.id],
      );
    }
  }
  // Partnership is a rule-based relationship, not an instruction to reproduce.
  if (w.day % 90 === 0) {
    const singles = adults(w).filter((p) => !p.partner && age(p, w.day) < 45);
    for (const p of singles) {
      if (p.partner) continue;
      const mate = singles.find(
        (q) =>
          q.id !== p.id &&
          !q.partner &&
          q.sex !== p.sex &&
          !p.parents.includes(q.id) &&
          !q.parents.includes(p.id) &&
          !p.parents.some((id) => q.parents.includes(id)) &&
          Math.abs(age(q, w.day) - age(p, w.day)) < 18,
      );
      if (mate && random(w) < 0.6) {
        p.partner = mate.id;
        mate.partner = p.id;
        p.relationships.push({ person: mate.id, affinity: 0.5 + random(w) * 0.4 });
        mate.relationships.push({ person: p.id, affinity: 0.65 });
        event(
          w,
          'family',
          pair(`${p.name}与${mate.name}组成家庭。`, `${p.name} and ${mate.name} formed a family.`),
          'simulation',
          [p.id, mate.id],
        );
      }
    }
  }
  for (const mother of alive(w).filter(
    (p) =>
      p.sex === 'f' &&
      age(p, w.day) >= 19 &&
      age(p, w.day) <= 42 &&
      p.partner &&
      p.health > 0.65 &&
      p.mood > 0.4 &&
      w.day - p.lastBirth > 720,
  )) {
    const father = w.people.find((p) => p.id === mother.partner && p.died === undefined);
    const population = alive(w).length;
    if (
      !father ||
      father.health < 0.6 ||
      age(father, w.day) < 18 ||
      foodDays(w, mother.groupId) < 16 ||
      shelterCapacity(w, mother.groupId) <
        alive(w).filter((p) => !mother.groupId || p.groupId === mother.groupId).length + 1 ||
      population >= w.populationCap ||
      random(w) >= 0.0018
    )
      continue;
    const child = person(w, w.day, [mother, father]);
    w.people.push(child);
    w.births++;
    mother.lastBirth = w.day;
    father.lastBirth = w.day;
    mother.health = clamp(mother.health - 0.06);
    mother.children.push(child.id);
    father.children.push(child.id);
    child.groupId = mother.groupId;
    child.relationships = [mother, father].map((p) => ({ person: p.id, affinity: 0.9 }));
    for (const parent of [mother, father])
      remember(w, parent, pair(`孩子${child.name}出生。`, `Child ${child.name} was born.`), true);
    event(
      w,
      'birth',
      pair(
        `${child.name}出生，第 ${child.generation + 1} 代。`,
        `${child.name} was born, generation ${child.generation + 1}.`,
      ),
      'simulation',
      [child.id, mother.id, father.id],
    );
  }
  for (const t of w.technologies)
    if (t.discovered !== undefined && t.lost === undefined && !hasKnowledge(w, t.id)) {
      t.lost = w.day;
      event(
        w,
        'loss',
        pair(
          `最后一位掌握${t.id}的人去世，知识失传。`,
          `The last holder of ${t.id} died; knowledge was lost.`,
        ),
      );
    }
  if (!alive(w).length) {
    w.running = false;
    w.endReason = pair(
      '最后一位居民去世，文明失去延续条件。',
      'The final inhabitant died; civilization cannot continue.',
    );
    event(w, 'extinction', w.endReason);
  }
}

function production(w: World, dt = 1, activePlans?: Plan[]) {
  const phased = dt < 1;
  const people = alive(w),
    active = (activePlans ?? w.plans).filter(
      (p) => p.status === 'planned' || p.status === 'executing',
    );
  for (const p of active) {
    if (p.status === 'planned') {
      if (!pay(w, p.cost, p.action === 'trade' ? 'tradedOut' : 'spent', p.groupId)) {
        p.status = 'failed';
        p.finished = w.day;
        p.outcome = pair(
          '开工时材料不足，计划失败。',
          'Insufficient materials at start; plan failed.',
        );
        event(w, 'failure', p.outcome);
        continue;
      }
      p.paid = true;
      p.status = 'executing';
      p.started = w.day;
      event(
        w,
        'construction',
        pair(
          `${RECIPES[p.action].name.zh}开始，材料已实际扣除。`,
          `${RECIPES[p.action].name.en} started; materials reserved and deducted.`,
        ),
      );
    }
    if (w.day - p.created > 720) {
      p.status = 'failed';
      p.finished = w.day;
      p.outcome = pair(
        '两年内未完成，计划终止，已用材料不退还。',
        'Unfinished after two years; terminated with no material refund.',
      );
      if (RECIPES[p.action].building && p.paid) {
        w.ruins ??= [];
        w.ruins.push({ id: p.id, kind: p.action, x: p.x, y: p.y, day: w.day, planId: p.id });
        w.ruins = w.ruins.slice(-80);
      }
      event(w, 'failure', p.outcome);
    }
  }
  const work = active.filter((p) => p.status === 'executing');
  const farms = w.buildings.filter((b) => b.kind === 'farm' && b.condition > 0);
  for (const farm of farms) {
    if (!phased && farm.cropDay === undefined && pay(w, { food: 3 }, 'spent', farm.groupId)) {
      farm.cropDay = w.day;
      farm.cropLabor = 0;
    }
  }
  const assignments = new Map<string, number>();
  let landAssigned = 0,
    socialAssigned = 0;
  const workerLimit = Math.max(1, Math.ceil(adults(w).length * (foodDays(w) < 7 ? 0.15 : 0.32)));
  for (const p of people) {
    if (phased) {
      settleMovement(w, p);
      if (p.motion) continue; // travelling consumes this interval; no remote work
    }
    if (phased && workMission(w, p, dt)) continue;
    const years = age(p, w.day);
    p.fatigue = clamp(p.fatigue - 0.07 * dt);
    const lesson =
      phased &&
      years >= 5 &&
      p.health > 0.4 &&
      p.hunger < 0.25 &&
      work.find(
        (plan) =>
          plan.action === 'teach' &&
          people.some((teacher) => teacher.known.some((k) => !p.known.includes(k))),
      );
    if (lesson && !p.known.length) {
      p.job = 'teach';
      p.activity = pair('前往课堂学习', 'Attending a lesson');
      p.task = { phase: 'working', x: lesson.x, y: lesson.y, planId: lesson.id };
      if (move(w, p, lesson.x, lesson.y)) {
        p.activity = pair('参与学习', 'Learning');
        recordExecution(w, p, { kind: 'learning', planId: lesson.id });
        const classroom = w.buildings.find(
          (b) => b.kind === 'school' && b.condition > 0 && b.x === lesson.x && b.y === lesson.y,
        );
        if (classroom) {
          p.task.buildingId = classroom.id;
          useBuilding(w, classroom.id, p.id);
        }
      }
      continue;
    }
    if (years < 12) {
      p.job = 'child';
      p.activity = pair('成长与家庭学习', 'Growing and learning with family');
      p.task = { phase: 'family', x: p.x, y: p.y };
      if (years >= 5 && w.day % 60 === 0 && (!phased || w.clock?.hour === 0)) {
        const teacher = people.find(
          (q) => p.parents.includes(q.id) && q.known.some((k) => !p.known.includes(k)),
        );
        const k = teacher?.known.find((k) => !p.known.includes(k));
        if (teacher && k && random(w) < 0.55) {
          p.known.push(k);
          remember(
            w,
            p,
            pair(`从${teacher.name}继承知识。`, `Learned knowledge from ${teacher.name}.`),
            true,
          );
          event(
            w,
            'inheritance',
            pair(`${p.name}从家庭学习${k}。`, `${p.name} learned ${k} from family.`),
            'simulation',
            [p.id, teacher.id],
          );
        }
      }
      continue;
    }
    if (p.health < 0.4 || p.fatigue > 0.78 || p.illness > 0 || years > 74) {
      p.job = 'rest';
      p.activity = pair('休养', 'Resting');
      const home = w.buildings.find(
        (b) =>
          (b.groupId ?? 'group0') === (p.groupId ?? 'group0') &&
          b.kind === 'hut' &&
          b.condition > 0,
      );
      p.task = {
        phase: 'resting',
        x: home?.x ?? 12,
        y: home?.y ?? 8,
        ...(home ? { buildingId: home.id } : {}),
      };
      if (phased) move(w, p, p.task.x, p.task.y);
      if (home && p.x === home.x && p.y === home.y) useBuilding(w, home.id, p.id);
      if (p.x === p.task.x && p.y === p.task.y) recordExecution(w, p, { kind: 'rest' });
      p.fatigue = clamp(p.fatigue - 0.15 * dt);
      continue;
    }
    const willing =
      phased && p.assignment?.day === w.day
        ? p.assignment.willing
        : random(w) <
          0.38 +
            p.personality.cooperation * 0.45 -
            p.values.autonomy * 0.12 +
            (w.institutions.includes('council') ? 0.1 : 0) +
            (groupOf(w, p)?.rules.obligation ?? 0) * 0.12 -
            (p.grievance ?? 0) * 0.15;
    if (phased && p.assignment?.day !== w.day) p.assignment = { day: w.day, willing };
    if (phased && p.carrying && (p.task?.phase === 'hauling' || p.carrying.amount >= 2)) {
      haul(w, p);
      continue;
    }
    if (
      phased &&
      years >= 16 &&
      willing &&
      p.hunger < 0.25 &&
      !p.carrying &&
      socialAssigned < Math.max(1, Math.ceil(adults(w).length / 3)) &&
      workSociety(w, p, dt)
    ) {
      socialAssigned++;
      continue;
    }
    if (
      phased &&
      landAssigned < Math.max(1, Math.floor(adults(w).length / 4)) &&
      years >= 16 &&
      willing &&
      p.hunger < 0.25 &&
      foodDays(w) > 4 &&
      !p.carrying &&
      workLand(w, p, dt)
    ) {
      landAssigned++;
      continue;
    }
    const preference = (plan: Plan) =>
      (p.interests.includes(RECIPES[plan.action].skill) ? 0.8 : 0) +
      (['research', 'teach', 'school'].includes(plan.action)
        ? p.personality.curiosity + p.values.learning
        : ['hut', 'gather', 'farm'].includes(plan.action)
          ? p.values.security + (p.children.length > 0 ? 0.4 : 0)
          : 0);
    const candidates = work
      .filter(
        (plan) =>
          (plan.groupId ?? 'group0') === (p.groupId ?? 'group0') &&
          (assignments.get(plan.id) ?? 0) < workerLimit &&
          (plan.action !== 'teach' || p.known.length > 0),
      )
      .sort(
        (a, b) =>
          Number(b.id === p.task?.planId) - Number(a.id === p.task?.planId) ||
          preference(b) - preference(a),
      );
    const target = years >= 16 && willing ? candidates[0] : undefined;
    if (
      phased &&
      p.carrying &&
      target &&
      !['gather', 'logging', 'quarry'].includes(target.action)
    ) {
      haul(w, p);
      continue;
    }
    if (target && p.hunger < 0.25) {
      assignments.set(target.id, (assignments.get(target.id) ?? 0) + 1);
      p.job = target.action;
      p.activity = RECIPES[target.action].name;
      p.task = { phase: 'working', x: target.x, y: target.y, planId: target.id };
      if (!target.workers.includes(p.id)) target.workers.push(p.id);
      let productive = false;
      if (['gather', 'logging', 'quarry'].includes(target.action))
        productive =
          collect(
            w,
            p,
            target.action === 'gather' ? 'food' : target.action === 'logging' ? 'wood' : 'stone',
            dt,
          ) > 0;
      else if (move(w, p, target.x, target.y)) {
        productive = true;
        const building = w.buildings.find(
          (b) => b.x === target.x && b.y === target.y && b.condition > 0,
        );
        if (building) {
          p.task.buildingId = building.id;
          useBuilding(w, building.id, p.id);
        }
      }
      if (productive) {
        const skill = RECIPES[target.action].skill;
        const labor =
          p.health *
          (0.7 + p.skills[skill]) *
          dt *
          (w.buildings.some(
            (b) => b.kind === 'workshop' && b.condition > 0 && b.x === target.x && b.y === target.y,
          ) && ['tools', 'research'].includes(target.action)
            ? 1.15
            : 1);
        target.progress += labor;
        target.lastLabor = {
          day: Math.floor(actionHour(w) / 24),
          hour: actionHour(w) % 24,
          personId: p.id,
          amount: labor,
        };
        if (!['gather', 'logging', 'quarry'].includes(target.action))
          recordExecution(w, p, { kind: 'labor', planId: target.id, amount: labor });
        p.skills[skill] = clamp(p.skills[skill] + 0.0015 * dt);
        p.fatigue = clamp(p.fatigue + 0.13 * dt);
      }
    } else {
      const farm = farms.find(
        (f) =>
          (f.groupId ?? 'group0') === (p.groupId ?? 'group0') &&
          (f.cropDay === undefined ||
            (f.cropLabor ?? 0) < (w.day - f.cropDay + 1) * 0.65 ||
            w.day - f.cropDay >= 90),
      );
      if (farm && foodDays(w) > 5 && years >= 16 && willing) {
        p.job = 'farm';
        p.activity = pair(
          farm.cropDay === w.day ? '播种与照料' : '照料农田',
          farm.cropDay === w.day ? 'Sowing and tending' : 'Tending crops',
        );
        p.task = { phase: 'working', x: farm.x, y: farm.y, buildingId: farm.id };
        if (move(w, p, farm.x, farm.y)) {
          if (farm.cropDay === undefined) {
            if (!pay(w, { food: 3 }, 'spent', farm.groupId)) {
              p.task.phase = 'waiting';
              p.activity = pair('种子食物不足，等待播种', 'Waiting for seed food before sowing');
              continue;
            }
            farm.cropDay = w.day;
            farm.cropLabor = 0;
            recordExecution(w, p, { kind: 'sowing' });
          }
          useBuilding(w, farm.id, p.id);
          farm.cropLabor = (farm.cropLabor ?? 0) + p.health * (0.7 + p.skills.farming) * dt;
          if (
            p.lastExecution?.kind !== 'sowing' ||
            p.lastExecution.day !== w.day ||
            p.lastExecution.hour !== (w.clock?.hour ?? 0)
          )
            recordExecution(w, p, {
              kind: 'care',
              amount: p.health * (0.7 + p.skills.farming) * dt,
            });
          p.skills.farming = clamp(p.skills.farming + 0.001 * dt);
        }
      } else {
        const personalStock = availableStock(w, p.groupId);
        const localPeople = alive(w).filter((q) => q.groupId === p.groupId);
        const localNeed = localPeople.reduce((n, q) => n + (age(q, w.day) < 12 ? 0.4 : 0.7), 0);
        const localFoodDays = personalStock.food / Math.max(0.1, localNeed);
        const targetReserve = Math.min(
          w.strategy.reserveDays,
          (storageCapacity(w) / Math.max(1, foodNeed(w))) * 0.7,
        );
        const job =
          phased && p.assignment?.job
            ? p.assignment.job
            : localFoodDays < targetReserve || random(w) < 0.65
              ? 'gather'
              : personalStock.wood < 50
                ? 'logging'
                : personalStock.stone < 30
                  ? 'quarry'
                  : 'gather';
        if (phased && p.assignment) p.assignment.job = job;
        p.job = job;
        p.activity = RECIPES[job].name;
        p.task = { phase: 'working', x: p.x, y: p.y };
        collect(w, p, job === 'gather' ? 'food' : job === 'logging' ? 'wood' : 'stone', dt);
      }
      p.fatigue = clamp(p.fatigue + 0.1 * dt);
    }
    const accessibleTools = availableStock(w, p.groupId).tools;
    if (accessibleTools > 0)
      pay(w, { tools: Math.min(accessibleTools, 0.001 * dt) }, 'consumed', p.groupId);
  }
  if (phased)
    advanceMissions(w, (world, p) =>
      die(world, p, pair('实际冲突或外出损耗', 'Combat or expedition loss')),
    );
  for (const p of work) if (p.status === 'executing' && p.progress >= p.labor) complete(w, p);
  const season = Math.floor(w.day / 90) % 4;
  for (const farm of farms)
    if (
      farm.cropDay !== undefined &&
      w.day - farm.cropDay >= 90 &&
      (!phased ||
        people.some((p) => !p.motion && p.job === 'farm' && p.x === farm.x && p.y === farm.y))
    ) {
      const tile = w.tiles[farm.y * 24 + farm.x];
      const amount =
        140 *
        clamp((farm.cropLabor ?? 0) / 35) *
        tile.fertility *
        w.climate *
        (season === 3 ? 0.3 : 1) *
        (hasKnowledge(w, 'cultivation', farm.groupId) ? 1.2 : 1) *
        (landOf(tile).use === 'field' ? 1.1 : 1) *
        (landOf(tile).terraces >= 0.99 ? 1.15 : 1);
      add(w, 'food', amount, 'produced', farm.groupId);
      tile.fertility = clamp(tile.fertility - 0.025, 0.1, 1);
      event(
        w,
        'harvest',
        pair(
          `农田收获 ${amount.toFixed(1)} 食物，投入 ${(farm.cropLabor ?? 0).toFixed(1)} 人日照料。`,
          `Field harvested ${amount.toFixed(1)} food after ${(farm.cropLabor ?? 0).toFixed(1)} labor-days.`,
        ),
      );
      delete farm.cropDay;
      delete farm.cropLabor;
    }
}

export function sample(w: World) {
  const p = alive(w);
  w.samples.push({
    day: w.day,
    population: p.length,
    births: w.births,
    deaths: w.deaths,
    food: w.stock.food,
    health: p.reduce((s, p) => s + p.health, 0) / Math.max(1, p.length),
    buildings: w.buildings.filter((b) => b.condition > 0).length,
    knowledge: w.technologies.filter((t) => t.discovered !== undefined && t.lost === undefined)
      .length,
    wood: w.stock.wood,
    soil: w.tiles.reduce((s, t) => s + t.fertility, 0) / w.tiles.length,
    groups: w.society?.groups.filter((g) => g.extinct === undefined).length ?? 1,
    disputes:
      w.society?.relations.filter((r) => r.grievance >= 0.6 || r.state === 'war').length ?? 0,
    landLabor: w.landLaborTotal ?? 0,
    privateFoodShare:
      w.stock.food > 0 ? alive(w).reduce((n, p) => n + (p.assets?.food ?? 0), 0) / w.stock.food : 0,
  });
}

export const ERAS = {
  foraging: pair('采集群体', 'Foraging society'),
  settlement: pair('定居萌芽', 'Early settlement'),
  agriculture: pair('农耕聚落', 'Agrarian settlement'),
  organized: pair('协作社会', 'Organized society'),
};
export function era(w: World): keyof typeof ERAS {
  const homes = w.buildings.filter((b) => b.kind === 'hut' && b.condition > 0).length;
  const farming =
    hasKnowledge(w, 'cultivation') &&
    w.buildings.some((b) => b.kind === 'farm' && b.condition > 0) &&
    w.ledger.produced.food > 0;
  if (
    farming &&
    hasKnowledge(w, 'storage') &&
    w.institutions.includes('council') &&
    shelterCapacity(w) >= alive(w).length
  )
    return 'organized';
  if (farming && homes > 0) return 'agriculture';
  if (homes > 0 && shelterCapacity(w) >= alive(w).length * 0.5) return 'settlement';
  return 'foraging';
}
function updateEra(w: World) {
  const next = era(w);
  if (w.era && w.era !== next)
    event(
      w,
      'era',
      pair(
        `生产与组织条件变化，进入${ERAS[next].zh}。`,
        `Production and organization changed: ${ERAS[next].en}.`,
      ),
    );
  w.era = next;
}

function beginDay(w: World, autoResolve: boolean) {
  const season = Math.floor(w.day / 90) % 4;
  ensureSociety(w);
  reviewSociety(w);
  reviewRelations(w);
  recoverLand(w);
  autonomousLand(w);
  for (const t of w.tiles) {
    t.food = Math.min(
      t.terrain === 'grass' ? 70 : 40,
      t.food +
        (t.terrain === 'grass' ? 0.32 : t.terrain === 'forest' ? 0.15 : 0) *
          t.fertility *
          w.climate *
          Math.max(0.1, 1 - landOf(t).degradation) *
          (landOf(t).use === 'field' ? 0.2 : 1) *
          (season === 3 ? 0.45 : 1),
    );
    if (!t.land && t.terrain === 'forest') t.wood = Math.min(180, t.wood + 0.018 * w.climate);
    if (w.day % 30 === 0) t.fertility = clamp(t.fertility + 0.001);
  }
  if (w.day % 15 === 0)
    for (const g of w.society?.groups.slice(1) ?? []) {
      if (
        g.extinct !== undefined ||
        w.plans.some((p) => p.groupId === g.id && ['planned', 'executing'].includes(p.status))
      )
        continue;
      const local = rankedActions(w, g.id)[0];
      if (local)
        propose(
          w,
          local,
          'rules',
          pair(
            '聚落成员按现有资源安排日常劳动。',
            'Settlement members schedule work from their own available resources.',
          ),
          pair('自主聚落的日常安排', 'Settlement work'),
          g.id,
        );
    }
  const d = createDecision(w);
  if (d?.status === 'queued' && autoResolve)
    resolveDecision(
      w,
      d.id,
      d.recommendation,
      'rules',
      pair(
        `按${w.strategy.name.zh}选择当前可行行动；规则决策。`,
        `Choose a feasible action for ${w.strategy.name.en}; rule decision.`,
      ),
    );
  // Smaller execution choices continue under the chosen strategy without new prompts.
  const awaiting = w.decisions.some((d) => d.status !== 'resolved');
  if (
    !awaiting &&
    !w.plans.some(
      (p) =>
        (p.groupId ?? 'group0') === 'group0' &&
        (p.status === 'planned' || p.status === 'executing'),
    ) &&
    w.day % 15 === 0
  ) {
    const action = rankedActions(w)[0];
    if (action)
      propose(
        w,
        action,
        'rules',
        pair(
          `持续落实${w.strategy.name.zh}，按资源与个人参与条件安排下一项劳动。`,
          `Continue ${w.strategy.name.en} using available resources and willing workers.`,
        ),
        pair(
          '上一项工作结束，安排日常执行。',
          'Previous work ended; schedule routine implementation.',
        ),
      );
  }
}
function endDay(w: World) {
  demography(w);
  for (const b of w.buildings) {
    const before = b.condition;
    b.condition = clamp(b.condition - 1 / (360 * 45));
    if (before > 0 && b.condition === 0) {
      w.ruins ??= [];
      w.ruins.push({
        id: b.id,
        kind: b.kind,
        x: b.x,
        y: b.y,
        day: w.day,
        planId: b.planId,
        built: b.built,
      });
      w.ruins = w.ruins.slice(-80);
      event(
        w,
        'decay',
        pair(
          `${RECIPES[b.kind].name.zh} ${b.id}（${b.x}, ${b.y}）因长期损耗倒塌。`,
          `${RECIPES[b.kind].name.en} ${b.id} (${b.x}, ${b.y}) collapsed after long-term deterioration.`,
        ),
      );
    }
  }
  const overflow = Math.max(0, w.stock.food - storageCapacity(w));
  const spoil = Math.min(
    w.stock.food,
    overflow +
      Math.max(0, w.stock.food - overflow) *
        (hasKnowledge(w, 'storage')
          ? 0.0004
          : w.buildings.some((b) => b.kind === 'granary' && b.condition > 0)
            ? 0.0008
            : 0.0018),
  );
  const spoilRatio = w.stock.food > 0 ? Math.max(0, 1 - spoil / w.stock.food) : 1;
  for (const p of w.people) if (p.assets) p.assets.food *= spoilRatio;
  for (const g of w.society?.groups ?? []) g.treasury.food *= spoilRatio;
  w.stock.food -= spoil;
  ledgerAdd(w, 'spoiled', 'food', spoil);
  if (w.day % 30 === 0 || w.endReason) sample(w);

  updateEra(w);
}

/** Daily executor is retained for pre-clock archives; current worlds execute every hour. */
export function advance(w: World, days: number, autoResolve = true) {
  if (!Number.isInteger(days) || days < 0 || days > 3600) throw new Error('Invalid day batch');
  if (w.clock) return advanceHours(w, days * 24, autoResolve);
  for (let i = 0; i < days && !w.endReason; i++) {
    if (w.stopDay !== null && w.day >= w.stopDay) {
      w.running = false;
      break;
    }
    w.day++;
    beginDay(w, autoResolve);
    production(w);
    endDay(w);
  }
  return w;
}

export function advanceHours(w: World, hours: number, autoResolve = true) {
  if (!Number.isInteger(hours) || hours < 0 || hours > 86400) throw new Error('Invalid hour batch');
  const clock = w.clock!;
  let activePlans = w.plans.filter((p) => p.status === 'planned' || p.status === 'executing');
  for (let i = 0; i < hours && !w.endReason; i++) {
    if (w.stopDay !== null && w.day >= w.stopDay) {
      w.running = false;
      break;
    }
    if (clock.hour === 0) {
      beginDay(w, autoResolve);
      activePlans = w.plans.filter((p) => p.status === 'planned' || p.status === 'executing');
    }
    production(w, 1 / 24, activePlans);
    clock.hour++;
    if (clock.hour === 24) {
      clock.hour = 0;
      w.day++;
      endDay(w);
      if (w.stopDay !== null && w.day >= w.stopDay) w.running = false;
    }
  }
  return w;
}

export function ledgerError(w: World): Record<Resource, number> {
  return Object.fromEntries(
    (['food', 'wood', 'stone', 'tools'] as Resource[]).map((k) => [
      k,
      w.stock[k] +
        alive(w).reduce((n, p) => n + (p.carrying?.resource === k ? p.carrying.amount : 0), 0) -
        (w.ledger.initial[k] +
          w.ledger.gathered[k] +
          w.ledger.produced[k] +
          w.ledger.injected[k] +
          w.ledger.tradedIn[k] -
          w.ledger.consumed[k] -
          w.ledger.spent[k] -
          w.ledger.spoiled[k] -
          w.ledger.tradedOut[k]),
    ]),
  ) as Record<Resource, number>;
}
