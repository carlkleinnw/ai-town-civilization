import {
  Group,
  Person,
  Resource,
  SocialProposal,
  SocialRules,
  World,
  age,
  alive,
  emptyStock,
  pair,
} from './model';
import { actionHour, move } from './movement';
import { availableStock, ledgerAdd, pay, publicStock } from './economy';
import { clamp } from './random';

export const INITIAL_RULES: SocialRules = {
  property: 'common',
  distribution: 'need',
  decision: 'assembly',
  tax: 0,
  obligation: 0,
  inheritance: 'common',
  migration: 'free',
};
export function ensureSociety(w: World) {
  if (!w.society)
    w.society = {
      version: 1,
      groups: [
        {
          id: 'group0',
          name: '河谷共同体 / Valley community',
          founded: w.day,
          x: 12,
          y: 8,
          rules: { ...INITIAL_RULES },
          treasury: emptyStock(),
          lastElection: w.day,
          legitimacy: 0.6,
          evidence: [],
        },
      ],
      proposals: [],
      relations: [],
      missions: [],
      lastReview: w.day,
    };
  for (const p of alive(w)) p.groupId ??= w.society.groups[0].id;
  return w.society;
}
export function groupOf(w: World, p: Person) {
  return w.society?.groups.find((g) => g.id === p.groupId && g.extinct === undefined);
}
export const members = (w: World, groupId: string) => alive(w).filter((p) => p.groupId === groupId);
export const voters = (w: World, groupId: string) =>
  members(w, groupId).filter((p) => age(p, w.day) >= 16);
export function socialEvent(
  w: World,
  kind: string,
  zh: string,
  en: string,
  people: string[],
  evidence: Record<string, unknown> = {},
  actor: 'simulation' | 'human' = 'simulation',
) {
  const id = `e${w.nextId++}`;
  w.events.push({ id, day: w.day, kind, text: pair(zh, en), actor, people: [...people], evidence });
  return id;
}
export function validateRules(rules: SocialRules) {
  if (
    !rules ||
    Object.keys(rules).some((k) => !Object.keys(INITIAL_RULES).includes(k)) ||
    !['common', 'household', 'steward'].includes(rules.property) ||
    !['need', 'equal', 'effort'].includes(rules.distribution) ||
    !['assembly', 'mandate', 'hereditary'].includes(rules.decision) ||
    !['family', 'common'].includes(rules.inheritance) ||
    !['free', 'consent'].includes(rules.migration) ||
    !Number.isFinite(rules.tax) ||
    rules.tax < 0 ||
    rules.tax > 0.8 ||
    !Number.isFinite(rules.obligation) ||
    rules.obligation < 0 ||
    rules.obligation > 1
  )
    throw Error('制度组合无效 / Invalid rule combination');
}

export function proposeRules(
  w: World,
  groupId: string,
  proposer: string,
  patch: Partial<SocialRules>,
  reason: string,
  source: SocialProposal['source'],
) {
  const s = ensureSociety(w),
    g = s.groups.find((g) => g.id === groupId && g.extinct === undefined);
  if (
    !g ||
    !voters(w, groupId).some((p) => p.id === proposer) ||
    !reason.trim() ||
    reason.length > 500 ||
    !Object.keys(patch).length
  )
    throw Error('需要在世成年提议者、群体与原因 / Adult proposer, group and reason required');
  validateRules({ ...g.rules, ...patch });
  if (s.proposals.some((p) => p.groupId === groupId && p.status === 'discussion'))
    throw Error('该群体已有议事 / Group already deliberating');
  const proposal: SocialProposal = {
    id: `social${w.nextId++}`,
    groupId,
    proposer,
    source,
    patch,
    reason,
    created: w.day,
    status: 'discussion',
    supporters: [],
    opponents: [],
    progress: 0,
    labor: Math.max(0.5, voters(w, groupId).length / 12),
    before: { ...g.rules },
    spent: {},
  };
  s.proposals.push(proposal);
  socialEvent(
    w,
    'institution-proposal',
    `${proposer}提出制度调整：${reason}；需到场议事、资源与接受。`,
    `${proposer} proposed rules: ${reason}; on-site deliberation and acceptance required.`,
    [proposer],
    { proposal: proposal.id, patch, groupId },
    source === 'human' ? 'human' : 'simulation',
  );
  if (source === 'human') w.humanInterventions = (w.humanInterventions ?? 0) + 1;
  return proposal;
}

