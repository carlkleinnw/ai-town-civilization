import { Group, Mission, Person, Relation, Resource, World, age, emptyStock, pair } from './model';
import { actionHour, move, passable } from './movement';
import { availableStock, ledgerAdd, pay } from './economy';
import { ensureSociety, groupOf, members, socialEvent, voters } from './society';
import { clamp, random } from './random';

const active = (m: Mission) => !['completed', 'failed'].includes(m.status);
export function relation(w: World, a: string, b: string): Relation {
  const s = ensureSociety(w);
  if (a === b || !s.groups.some((g) => g.id === a) || !s.groups.some((g) => g.id === b))
    throw Error('需要同世界的两个实际群体 / Two groups within this world required');
  let r = s.relations.find((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a));
  if (!r) {
    r = {
      a,
      b,
      trust: 0.3,
      grievance: 0,
      state: 'neutral',
      since: w.day,
      traded: 0,
      negotiated: 0,
      lastContact: w.day,
    };
    s.relations.push(r);
  }
  return r;
}

function reachable(w: World, from: number, target: number) {
  const queue = [from],
    seen = new Set(queue);
  for (let i = 0; i < queue.length; i++) {
    if (queue[i] === target) return true;
    const n = queue[i];
    for (const next of [n - 24, n + 24, n % 24 ? n - 1 : -1, n % 24 < 23 ? n + 1 : -1]) {
      if (
        next < 0 ||
        next >= w.tiles.length ||
        seen.has(next) ||
        !passable(w, next % 24, Math.floor(next / 24))
      )
        continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return false;
}

export function proposeMission(
  w: World,
  input: {
    kind: Mission['kind'];
    groupId: string;
    target: number;
    targetGroup?: string;
    people?: string[];
    reason: string;
  },
  human = false,
) {
  const s = ensureSociety(w),
    g = s.groups.find((g) => g.id === input.groupId && g.extinct === undefined),
    t = w.tiles[input.target];
  if (
    !g ||
    !input.reason.trim() ||
    input.reason.length > 500 ||
    !Number.isInteger(input.target) ||
    !t?.explored ||
    t.terrain === 'water'
  )
    throw Error('需要可行目标、群体和原因 / Valid target, group and reason required');
  if (s.missions.some((m) => m.groupId === g.id && active(m)))
    throw Error('群体已有外出行动 / Group already has an active mission');
  if (!reachable(w, g.y * 24 + g.x, input.target)) throw Error('无陆上通路 / No land route');
  const other = s.groups.find(
    (q) => q.id === input.targetGroup && q.id !== g.id && q.extinct === undefined,
  );
  if (input.kind !== 'migration' && (!other || other.x !== t.x || other.y !== t.y))
    throw Error(
      '需要同世界实际交往对象的聚落 / Target settlement must belong to another group in this world',
    );
  if (
    input.kind === 'migration' &&
    (s.groups.length >= 8 ||
      Math.abs(t.x - g.x) + Math.abs(t.y - g.y) < 4 ||
      t.control ||
      s.groups.some((q) => q.extinct === undefined && q.x === t.x && q.y === t.y) ||
      w.buildings.some((b) => b.x === t.x && b.y === t.y && b.condition > 0))
  )
    throw Error(
      '迁徙需要足够远的无主可居住土地，最多八个群体 / Unclaimed distant land and group capacity required',
    );
  const r = other ? relation(w, g.id, other.id) : null;
  if (
    input.kind === 'raid' &&
    (!r || r.grievance < 0.6 || r.state === 'alliance' || r.state === 'truce')
  )
    throw Error(
      '缺少持续争端，或仍受联盟/停战约束 / Sustained dispute required; treaty prevents attack',
    );
  if (input.kind === 'trade' && r?.state === 'war')
    throw Error('交战时需先谈判 / Negotiate before trading during war');
  const candidates = voters(w, g.id).filter(
    (p) =>
      !p.motion &&
      !p.carrying &&
      p.health > 0.55 &&
      p.hunger < 0.2 &&
      (!input.people || input.people.includes(p.id)) &&
      (input.kind === 'migration'
        ? p.values.autonomy + (p.grievance ?? 0) + p.personality.curiosity > 0.6
        : input.kind === 'raid'
          ? p.values.security + (p.grievance ?? 0) + p.personality.resilience > 1
          : p.personality.cooperation + p.skills.social > 0.45),
  );
  const cap = Math.min(12, Math.max(1, Math.floor(voters(w, g.id).length / 2)));
  const crew = candidates.slice(0, input.kind === 'migration' || input.kind === 'raid' ? cap : 2);
  if (crew.length < (input.kind === 'migration' ? 2 : 1))
    throw Error('没有足够愿意且能承担行动的人 / Insufficient willing, healthy participants');
  if (
    input.kind === 'migration' &&
    g.rules.migration === 'consent' &&
    (g.legitimacy < 0.5 || crew.length > members(w, g.id).length / 3)
  )
    throw Error('现行迁徙同意规则未满足 / Migration consent rule not satisfied');
  const distance = Math.abs(t.x - g.x) + Math.abs(t.y - g.y);
  const food = Math.ceil(((crew.length * (distance * 4 + 96)) / 24) * 0.7);
  const stock = availableStock(w, g.id);
  if (
    stock.food < food + members(w, g.id).length * 2 ||
    (input.kind === 'raid' && stock.tools < crew.length * 0.2) ||
    (input.kind === 'trade' && stock.wood < 4)
  )
    throw Error(
      '补给、装备或留守食物不足 / Insufficient provisions, equipment, cargo or home reserve',
    );
  const mission: Mission = {
    id: `mission${w.nextId++}`,
    kind: input.kind,
    groupId: g.id,
    targetGroup: other?.id,
    target: input.target,
    people: crew.map((p) => p.id),
    created: w.day,
    reason: input.reason,
    status: 'assembling',
    supplies: 0,
    equipment: 0,
    cargo: emptyStock(),
    progress: 0,
    losses: [],
    casualties: [],
    spent: emptyStock(),
  };
  s.missions.push(mission);
  socialEvent(
    w,
    'mission-proposal',
    `${g.id} 的 ${crew.length} 人接受 ${input.kind} 行动：${input.reason}；先到储藏点集结。`,
    `${crew.length} people accepted ${input.kind}: ${input.reason}; assembling at storage first.`,
    mission.people,
    {
      mission: mission.id,
      target: input.target,
      targetGroup: other?.id ?? null,
      cause: input.reason,
    },
    human ? 'human' : 'simulation',
  );
  if (human) w.humanInterventions = (w.humanInterventions ?? 0) + 1;
  return mission;
}

export function personMission(w: World, p: Person) {
  return w.society?.missions.find((m) => active(m) && m.people.includes(p.id));
}
export function workMission(w: World, p: Person, _dt: number) {
  const m = personMission(w, p),
    g = groupOf(w, p);
  if (!m || !g) return false;
  if (p.health < 0.3 || p.hunger > 0.6) {
    m.status = 'returning';
    if (!m.losses.includes(p.id)) m.losses.push(p.id);
  }
  const target =
    m.status === 'assembling' || m.status === 'returning' ? { x: g.x, y: g.y } : w.tiles[m.target];
  p.job = m.kind === 'raid' ? 'defend' : m.kind === 'trade' ? 'trade' : 'explore';
  p.activity = pair(
    m.status === 'returning'
      ? '返回聚落'
      : m.kind === 'migration'
        ? '实际迁徙'
        : m.kind === 'raid'
          ? '携带补给出征'
          : '前往另一聚落交往',
    m.status === 'returning' ? 'Returning home' : `${m.kind}: travelling to settlement`,
  );
  p.task = { phase: 'working', x: target.x, y: target.y, missionId: m.id };
  move(w, p, target.x, target.y);
  return true;
}

function refund(w: World, m: Mission, g: Group, r: Resource, amount: number) {
  if (amount <= 0) return;
  w.stock[r] += amount;
  ledgerAdd(w, 'spent', r, -amount);
  m.spent[r] -= amount;
  if (g.id !== w.society!.groups[0].id) g.treasury[r] += amount;
}
function finish(w: World, m: Mission, g: Group, failed = false) {
  refund(w, m, g, 'food', m.supplies);
  refund(w, m, g, 'tools', m.equipment);
  for (const r of Object.keys(m.cargo) as Resource[]) refund(w, m, g, r, m.cargo[r]);
  m.supplies = 0;
  m.equipment = 0;
  m.cargo = emptyStock();
  m.status = failed ? 'failed' : 'completed';
  socialEvent(
    w,
    'mission-result',
    `行动 ${m.id} ${failed ? '失败' : '结束'}；真实净成本与人员结果已结算。`,
    `Mission ${m.id} ${failed ? 'failed' : 'finished'}; net costs and people settled.`,
    m.people,
    {
      mission: m.id,
      spent: m.spent,
      losses: m.losses,
      casualties: m.casualties,
      childGroup: m.childGroup ?? null,
    },
  );
}

/** Called once per authoritative hourly interval, after all people act. */
export function advanceMissions(w: World, kill: (w: World, p: Person) => void) {
  for (const m of w.society?.missions ?? []) {
    if (!active(m)) continue;
    const g = w.society!.groups.find((g) => g.id === m.groupId)!;
    let crew = m.people
      .map((id) => w.people.find((p) => p.id === id && p.died === undefined))
      .filter((p): p is Person => !!p);
    if (!crew.length) {
      // Supplies/equipment/cargo already left the economy on dispatch. No ghost return.
      m.supplies = 0;
      m.equipment = 0;
      m.cargo = emptyStock();
      m.status = 'failed';
      socialEvent(
        w,
        'mission-loss',
        `行动 ${m.id} 已无在世参与者，未返还物资。`,
        `Mission lost all living participants and cargo.`,
        m.people,
        { mission: m.id, spent: m.spent },
      );
      continue;
    }
    if (m.status !== 'assembling')
      for (const p of crew) {
        const food = Math.min(m.supplies, 0.7 / 24);
        m.supplies -= food;
        p.hunger = clamp(p.hunger + (food > 0 ? -0.01 / 24 : 0.04 / 24));
        if (!food) p.health = clamp(p.health - 0.02 / 24);
        if (p.health <= 0 && p.died === undefined) {
          m.casualties.push(p.id);
          kill(w, p);
        }
      }
    crew = crew.filter((p) => p.died === undefined);
    if (!crew.length) {
      m.supplies = 0;
      m.equipment = 0;
      m.cargo = emptyStock();
      m.status = 'failed';
      continue;
    }
    if (w.day - m.created > 60) m.status = 'returning';
    const at = (x: number, y: number) => crew.filter((p) => !p.motion && p.x === x && p.y === y);
    const t = w.tiles[m.target],
      arrived = at(t.x, t.y),
      home = at(g.x, g.y);
    if (m.status === 'assembling') {
      if (home.length !== crew.length) continue;
      const distance = Math.abs(t.x - g.x) + Math.abs(t.y - g.y),
        food = Math.ceil(((crew.length * (distance * 4 + 96)) / 24) * 0.7),
        tools = m.kind === 'raid' ? crew.length * 0.2 : 0;
      const cost = { food, tools, ...(m.kind === 'trade' ? { wood: 4 } : {}) };
      if (!pay(w, cost, 'spent', g.id)) {
        m.status = 'failed';
        socialEvent(
          w,
          'mission-failure',
          `行动 ${m.id} 集结后无法支付实际物资，取消。`,
          'Mission cancelled at assembly due to missing provisions.',
          m.people,
          { mission: m.id, cost },
        );
        continue;
      }
      m.spent = { ...emptyStock(), ...cost };
      m.supplies = food;
      m.equipment = tools;
      if (m.kind === 'trade') m.cargo.wood = 4;
      m.status = 'travelling';
      socialEvent(
        w,
        'mission-departure',
        `行动 ${m.id} 在 (${g.x}, ${g.y}) 领取物资后出发。`,
        'Mission departed after collecting actual supplies at its settlement.',
        m.people,
        { mission: m.id, cost, from: [g.x, g.y], target: [t.x, t.y] },
      );
      continue;
    }
    if (m.status === 'returning') {
      if (home.length === crew.length) finish(w, m, g);
      continue;
    }
    if (!arrived.length) continue;
    if (m.kind === 'migration') {
      if (arrived.length !== crew.length) continue;
      if (t.control && t.control.groupId !== g.id) {
        m.status = 'returning';
        continue;
      }
      const child: Group = {
        id: `group${w.nextId++}`,
        name: `${crew[0].name}聚落 / Settlement`,
        founded: w.day,
        parent: g.id,
        x: t.x,
        y: t.y,
        rules: { ...g.rules },
        treasury: emptyStock(),
        leader: crew[0].id,
        lastElection: w.day,
        legitimacy: 0.6,
        evidence: [],
      };
      w.society!.groups.push(child);
      for (const p of crew) {
        p.groupId = child.id;
        delete p.assignment;
      }
      t.control = { groupId: child.id, since: w.day, cause: m.id };
      m.childGroup = child.id;
      const r = relation(w, g.id, child.id);
      r.trust = 0.5; // independent yet initially non-hostile
      finish(w, m, child);
      socialEvent(
        w,
        'secession',
        `${crew.length} 人实际抵达 (${t.x}, ${t.y})，形成独立群体 ${child.id}；原身份与家庭保留。`,
        `Migrants arrived and formed ${child.id}; identities and families retained.`,
        m.people,
        { mission: m.id, parent: g.id, child: child.id, tile: m.target },
      );
      continue;
    }
    const target = w.society!.groups.find((g) => g.id === m.targetGroup && g.extinct === undefined);
    if (!target) {
      m.status = 'returning';
      continue;
    }
    const r = relation(w, g.id, target.id);
    if (m.kind === 'envoy') {
      const delegates = members(w, target.id).filter(
        (p) => !p.motion && p.x === t.x && p.y === t.y && age(p, w.day) >= 16,
      );
      if (!delegates.length) continue;
      m.progress += arrived.length / 24;
      if (m.progress < 0.5) continue;
      const support =
        [...arrived, ...delegates].reduce((n, p) => n + p.personality.cooperation, 0) /
        (arrived.length + delegates.length);
      const accepts = support + r.trust * 0.5 + (1 - target.legitimacy) * 0.1 > 0.45;
      r.negotiated++;
      r.lastContact = w.day;
      if (accepts) {
        r.trust = clamp(r.trust + 0.25);
        r.grievance = clamp(r.grievance - 0.4);
        r.state = r.state === 'war' ? 'truce' : r.trust > 0.65 ? 'alliance' : 'neutral';
        r.since = w.day;
        for (const other of w.society!.missions)
          if (
            other.kind === 'raid' &&
            active(other) &&
            ((other.groupId === r.a && other.targetGroup === r.b) ||
              (other.groupId === r.b && other.targetGroup === r.a))
          )
            other.status = 'returning';
      }
      socialEvent(
        w,
        'diplomacy',
        `${g.id} 与 ${target.id} 的现场谈判${accepts ? '达成妥协' : '未获接受'}。`,
        `On-site negotiation ${accepts ? 'reached a compromise' : 'failed'}.`,
        [...arrived, ...delegates].map((p) => p.id),
        { mission: m.id, relation: { ...r }, accepted: accepts, reason: m.reason },
      );
      m.status = 'returning';
      continue;
    }
    if (m.kind === 'trade') {
      const sellers = members(w, target.id).filter((p) => !p.motion && p.x === t.x && p.y === t.y);
      if (!sellers.length || r.state === 'war') continue;
      if (
        availableStock(w, target.id).food > members(w, target.id).length * 2 + 4 &&
        pay(w, { food: 4 }, 'spent', target.id)
      ) {
        // Both legs remain in this world's ledger. Exported goods are physically delivered here.
        w.stock.wood += m.cargo.wood;
        ledgerAdd(w, 'spent', 'wood', -m.cargo.wood);
        m.spent.wood -= m.cargo.wood;
        if (target.id !== w.society!.groups[0].id) target.treasury.wood += m.cargo.wood;
        m.cargo.wood = 0;
        m.cargo.food = 4;
        m.spent.food += 4;
        r.traded++;
        r.trust = clamp(r.trust + 0.08);
        r.grievance = clamp(r.grievance - 0.05);
        r.lastContact = w.day;
        socialEvent(
          w,
          'internal-trade',
          `${g.id} 的商旅到场，以 4 木材交换 ${target.id} 的 4 食物；食物需运回。`,
          'Actual travellers bartered 4 timber for 4 food, which must return home.',
          m.people,
          { mission: m.id, from: g.id, to: target.id, wood: 4, food: 4 },
        );
      }
      m.status = 'returning';
      continue;
    }
    if (r.state === 'truce' || r.state === 'alliance') {
      m.status = 'returning';
      continue;
    }
    if (r.state !== 'war') {
      r.state = 'war';
      r.since = w.day;
      socialEvent(
        w,
        'war',
        `${g.id} 的实际武装抵达 ${target.id}，持续争端升级为战斗。`,
        'An armed party arrived; a sustained dispute escalated to battle.',
        arrived.map((p) => p.id),
        { mission: m.id, groups: [g.id, target.id], reason: m.reason, grievance: r.grievance },
      );
    }
    if (m.lastAction === actionHour(w)) continue;
    m.lastAction = actionHour(w);
    const defenders = members(w, target.id).filter(
      (p) =>
        age(p, w.day) >= 16 &&
        !p.motion &&
        Math.abs(p.x - t.x) + Math.abs(p.y - t.y) <= 1 &&
        p.health > 0,
    );
    const terrain =
      t.terrain === 'hill' ? 1.5 : t.land?.vegetation && t.land.vegetation > 0.55 ? 1.2 : 1;
    const power =
      arrived.reduce(
        (n, p) => n + p.health * (0.5 + p.skills.building) * (m.equipment > 0 ? 1.6 : 0.7),
        0,
      ) * (m.supplies > 0 ? 1 : 0.3);
    const defense =
      defenders.reduce((n, p) => n + p.health * (0.5 + p.skills.building), 0) * terrain;
    const damage = 0.012 * (0.8 + random(w) * 0.4);
    for (const p of defenders)
      p.health = Math.max(0, p.health - (damage * power) / Math.max(1, defenders.length));
    for (const p of arrived) p.health = Math.max(0, p.health - (damage * defense) / arrived.length);
    m.equipment = Math.max(0, m.equipment - arrived.length * 0.0008);
    for (const p of [...defenders, ...arrived])
      if (p.health <= 0 && p.died === undefined) {
        m.casualties.push(p.id);
        kill(w, p);
      }
    m.progress += 1 / 24;
    if (!defenders.some((p) => p.died === undefined && p.health > 0.25)) {
      const captured = Math.min(8, Math.max(0, availableStock(w, target.id).food));
      if (captured && pay(w, { food: captured }, 'spent', target.id)) {
        m.cargo.food += captured;
        m.spent.food += captured;
      }
      t.control = { groupId: g.id, since: w.day, cause: m.id };
      const damagedBuildings: { id: string; before: number; after: number }[] = [];
      for (const b of w.buildings)
        if (b.x === t.x && b.y === t.y) {
          const before = b.condition;
          b.groupId = g.id;
          b.condition = Math.max(0, b.condition - 0.15);
          damagedBuildings.push({ id: b.id, before, after: b.condition });
          if (before > 0 && b.condition === 0) {
            (w.ruins ??= []).push({
              id: b.id,
              kind: b.kind,
              x: b.x,
              y: b.y,
              day: w.day,
              planId: b.planId,
              built: b.built,
            });
            w.ruins = w.ruins.slice(-80);
          }
        }
      target.legitimacy = clamp(target.legitimacy - 0.2);
      r.grievance = clamp(r.grievance + 0.15);
      socialEvent(
        w,
        'battle-result',
        `${g.id} 在 (${t.x}, ${t.y}) 控制地块并带走 ${captured.toFixed(1)} 食物，开始返程。`,
        'Attackers took control of the actual plot and carried captured supplies home.',
        [...arrived, ...defenders].map((p) => p.id),
        {
          mission: m.id,
          tile: m.target,
          captured,
          damagedBuildings,
          casualties: m.casualties,
          attackerHealth: arrived.map((p) => [p.id, p.health]),
          defenderHealth: defenders.map((p) => [p.id, p.health]),
        },
      );
      m.status = 'returning';
    } else if (m.supplies <= 0 || m.progress >= 3 || arrived.every((p) => p.health < 0.35)) {
      socialEvent(
        w,
        'retreat',
        `行动 ${m.id} 因补给、伤损或持续成本撤退。`,
        'Force retreated due to supply, injury or sustained costs.',
        m.people,
        { mission: m.id, supplies: m.supplies, casualties: m.casualties, battleDays: m.progress },
      );
      m.status = 'returning';
    }
  }
}

export function territorialUse(w: World, p: Person, tile: number, amount: number) {
  const t = w.tiles[tile];
  if (!p.groupId || !t.control || p.groupId === t.control.groupId || amount <= 0) return;
  const r = relation(w, p.groupId, t.control.groupId);
  if (r.state === 'alliance') return;
  const before = r.grievance;
  r.grievance = clamp(r.grievance + amount * 0.003);
  r.trust = clamp(r.trust - amount * 0.001);
  if (before < 0.6 && r.grievance >= 0.6)
    socialEvent(
      w,
      'resource-dispute',
      `${p.groupId} 与 ${t.control.groupId} 因有主地块上的实际采收形成持续争端。`,
      'Repeated extraction on a controlled plot created a sustained dispute.',
      [p.id],
      { tile, relation: { ...r }, extracted: amount },
    );
}

export function reviewRelations(w: World) {
  const s = ensureSociety(w);
  for (const r of s.relations) {
    if (r.state === 'truce' && w.day - r.since > 180) r.state = 'neutral';
    if (r.state !== 'war') r.grievance = clamp(r.grievance - 0.0005);
  }
  if (w.day % 30 || w.authority === 'human') return;
  for (const g of s.groups.filter((g) => g.extinct === undefined)) {
    if (s.missions.some((m) => m.groupId === g.id && active(m))) continue;
    const population = members(w, g.id),
      discontent =
        population.reduce((n, p) => n + (p.grievance ?? 0), 0) / Math.max(1, population.length);
    try {
      if (
        !(w.authority === 'mixed' && w.humanKinds.includes('direction')) &&
        population.length >= 8 &&
        (discontent > 0.4 || (w.strategy.weights.explore >= 6 && population.length >= 16))
      ) {
        const target = w.tiles.findIndex(
          (t) =>
            t.explored &&
            t.terrain === 'grass' &&
            !t.control &&
            t.fertility > 0.5 &&
            Math.abs(t.x - g.x) + Math.abs(t.y - g.y) >= 5 &&
            Math.abs(t.x - g.x) + Math.abs(t.y - g.y) <= 10,
        );
        if (target >= 0) {
          proposeMission(w, {
            kind: 'migration',
            groupId: g.id,
            target,
            reason: `迁徙意愿与环境机会 / grievance ${discontent.toFixed(2)}, expansion weight ${w.strategy.weights.explore}`,
          });
          continue;
        }
      }
      const other = s.groups.find((q) => q.id !== g.id && q.extinct === undefined);
      if (!other) continue;
      const r = relation(w, g.id, other.id);
      const kind =
        r.grievance > 0.7 && w.strategy.weights.defend >= 6
          ? 'raid'
          : r.state === 'war' || r.grievance > 0.2 || r.trust < 0.5
            ? 'envoy'
            : 'trade';
      if (kind === 'raid' && w.authority === 'mixed' && w.humanKinds.includes('crisis')) continue;
      proposeMission(w, {
        kind,
        groupId: g.id,
        target: other.y * 24 + other.x,
        targetGroup: other.id,
        reason: `实际群体关系下的 ${kind}：信任 ${r.trust.toFixed(2)}，争端 ${r.grievance.toFixed(2)} / relationship response`,
      });
    } catch {
      /* Failed feasibility is a valid non-action, not an invented event. */
    }
  }
}
