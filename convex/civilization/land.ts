import { Land, LandAction, LandProject, Person, Stock, Tile, World, alive, pair } from './model';
import { actionHour, move } from './movement';
import { availableStock, ledgerAdd, pay } from './economy';
import { clamp } from './random';

export const LAND_ACTIONS: Record<
  LandAction,
  {
    zh: string;
    en: string;
    labor: number;
    cost: Partial<Stock>;
    tools: boolean;
    knowledge?: string;
  }
> = {
  clear: { zh: '清理林地', en: 'Clear woodland', labor: 5, cost: {}, tools: false },
  cultivate: { zh: '开垦土地', en: 'Cultivate plot', labor: 8, cost: { food: 2 }, tools: false },
  road: { zh: '修筑道路', en: 'Build road', labor: 6, cost: { stone: 3, wood: 1 }, tools: true },
  reforest: {
    zh: '育林休耕',
    en: 'Reforest and fallow',
    labor: 6,
    cost: { food: 2 },
    tools: false,
  },
  terrace: {
    zh: '修筑梯田',
    en: 'Build terraces',
    labor: 24,
    cost: { stone: 8, wood: 4 },
    tools: true,
    knowledge: 'cultivation',
  },
  level: {
    zh: '平整丘陵',
    en: 'Level hillside',
    labor: 60,
    cost: { stone: 4, wood: 8 },
    tools: true,
    knowledge: 'cultivation',
  },
};

/** Read-only compatibility view: no invented historical labor and no forced save migration. */
export function landOf(t: Tile): Land {
  return (
    t.land ?? {
      base: t.terrain === 'water' ? 'water' : t.terrain === 'hill' ? 'hill' : 'plain',
      vegetation: Math.min(1, t.wood / 180),
      use: 'wild',
      degradation: 0,
      terraces: 0,
      traffic: 0,
      revision: 0,
    }
  );
}
export function ensureLand(t: Tile) {
  return (t.land ??= { ...landOf(t) });
}
export const coverName = (t: Tile) =>
  landOf(t).vegetation > 0.55
    ? 'dense'
    : landOf(t).vegetation > 0.12
      ? 'sparse'
      : landOf(t).vegetation > 0.02
        ? 'grass'
        : 'bare';
export function landSnapshot(t: Tile) {
  return { ...landOf(t), wood: t.wood, fertility: t.fertility, stone: t.stone };
}
function receipt(
  w: World,
  t: Tile,
  cause: string,
  people: string[],
  before: unknown,
  cost: unknown = {},
  source: 'simulation' | 'human' = 'simulation',
) {
  const id = `e${w.nextId++}`;
  t.lastChange = { id, day: w.day, cause, people: [...people] };
  ensureLand(t).revision++;
  w.events.push({
    id,
    day: w.day,
    kind: 'terrain',
    actor: source,
    people: [...people],
    text: pair(`地块 (${t.x}, ${t.y})：${cause}。`, `Plot (${t.x}, ${t.y}): ${cause}.`),
    evidence: { tile: t.y * 24 + t.x, cause, before, after: landSnapshot(t), cost },
  });
}

export function landFeasibility(
  w: World,
  action: LandAction,
  tile: number,
  groupId?: string,
): string | null {
  const t = w.tiles[tile],
    spec = LAND_ACTIONS[action];
  if (!spec || !t?.explored || landOf(t).base === 'water')
    return '需要已探索的陆地 / Explored land required';
  if (t.control && t.control.groupId !== (groupId ?? w.society?.groups[0]?.id ?? 'group0'))
    return '无该群体地块的改造权 / No authority over another group’s land';
  if (
    w.buildings.some((b) => b.condition > 0 && b.x === t.x && b.y === t.y) ||
    w.plans.some(
      (p) =>
        ['planned', 'executing'].includes(p.status) &&
        ['hut', 'farm', 'workshop', 'school', 'granary'].includes(p.action) &&
        p.x === t.x &&
        p.y === t.y,
    )
  )
    return '已有建筑或工地，需先另选地块 / Existing building or site';
  if (
    w.landProjects?.some(
      (p) => p.tile === tile && ['planned', 'working', 'blocked'].includes(p.status),
    )
  )
    return '地块已有工程 / Plot already assigned';
  const land = landOf(t);
  if (
    spec.knowledge &&
    !alive(w).some((p) => (!groupId || p.groupId === groupId) && p.known.includes(spec.knowledge!))
  )
    return '缺少实际知识持有人 / Knowledge holder required';
  if (spec.tools && availableStock(w, groupId).tools < 0.1) return '缺少工具 / Tools required';
  if (action === 'clear' && t.wood < 1) return '无林木可清理 / No woodland';
  if (
    action === 'cultivate' &&
    ((land.base !== 'plain' && land.terraces < 0.99) || t.wood > 15 || t.fertility < 0.25)
  )
    return '需要清理且适宜耕作的土地 / Cleared fertile ground required';
  if (['terrace', 'level'].includes(action) && land.base !== 'hill')
    return '需要丘陵 / Hills required';
  if (action === 'road' && (t.wood > 15 || land.use === 'road'))
    return '需先清理林木或道路已存在 / Clear woodland first';
  if (action === 'cultivate' && land.use === 'field') return '已经是耕地 / Already cultivated';
  return null;
}