function supports(w: World, p: Person, g: Group, proposal: SocialProposal) {
  const next = { ...g.rules, ...proposal.patch };
  const wealth = Object.values(p.assets ?? emptyStock()).reduce((a, b) => a + b, 0);
  let score = 0.5 + p.personality.cooperation * 0.15;
  if (next.property !== g.rules.property)
    score +=
      next.property === 'common'
        ? p.personality.cooperation * 0.25 - wealth * 0.003
        : p.values.autonomy * 0.3 - p.personality.cooperation * 0.15;
  if (next.decision !== g.rules.decision)
    score +=
      next.decision === 'assembly'
        ? p.values.autonomy * 0.3
        : p.id === g.leader
          ? 0.35
          : p.values.security * 0.12 - p.values.autonomy * 0.55;
  if (next.inheritance === 'family' && p.children.length) score += 0.12;
  if (next.distribution === 'effort')
    score += (p.laborCredit ?? 0) * 0.015 - (age(p, w.day) > 65 ? 0.25 : 0);
  if (next.distribution === 'need') score += p.hunger * 0.4 + (p.children.length ? 0.1 : 0);
  score -= (next.tax - g.rules.tax) * (p.values.autonomy + wealth * 0.005);
  score -= (next.obligation - g.rules.obligation) * p.values.autonomy * 0.4;
  if (next.migration === 'consent') score -= p.values.autonomy * 0.2;
  return score >= 0.5;
}

export function workSociety(w: World, p: Person, dt: number): boolean {
  const g = groupOf(w, p),
    proposal = w.society?.proposals.find(
      (q) => q.status === 'discussion' && q.groupId === p.groupId,
    );
  if (!g || !proposal) return false;
  const cast = proposal.supporters.includes(p.id) || proposal.opponents.includes(p.id);
  if (cast && proposal.progress >= proposal.labor) return false;
  p.job = 'council';
  p.activity = pair('到场议事与表决', 'Deliberating and voting on site');
  p.task = { phase: 'working', x: g.x, y: g.y, socialProposalId: proposal.id };
  if (!move(w, p, g.x, g.y)) return true;
  if (!cast) (supports(w, p, g, proposal) ? proposal.supporters : proposal.opponents).push(p.id);
  const labor = dt * p.health * (0.7 + p.skills.social);
  proposal.progress += labor;
  p.laborCredit = (p.laborCredit ?? 0) + labor;
  p.lastExecution = {
    day: Math.floor(actionHour(w) / 24),
    hour: actionHour(w) % 24,
    x: p.x,
    y: p.y,
    kind: 'labor',
    amount: labor,
  };
  const eligible = voters(w, g.id),
    voted = [...proposal.supporters, ...proposal.opponents].filter((id) =>
      eligible.some((p) => p.id === id),
    );
  const weight = (id: string) =>
    id === g.leader && g.rules.decision !== 'assembly'
      ? g.rules.decision === 'hereditary'
        ? 5
        : 3
      : 1;
  const yes = proposal.supporters
    .filter((id) => voted.includes(id))
    .reduce((n, id) => n + weight(id), 0);
  const total = eligible.reduce((n, p) => n + weight(p.id), 0);
  if (proposal.progress >= proposal.labor && voted.length >= Math.ceil(eligible.length * 0.6)) {
    if (yes > total / 2 && pay(w, { food: 1 }, 'spent', g.id)) {
      proposal.status = 'adopted';
      proposal.finished = w.day;
      proposal.spent.food = 1;
      g.rules = { ...g.rules, ...proposal.patch };
      proposal.after = { ...g.rules };
      g.legitimacy = clamp(g.legitimacy + 0.1);
      const evidence = socialEvent(
        w,
        'institution',
        `群体 ${g.id} 经现场议事采用规则 ${proposal.id}。`,
        `Group ${g.id} enacted rules after on-site deliberation.`,
        voted,
        {
          proposal: proposal.id,
          before: proposal.before,
          after: proposal.after,
          supporters: proposal.supporters,
          opponents: proposal.opponents,
          labor: proposal.progress,
          cost: proposal.spent,
        },
      );
      g.evidence = [...g.evidence.slice(-11), evidence];
    } else if (voted.length === eligible.length && yes <= total / 2) {
      proposal.status = 'rejected';
      proposal.finished = w.day;
      socialEvent(
        w,
        'institution-rejected',
        `群体 ${g.id} 未接受提议 ${proposal.id}。`,
        `Group ${g.id} rejected proposal ${proposal.id}.`,
        voted,
        { supporters: proposal.supporters, opponents: proposal.opponents },
      );
    }
  }
  return true;
}

/** Delivery partitions existing inventory; it never creates extra resources. */
export function allocateDelivery(w: World, p: Person, resource: Resource, amount: number) {
  const g = groupOf(w, p);
  if (!g || amount <= 0) return;
  const privateAmount =
    g.rules.property === 'household'
      ? amount * (1 - g.rules.tax) * 0.7
      : g.rules.property === 'steward'
        ? amount * 0.35
        : 0;
  const owner =
    g.rules.property === 'steward'
      ? (w.people.find((q) => q.id === g.leader && q.died === undefined) ?? p)
      : p;
  if (privateAmount > 0) {
    owner.assets ??= emptyStock();
    owner.assets[resource] += privateAmount;
  }
  if (g.id !== w.society!.groups[0].id) g.treasury[resource] += amount - privateAmount;
  p.laborCredit = (p.laborCredit ?? 0) + amount * 0.1;
}

export function feedSociety(w: World): Map<string, number> | null {
  if (!w.society) return null;
  const result = new Map<string, number>();
  for (const g of w.society.groups) {
    const population = members(w, g.id).filter((p) => {
      const mission = w.society!.missions.find(
        (m) => !['completed', 'failed', 'assembling'].includes(m.status) && m.people.includes(p.id),
      );
      if (mission) {
        result.set(p.id, mission.supplies > 0 ? 1 : 0);
        return false;
      }
      return true;
    });
    if (!population.length) continue;
    const remaining = new Map<string, number>();
    for (const p of population) {
      const need = age(p, w.day) < 12 ? 0.4 : 0.7;
      const own = Math.min(need, p.assets?.food ?? 0);
      if (own > 0) {
        p.assets!.food -= own;
        w.stock.food -= own;
        ledgerAdd(w, 'consumed', 'food', own);
      }
      result.set(p.id, own / need);
      remaining.set(p.id, need - own);
    }
    const pool = Math.min(
      availableStock(w, g.id).food,
      [...remaining.values()].reduce((a, b) => a + b, 0),
    );
    const weight = (p: Person) =>
      g.rules.distribution === 'effort'
        ? 0.25 + Math.min(5, p.laborCredit ?? 0)
        : g.rules.distribution === 'need'
          ? 1 + p.hunger * 2 + (age(p, w.day) < 16 ? 0.5 : 0)
          : 1;
    let budget = Math.max(0, pool);
    // Water filling preserves exact budgets while avoiding waste on already-fed people.
    for (let round = 0; round < population.length && budget > 1e-9; round++) {
      const hungry = population.filter((p) => (remaining.get(p.id) ?? 0) > 1e-9);
      const weights = hungry.reduce((n, p) => n + weight(p), 0),
        initial = budget;
      if (!weights) break;
      for (const p of hungry) {
        const amount = Math.min(remaining.get(p.id)!, (initial * weight(p)) / weights);
        const need = age(p, w.day) < 12 ? 0.4 : 0.7;
        remaining.set(p.id, remaining.get(p.id)! - amount);
        budget -= amount;
        result.set(p.id, result.get(p.id)! + amount / need);
      }
    }
    pay(w, { food: pool - budget }, 'consumed', g.id);
    for (const p of population) {
      const ratio = Math.min(1, result.get(p.id) ?? 0);
      p.grievance = clamp(
        (p.grievance ?? 0) * 0.98 +
          (1 - ratio) * 0.07 +
          (g.rules.decision !== 'assembly' ? p.values.autonomy * 0.001 : -0.001),
      );
      p.laborCredit = (p.laborCredit ?? 0) * 0.85;
    }
  }
  return result;
}