export function proposeLand(
  w: World,
  action: LandAction,
  tile: number,
  source: LandProject['source'],
  reason: string,
  groupId?: string,
) {
  if (!reason.trim() || reason.length > 500 || !Number.isInteger(tile))
    throw Error('需要有效目标和原因 / Target and reason required');
  if (groupId && !w.society?.groups.some((g) => g.id === groupId && g.extinct === undefined))
    throw Error('Unknown active group');
  const invalid = landFeasibility(w, action, tile, groupId);
  if (invalid) throw Error(invalid);
  if (
    (w.landProjects?.filter((p) => !['completed', 'cancelled'].includes(p.status)).length ?? 0) >= 8
  )
    throw Error('最多八项地形工程 / Eight active land projects maximum');
  const spec = LAND_ACTIONS[action],
    t = w.tiles[tile];
  const project: LandProject = {
    id: `land${w.nextId++}`,
    ...(groupId ? { groupId } : {}),
    action,
    tile,
    source,
    reason,
    created: w.day,
    status: 'planned',
    progress: 0,
    labor: spec.labor,
    cost: { ...spec.cost },
    spent: {},
    paid: false,
    workers: [],
    before: landSnapshot(t),
  };
  (w.landProjects ??= []).push(project);
  if (source === 'human') w.humanInterventions = (w.humanInterventions ?? 0) + 1;
  receipt(
    w,
    t,
    `提议 ${spec.zh} / proposed ${spec.en}: ${reason}`,
    [],
    project.before,
    project.cost,
    source === 'human' ? 'human' : 'simulation',
  );
  return project;
}

export function cancelLand(w: World, id: string) {
  const p = w.landProjects?.find((p) => p.id === id);
  if (!p || ['completed', 'cancelled'].includes(p.status))
    throw Error('工程不可取消 / Project not active');
  p.status = 'cancelled';
  p.finished = w.day;
  receipt(
    w,
    w.tiles[p.tile],
    `人工停止工程 ${id}，保留中间状态 / cancelled; partial work retained`,
    p.workers,
    p.before,
    { ...p.spent, labor: p.progress },
    'human',
  );
}

/** One person's interval: no remote effect; tools paid as work is actually performed. */
export function workLand(w: World, p: Person, dt: number): boolean {
  const project = w.landProjects?.find(
    (q) =>
      (q.groupId ?? 'group0') === (p.groupId ?? 'group0') &&
      ['planned', 'working', 'blocked'].includes(q.status) &&
      q.progress < q.labor,
  );
  if (!project) return false;
  const groupId = project.groupId;
  const spec = LAND_ACTIONS[project.action],
    t = w.tiles[project.tile];
  p.job = 'restore';
  p.activity = pair(spec.zh, spec.en);
  p.task = { phase: 'working', x: t.x, y: t.y, landProjectId: project.id };
  if (!move(w, p, t.x, t.y)) return true;
  if (
    (spec.knowledge &&
      !alive(w).some(
        (q) => (!groupId || q.groupId === groupId) && q.known.includes(spec.knowledge!),
      )) ||
    (spec.tools && availableStock(w, groupId).tools < 0.0001)
  ) {
    project.status = 'blocked';
    p.task.phase = 'waiting';
    return true;
  }
  if (!project.paid) {
    if (!pay(w, project.cost, 'spent', groupId)) {
      project.status = 'blocked';
      p.task.phase = 'waiting';
      return true;
    }
    project.paid = true;
    project.spent = { ...project.cost };
  }
  const labor = Math.min(
    project.labor - project.progress,
    dt * p.health * (0.7 + p.skills.building),
    spec.tools ? availableStock(w, groupId).tools / 0.02 : Infinity,
  );
  if (labor <= 0) return true;
  if (spec.tools) {
    if (!pay(w, { tools: labor * 0.02 }, 'consumed', groupId)) {
      project.status = 'blocked';
      p.task.phase = 'waiting';
      return true;
    }
    project.spent.tools = (project.spent.tools ?? 0) + labor * 0.02;
  }
  w.landLaborTotal ??= (w.landProjects ?? []).reduce((n, q) => n + q.progress, 0);
  w.landLaborTotal += labor;
  project.status = 'working';
  project.progress += labor;
  if (!project.workers.includes(p.id)) project.workers.push(p.id);
  project.lastLabor = { hour: actionHour(w), personId: p.id, amount: labor };
  p.lastExecution = {
    day: Math.floor(actionHour(w) / 24),
    hour: actionHour(w) % 24,
    x: p.x,
    y: p.y,
    kind: 'labor',
    amount: labor,
  };
  p.fatigue = clamp(p.fatigue + labor * 0.1);
  ensureLand(t).worked = w.day;
  const land = ensureLand(t),
    ratio = labor / project.labor,
    fraction = project.progress / project.labor;
  if (project.action === 'clear') {
    const removed = Math.min(t.wood, project.before.wood * ratio);
    t.wood -= removed;
    land.vegetation = Math.min(1, t.wood / 180);
    // Clearing material is carried to storage; never credited at a distance.
    if (removed > 0) {
      p.carrying = { resource: 'wood', amount: (p.carrying?.amount ?? 0) + removed };
      ledgerAdd(w, 'gathered', 'wood', removed);
    }
  } else if (project.action === 'reforest') {
    land.use = 'fallow';
    t.fertility = clamp(t.fertility + 0.2 * ratio);
    land.degradation = clamp(land.degradation - 0.25 * ratio);
    t.wood = Math.min(180, t.wood + 12 * ratio);
    land.vegetation = t.wood / 180;
  } else if (project.action === 'terrace')
    land.terraces = Math.min(1, project.before.terraces + fraction);
  else if (project.action === 'cultivate') t.fertility = clamp(t.fertility - 0.025 * ratio);
  if (fraction >= 1 - 1e-9) {
    if (project.action === 'road') land.use = 'road';
    if (project.action === 'cultivate' || project.action === 'terrace') land.use = 'field';
    if (project.action === 'level') {
      land.base = 'plain';
      land.use = 'fallow';
      land.degradation = clamp(land.degradation + 0.2);
      t.fertility = clamp(t.fertility - 0.1);
    }
    if (project.action === 'clear') land.use = 'fallow';
    t.terrain = land.base === 'hill' ? 'hill' : land.vegetation > 0.12 ? 'forest' : 'grass';
    project.progress = project.labor;
    project.status = 'completed';
    project.finished = w.day;
    receipt(
      w,
      t,
      `工程 ${project.id} 完成 ${spec.zh} / completed ${spec.en}`,
      project.workers,
      project.before,
      { ...project.spent, labor: project.progress },
    );
    for (const q of w.people) delete q.route; // topology/cost changes invalidate cached routes
  }
  return true;
}