export function inheritAssets(w: World, p: Person) {
  if (!p.assets) return;
  const g = groupOf(w, p),
    heirs = alive(w).filter(
      (q) => q.id !== p.id && (p.children.includes(q.id) || q.id === p.partner),
    );
  const assets = { ...p.assets };
  p.assets = emptyStock();
  if (g?.rules.inheritance === 'family' && heirs.length) {
    for (const heir of heirs) {
      heir.assets ??= emptyStock();
      for (const r of Object.keys(assets) as Resource[]) heir.assets[r] += assets[r] / heirs.length;
    }
  } else if (g && g.id !== w.society?.groups[0].id)
    for (const r of Object.keys(assets) as Resource[]) g.treasury[r] += assets[r];
  socialEvent(
    w,
    'property-inheritance',
    `${p.id} 的实际财产按 ${g?.rules.inheritance ?? 'common'} 规则转移。`,
    `Actual assets transferred under inheritance rules.`,
    [p.id, ...heirs.map((p) => p.id)],
    { assets, groupId: g?.id ?? null, inheritance: g?.rules.inheritance ?? 'common' },
  );
}

export function reviewSociety(w: World) {
  const s = ensureSociety(w);
  for (const p of s.proposals)
    if (p.status === 'discussion' && w.day - p.created > 30) {
      p.status = 'expired';
      p.finished = w.day;
      socialEvent(
        w,
        'institution-failure',
        `提议 ${p.id} 因未形成足够现场参与而失效。`,
        `Proposal expired without sufficient on-site participation.`,
        [],
        { proposal: p.id },
      );
    }
  for (const g of s.groups) {
    const living = voters(w, g.id);
    if (!members(w, g.id).length) {
      g.extinct ??= w.day;
      continue;
    }
    const leader = living.find((p) => p.id === g.leader);
    if (
      !leader ||
      (g.rules.decision === 'mandate' && (w.day - g.lastElection >= 180 || g.legitimacy < 0.25))
    ) {
      const successor =
        g.rules.decision === 'hereditary'
          ? living.find((p) => p.parents.includes(g.leader ?? ''))
          : undefined;
      const selected =
        successor ??
        living.sort(
          (a, b) =>
            b.skills.social +
            b.personality.cooperation -
            a.skills.social -
            a.personality.cooperation,
        )[0];
      if (selected) {
        g.leader = selected.id;
        g.lastElection = w.day;
        socialEvent(
          w,
          'authority',
          `群体 ${g.id} 推举 ${selected.id} 协调事务，决策规则 ${g.rules.decision}。`,
          `Group selected coordinator under ${g.rules.decision} rules.`,
          [selected.id],
          { groupId: g.id, hereditary: !!successor },
        );
      }
    }
    const totalFood = Math.max(
      1,
      availableStock(w, g.id).food +
        members(w, g.id).reduce((n, p) => n + (p.assets?.food ?? 0), 0),
    );
    const controller = members(w, g.id).find((p) => p.id === g.leader);
    const foodShare = (controller?.assets?.food ?? 0) / totalFood;
    if (
      controller &&
      foodShare > 0.5 &&
      g.rules.property === 'steward' &&
      g.rules.decision === 'hereditary' &&
      g.rules.inheritance === 'family'
    ) {
      const prior = g.concentration;
      g.concentration = {
        since:
          prior &&
          (prior.controller === controller.id || controller.parents.includes(prior.controller))
            ? prior.since
            : w.day,
        controller: controller.id,
        foodShare,
      };
    } else delete g.concentration;
    g.legitimacy = clamp(
      g.legitimacy * 0.995 +
        (1 -
          members(w, g.id).reduce((n, p) => n + (p.grievance ?? 0), 0) / members(w, g.id).length) *
          0.005,
    );
    if (
      w.day % 60 === 0 &&
      living.length &&
      !s.proposals.some((p) => p.groupId === g.id && p.status === 'discussion')
    ) {
      let patch: Partial<SocialRules> | null = null;
      if (w.strategy.weights.council >= 3 && g.rules.distribution !== 'need')
        patch = { decision: 'assembly', distribution: 'need', obligation: 0.1 };
      else if (w.strategy.weights.trade >= 6 && g.rules.property === 'common')
        patch = { property: 'household', distribution: 'effort', inheritance: 'family', tax: 0.2 };
      else if (w.strategy.weights.defend >= 6 && g.rules.decision === 'assembly')
        patch = { decision: 'mandate', property: 'steward', obligation: 0.4, tax: 0.3 };
      else if (w.strategy.weights.restore >= 6 && g.rules.obligation < 0.1)
        patch = { property: 'common', distribution: 'need', obligation: 0.15 };
      if (
        patch &&
        w.authority !== 'human' &&
        !(w.authority === 'mixed' && w.humanKinds.includes('direction'))
      )
        proposeRules(
          w,
          g.id,
          g.leader ?? living[0].id,
          patch,
          `策略 ${w.strategy.name.zh} 下的成员制度提议 / endogenous proposal`,
          'rules',
        );
    }
  }
  // Keep finished hot records bounded; persist() archives every changed proposal first.
  s.lastReview = w.day;
}

export function socialDiagnosis(w: World) {
  if (!w.society)
    return {
      name: pair('旧档共同库存', 'Legacy shared inventory'),
      evidence: [
        pair(
          '尚未启用群体规则，旧库存原样保留。',
          'Group rules initialize at the next real simulation step.',
        ),
      ],
    };
  const population = alive(w),
    wealth = population.map((p) =>
      Object.values(p.assets ?? emptyStock()).reduce((a, b) => a + b, 0),
    );
  const total = wealth.reduce((a, b) => a + b, 0),
    highest = total > 0 ? Math.max(0, ...wealth) / total : 0;
  const groups = w.society.groups.filter((g) => g.extinct === undefined);
  const concentrated = highest > 0.5 && total > population.length * 2;
  const rules = groups[0]?.rules ?? INITIAL_RULES;
  return {
    name: pair(
      `${groups.length} 个群体 · ${rules.decision === 'assembly' ? '共议' : rules.decision === 'mandate' ? '授权协调' : '世袭协调'} · ${concentrated ? '财产集中' : rules.property === 'common' ? '公共持有' : '混合持有'}`,
      `${groups.length} groups · ${rules.decision} · ${concentrated ? 'concentrated property' : rules.property}`,
    ),
    evidence: [
      pair(
        `制度组合 ${new Set(groups.map((g) => JSON.stringify(g.rules))).size} 种；持续特权控制指标满足 180 日的群体 ${groups.filter((g) => g.concentration && w.day - g.concentration.since >= 180).length} 个。`,
        `Rule combinations ${new Set(groups.map((g) => JSON.stringify(g.rules))).size}; groups meeting persistent privilege indicators for 180 days: ${groups.filter((g) => g.concentration && w.day - g.concentration.since >= 180).length}.`,
      ),
      pair(
        `私人资源件数（未计价） ${total.toFixed(1)}；最高持有者占 ${(highest * 100).toFixed(1)}%。`,
        `Private assets ${total.toFixed(1)}; top share ${(highest * 100).toFixed(1)}%.`,
      ),
      pair(
        `公共可用食物 ${publicStock(w).food.toFixed(1)}；已实施制度 ${w.society.proposals.filter((p) => p.status === 'adopted').length} 项。`,
        `Common food ${publicStock(w).food.toFixed(1)}; ${w.society.proposals.filter((p) => p.status === 'adopted').length} enacted proposals.`,
      ),
      pair(
        '这是当前规则与财产分布的描述；尚不足以据此断言形成稳定世袭阶级。',
        'A description of current rules and property; not proof of stable hereditary classes.',
      ),
    ],
  };
}