export function extractionImpact(w: World, t: Tile, p: Person, resource: string, amount: number) {
  if (!['wood', 'stone'].includes(resource) || amount <= 0) return;
  const before = landSnapshot(t),
    oldCover = coverName(t),
    land = ensureLand(t);
  if (resource === 'wood') land.vegetation = Math.min(1, t.wood / 180);
  if (resource === 'stone') land.use = 'quarry';
  land.degradation = clamp(land.degradation + amount * (resource === 'wood' ? 0.001 : 0.0005));
  if (oldCover !== coverName(t) || (resource === 'stone' && t.stone <= 0.1))
    receipt(w, t, `${p.job}: ${oldCover} → ${coverName(t)}`, [p.id], before, {
      extracted: amount,
      resource,
    });
}

export function recoverLand(w: World) {
  for (const t of w.tiles) {
    if (!t.land || t.land.base === 'water') continue;
    const land = t.land;
    if (
      land.use === 'field' &&
      w.day - (land.worked ?? w.day) > 90 &&
      !w.buildings.some(
        (b) => b.kind === 'farm' && b.condition > 0 && b.x === t.x && b.y === t.y,
      ) &&
      !w.landProjects?.some((p) => p.tile === t.y * 24 + t.x && p.status === 'working')
    )
      land.use = 'fallow';
    if (['wild', 'fallow'].includes(land.use)) {
      land.degradation = clamp(land.degradation - 0.0002 * w.climate);
      t.wood = Math.min(180, t.wood + 0.018 * w.climate * t.fertility * (1 - land.degradation));
      land.vegetation = t.wood / 180;
    }
  }
}

export function autonomousLand(w: World) {
  if (
    w.plans.some((p) => ['planned', 'executing'].includes(p.status)) ||
    w.day % 15 ||
    w.stock.food < alive(w).length * 5 ||
    w.landProjects?.some((p) => ['planned', 'working', 'blocked'].includes(p.status))
  )
    return;
  const action: LandAction =
    w.strategy.weights.restore >= 6
      ? 'reforest'
      : w.strategy.weights.farm >= 6
        ? 'cultivate'
        : w.strategy.weights.explore >= 6
          ? 'road'
          : 'clear';
  if (action === 'clear' && w.stock.wood > 40) return;
  const candidates = w.tiles.filter((t, i) => !landFeasibility(w, action, i));
  candidates.sort((a, b) =>
    action === 'reforest'
      ? a.fertility - b.fertility
      : action === 'road'
        ? landOf(b).traffic - landOf(a).traffic
        : Math.abs(a.x - 12) + Math.abs(a.y - 8) - Math.abs(b.x - 12) - Math.abs(b.y - 8),
  );
  const t = candidates[0];
  if (t && (action !== 'road' || landOf(t).traffic > 8))
    proposeLand(
      w,
      action,
      t.y * 24 + t.x,
      'rules',
      `落实 ${w.strategy.name.zh}；食物与地块可行性检查通过 / strategy and feasibility`,
    );
}
