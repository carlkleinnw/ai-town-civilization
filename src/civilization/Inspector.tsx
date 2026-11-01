import LandPanel from './LandPanel';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { Person, World, age, alive } from '../../convex/civilization/model';
import { RECIPES, TECHS } from '../../convex/civilization/catalog';
import { useLocale } from '../i18n/LocaleProvider';
import { Selection } from './WorldMap';
import { AUTH, PERSIST, SKILL, STATUS, date } from './text';
import { constructionStage } from './scene';

const RESOURCE = {
  food: { zh: '食物', en: 'Food' },
  wood: { zh: '木材', en: 'Timber' },
  stone: { zh: '石料', en: 'Stone' },
  tools: { zh: '工具', en: 'Tools' },
};
const EXECUTION = {
  harvest: { zh: '采出', en: 'Extracted' },
  delivery: { zh: '已入库', en: 'Delivered' },
  labor: { zh: '现场劳动', en: 'On-site labor' },
  sowing: { zh: '播种', en: 'Sowing' },
  care: { zh: '照料作物', en: 'Crop care' },
  learning: { zh: '到场学习', en: 'Attended lesson' },
  rest: { zh: '到达休息地点', en: 'Reached resting place' },
};

export function PersonDetails({
  person: p,
  w,
  select,
  knownNames,
}: {
  person: Person;
  w: World;
  select: (selection: Selection) => void;
  knownNames: Map<string, string>;
}) {
  const { locale } = useLocale(),
    zh = locale === 'zh';
  const relative = (id: string) => (
    <button className="civ-link" key={id} onClick={() => select({ type: 'person', id })}>
      {knownNames.get(id) ?? id}
    </button>
  );
  return (
    <>
      <h2>
        {p.name}
        <span className="civ-status">
          {p.died === undefined ? (zh ? '在世' : 'Living') : zh ? '已故' : 'Deceased'}
        </span>
      </h2>
      <p>
        {Math.floor(age(p, w.day))} {zh ? '岁' : 'years'} ·{' '}
        {zh ? `第 ${p.generation + 1} 代` : `Generation ${p.generation + 1}`} ·{' '}
        {p.sex === 'f' ? (zh ? '女性' : 'Female') : zh ? '男性' : 'Male'}
      </p>
      <p>{p.goal[locale]}</p>
      <p className="civ-muted">ID: {p.id}</p>
      {p.died !== undefined && (
        <p className="civ-danger">
          {date(p.died, locale)} · {p.cause?.[locale]}
        </p>
      )}
      <h3>{zh ? '当下状态' : 'Current state'}</h3>
      <p>
        {p.activity[locale]} · ({p.x}, {p.y})
      </p>
      <button
        className="civ-link"
        onClick={() => select({ type: 'tile', id: String(p.y * 24 + p.x) })}
      >
        {zh ? '查看脚下地块与资源' : 'Inspect current tile and resources'}
      </button>
      {p.task && (
        <p>
          {
            {
              moving: { zh: '前往目的地', en: 'Moving' },
              working: { zh: '实际劳动', en: 'Working' },
              hauling: { zh: '搬运入库', en: 'Hauling' },
              resting: { zh: '休息', en: 'Resting' },
              family: { zh: '家庭活动', en: 'Family time' },
              waiting: { zh: '等待资源或材料', en: 'Waiting for resources or materials' },
              delivered: { zh: '本批物资已入库', en: 'Cargo delivered' },
            }[p.task.phase][locale]
          }{' '}
          → ({p.task.x}, {p.task.y})
        </p>
      )}
      {p.carrying && (
        <p>
          {zh ? '携带' : 'Carrying'}：
          {
            {
              food: { zh: '食物', en: 'Food' },
              wood: { zh: '木材', en: 'Timber' },
              stone: { zh: '石料', en: 'Stone' },
              tools: { zh: '工具', en: 'Tools' },
            }[p.carrying.resource][locale]
          }{' '}
          {p.carrying.amount.toFixed(2)} ·{' '}
          {zh ? '运回后计入公共库存' : 'Added to storage on delivery'}
        </p>
      )}
      {p.lastExecution && (
        <div className="civ-execution-receipt">
          <h3>{zh ? '最近一次实际执行' : 'Last actual execution'}</h3>
          <p>
            {date(p.lastExecution.day, locale)} · {String(p.lastExecution.hour).padStart(2, '0')}:00
            · ({p.lastExecution.x}, {p.lastExecution.y})
          </p>
          <p>
            {EXECUTION[p.lastExecution.kind][locale]}{' '}
            {p.lastExecution.resource ? RESOURCE[p.lastExecution.resource][locale] : ''}{' '}
            {p.lastExecution.amount?.toFixed(3)}
          </p>
          {p.lastExecution.planId && (
            <button
              className="civ-link"
              onClick={() => select({ type: 'plan', id: p.lastExecution!.planId! })}
            >
              {zh ? '查看对应计划' : 'Inspect associated plan'} · {p.lastExecution.planId}
            </button>
          )}
        </div>
      )}
      {p.task?.planId && (
        <button className="civ-link" onClick={() => select({ type: 'plan', id: p.task!.planId! })}>
          {zh ? '当前计划' : 'Current plan'} · {p.task.planId}
        </button>
      )}
      {w.buildings
        .filter((b) => b.x === p.x && b.y === p.y && b.condition > 0)
        .map((b) => (
          <button
            className="civ-link"
            key={b.id}
            onClick={() => select({ type: 'building', id: b.id })}
          >
            {zh ? '所在建筑：' : 'At: '}
            {RECIPES[b.kind].name[locale]}
          </button>
        ))}
      <div className="civ-vitals">
        {[
          [zh ? '健康' : 'Health', p.health],
          [zh ? '饥饿' : 'Hunger', p.hunger],
          [zh ? '疲劳' : 'Fatigue', p.fatigue],
          [zh ? '情绪' : 'Mood', p.mood],
        ].map(([label, n]) => (
          <label key={label as string}>
            {label}
            <span>{Math.round((n as number) * 100)}%</span>
            <meter min={0} max={1} value={n as number} />
          </label>
        ))}
      </div>
      <h3>{zh ? '性格与倾向' : 'Personality & inclinations'}</h3>
      <p>
        {zh ? '合作 / 好奇 / 韧性' : 'Cooperation / Curiosity / Resilience'}
        <br />
        {Object.values(p.personality)
          .map((n) => `${Math.round(n * 100)}%`)
          .join(' / ')}
      </p>
      <p>
        {zh ? '价值观：安全 / 求知 / 自主' : 'Values: Security / Learning / Autonomy'}
        <br />
        {Object.values(p.values)
          .map((n) => `${Math.round(n * 100)}%`)
          .join(' / ')}
      </p>
      <p>
        {zh ? '兴趣：' : 'Interests: '}
        {p.interests.map((k) => SKILL[k][locale]).join(' · ')}
      </p>
      <h3>{zh ? '技能与知识' : 'Skills & knowledge'}</h3>
      <dl>
        {Object.entries(p.skills).map(([k, n]) => (
          <div key={k}>
            <dt>{SKILL[k as keyof typeof SKILL][locale]}</dt>
            <dd>{Math.round(n * 100)}%</dd>
          </div>
        ))}
      </dl>
      <p>
        {p.known.map((k) => TECHS.find((t) => t.id === k)?.name[locale] ?? k).join(' · ') ||
          (zh ? '尚未掌握集体技术' : 'No collective technology learned yet')}
      </p>
      <h3>{zh ? '家庭与家谱' : 'Family & genealogy'}</h3>
      <dl>
        <div>
          <dt>{zh ? '父母' : 'Parents'}</dt>
          <dd>{p.parents.length ? p.parents.map(relative) : zh ? '创始一代' : 'Founder'}</dd>
        </div>
        <div>
          <dt>{zh ? '伴侣' : 'Partner'}</dt>
          <dd>{p.partner ? relative(p.partner) : '—'}</dd>
        </div>
        <div>
          <dt>{zh ? '子女' : 'Children'}</dt>
          <dd>{p.children.length ? p.children.map(relative) : '—'}</dd>
        </div>
      </dl>
      <h3>{zh ? '社会关系' : 'Relationships'}</h3>
      {p.relationships.map((r) => (
        <p key={r.person}>
          {relative(r.person)} · {Math.round(r.affinity * 100)}%
        </p>
      ))}
      <h3>{zh ? '重要经历' : 'Life experiences'}</h3>
      <ol className="civ-mini-timeline">
        {p.memories
          .slice()
          .reverse()
          .map((m, i) => (
            <li key={i}>
              <small>{date(m.day, locale)}</small>
              {m.text[locale]}
            </li>
          ))}
      </ol>
      {!p.memories.length && (
        <p className="civ-muted">
          {zh ? '人生刚开始，尚无重要记录。' : 'No significant memories yet.'}
        </p>
      )}
    </>
  );
}
export default function Inspector({
  worldId,
  w,
  selected,
  select,
  archived,
}: {
  worldId: Id<'civilizationWorlds'>;
  w: World;
  selected: Selection;
  select: (s: Selection) => void;
  archived: Person[];
}) {
  const { locale } = useLocale(),
    zh = locale === 'zh';
  const queried = useQuery(
    api.civilization.person,
    selected?.type === 'person' && !w.people.some((p) => p.id === selected.id)
      ? { worldId, personId: selected.id }
      : 'skip',
  );
  const p =
    selected?.type === 'person' ? (w.people.find((p) => p.id === selected.id) ?? queried) : null;
  const ruin =
    selected?.type === 'building' ? w.ruins?.find((b) => b.id === selected.id) : undefined;
  const b =
    selected?.type === 'building'
      ? (w.buildings.find((b) => b.id === selected.id) ??
        (ruin && ruin.planId
          ? {
              ...ruin,
              built: ruin.built ?? ruin.day,
              planId: ruin.planId,
              condition: 0,
              uses: undefined,
              lastUsed: undefined,
              users: [],
              cropDay: undefined,
              cropLabor: undefined,
            }
          : undefined))
      : undefined;
  const planId = selected?.type === 'plan' ? selected.id : b?.planId;
  const queriedPlan = useQuery(
    api.civilization.plan,
    planId && !w.plans.some((p) => p.id === planId) ? { worldId, planId } : 'skip',
  );
  const plan = w.plans.find((p) => p.id === planId) ?? queriedPlan;
  const names = new Map([...w.people, ...archived].map((p) => [p.id, p.name]));
  if (p)
    return (
      <aside className="civ-inspector">
        <button className="civ-close" onClick={() => select(null)}>
          {zh ? '返回观察' : 'Back to overview'}
        </button>
        <PersonDetails person={p} {...{ w, select }} knownNames={names} />
      </aside>
    );
  if (plan || b) {
    const action = plan?.action ?? b!.kind;
    return (
      <aside className="civ-inspector">
        <button className="civ-close" onClick={() => select(null)}>
          {zh ? '返回观察' : 'Back to overview'}
        </button>
        <h2>{RECIPES[action].name[locale]}</h2>
        <p className="civ-muted">ID: {b?.id ?? plan?.id}</p>
        <p>
          {b?.condition === 0
            ? zh
              ? '此处为已倒塌建筑的遗址，用途已停止。原施工记录保留如下。'
              : 'Collapsed building site; no active benefits. Original construction history follows.'
            : RECIPES[action].benefit[locale]}
        </p>
        {b && (
          <>
            <p>
              {zh ? '建成于' : 'Built'} {date(b.built, locale)}
            </p>
            <p>
              {zh ? '耐久' : 'Condition'} {Math.round(b.condition * 100)}% · ({b.x}, {b.y})
            </p>
            <p>
              {zh ? '占地 1×1 地块' : 'Footprint: 1×1 tile'} ·{' '}
              {zh ? '实际使用阶段数' : 'Recorded use phases'}：{b.uses ?? '—'}
            </p>
            <p>
              {zh ? '当前到场使用者' : 'Current on-site users'}：
              {alive(w)
                .filter(
                  (p) =>
                    p.task?.buildingId === b.id &&
                    p.x === b.x &&
                    p.y === b.y &&
                    !['moving', 'waiting'].includes(p.task.phase),
                )
                .map((p) => p.name)
                .join(' / ') || (zh ? '暂无' : 'None')}
            </p>
            {b.lastUsed !== undefined && (
              <p>
                {zh ? '最近使用' : 'Last used'}：{date(b.lastUsed, locale)} ·{' '}
                {zh ? '使用过的居民' : 'Residents who have used it'}{' '}
                {(b.users ?? []).map((id) => names.get(id) ?? id).join(' / ')}
              </p>
            )}
            {b.kind === 'workshop' && (
              <p>
                {zh
                  ? '工具制作与试验优先在此进行；到场劳动效率增加 15%，不直接产生库存或技术。'
                  : 'Crafting and experiments use this site; on-site labor is 15% more effective. No free goods or knowledge.'}
              </p>
            )}
            {b.kind === 'school' && (
              <p>
                {zh
                  ? '传授计划在此进行，需老师和学生到场，每位教师每项知识最多传授 6 人。'
                  : 'Lessons use this site and require teachers and students to attend; up to six students per teacher and knowledge item.'}
              </p>
            )}
            {b.kind === 'hut' && (
              <p>
                {zh
                  ? `提供 6 人集体庇护容量；全体覆盖 ${Math.min(alive(w).length, w.buildings.filter((b) => b.kind === 'hut' && b.condition > 0).length * 6)}/${alive(w).length}。按集体覆盖计算生存效果，尚未分配独立家庭住房。`
                  : 'Collective shelter capacity: 6 residents. Survival uses collective coverage; private household assignments are not modeled.'}
              </p>
            )}
            {b.kind === 'granary' && (
              <p>
                {zh
                  ? `储量容量 +220；当前全体食物 ${w.stock.food.toFixed(1)}`
                  : `Storage +220; collective food ${w.stock.food.toFixed(1)}`}
              </p>
            )}
            {b.kind === 'farm' && (
              <p>
                {zh ? '本轮照料劳动' : 'Crop care labor'} {(b.cropLabor ?? 0).toFixed(1)} ·{' '}
                {b.cropDay !== undefined
                  ? `${Math.max(0, 90 - (w.day - b.cropDay))} ${zh ? '天后收获' : 'days until harvest'}`
                  : zh
                    ? '等待播种'
                    : 'Awaiting sowing'}
              </p>
            )}
          </>
        )}
        {plan && (
          <>
            <span className="civ-status">{STATUS[plan.status][locale]}</span>
            {RECIPES[action].building && (
              <p>
                {zh ? '地图阶段' : 'Map stage'}：{constructionStage(plan)[locale]} · ({plan.x},{' '}
                {plan.y})
              </p>
            )}
            {plan.status !== 'completed' && (
              <p>
                {zh
                  ? '工程尚未建成，不计入住所、储藏、生产或教学收益。'
                  : 'Unfinished site: no shelter, storage, production or teaching benefits.'}
              </p>
            )}
            {plan.lastLabor && (
              <p>
                {zh ? '最近实际劳动' : 'Last actual labor'}：{date(plan.lastLabor.day, locale)} ·{' '}
                {String(plan.lastLabor.hour).padStart(2, '0')}:00 ·{' '}
                {names.get(plan.lastLabor.personId) ?? plan.lastLabor.personId} · +
                {plan.lastLabor.amount.toFixed(3)}
              </p>
            )}
            {['planned', 'executing'].includes(plan.status) && (
              <p>
                {zh ? '当前到场劳动者' : 'Workers currently on site'}：
                {alive(w)
                  .filter(
                    (p) =>
                      p.task?.planId === plan.id &&
                      p.task.phase === 'working' &&
                      p.x === plan.x &&
                      p.y === plan.y,
                  )
                  .map((p) => p.name)
                  .join(' / ') ||
                  (zh ? '暂无，进度等待实际劳动' : 'None; progress awaits actual labor')}
              </p>
            )}
            {['planned', 'executing'].includes(plan.status) && RECIPES[action].building && (
              <p>
                {zh ? '建设阶段' : 'Construction phase'}：
                {!plan.paid
                  ? zh
                    ? '材料准备，尚未扣款'
                    : 'Preparing materials; unpaid'
                  : plan.progress / plan.labor < 0.15
                    ? zh
                      ? '材料已投入，正在打地基'
                      : 'Materials invested; foundation'
                    : plan.progress / plan.labor < 0.5
                      ? zh
                        ? '搭设框架'
                        : 'Raising the frame'
                      : plan.progress / plan.labor < 0.8
                        ? zh
                          ? '砌墙与施工'
                          : 'Walls and construction'
                        : zh
                          ? '封顶与完工准备'
                          : 'Roof and finishing'}
              </p>
            )}
            {plan.humanInfluenced && (
              <p className="civ-muted">
                {zh
                  ? '本计划位于人工干预后的实验路径，不应当作完全自主发展的证据。'
                  : 'This plan belongs to a trajectory affected by human intervention, not a fully autonomous experiment.'}
              </p>
            )}
            <h3>{zh ? '计划与执行' : 'Plan & execution'}</h3>
            <p>{plan.trigger[locale]}</p>
            <p>{plan.reason[locale]}</p>
            <p>
              {zh ? '材料' : 'Materials'}:{' '}
              {Object.entries(plan.cost)
                .map(
                  ([k, n]) =>
                    `${({ food: { zh: '食物', en: 'food' }, wood: { zh: '木材', en: 'timber' }, stone: { zh: '石料', en: 'stone' }, tools: { zh: '工具', en: 'tools' } } as Record<string, { zh: string; en: string }>)[k][locale]} ${n}`,
                )
                .join(' / ') || (zh ? '无原料投入' : 'No material cost')}{' '}
              · {plan.paid ? (zh ? '已扣除' : 'Paid') : zh ? '未支付' : 'Unpaid'}
            </p>
            <progress value={plan.progress} max={plan.labor} />
            <p>
              {plan.progress.toFixed(1)} / {plan.labor} {zh ? '人日' : 'labor-days'}
            </p>
            <p>
              {zh ? '参与者' : 'Contributors'}:{' '}
              {plan.workers.map((id) => (
                <button
                  key={id}
                  className="civ-link"
                  onClick={() => select({ type: 'person', id })}
                >
                  {names.get(id) ?? id}
                </button>
              ))}
            </p>
            <h3>{zh ? '预期与实际' : 'Expected & actual'}</h3>
            <p>{plan.expected[locale]}</p>
            <p>
              {plan.outcome?.[locale] ??
                (zh ? '尚未完成，收益未兑现。' : 'Not completed; benefit not realized.')}
            </p>
          </>
        )}
        <h3>{zh ? '代价与不确定性' : 'Costs & uncertainty'}</h3>
        <p>{RECIPES[action].uncertainty[locale]}</p>
      </aside>
    );
  }
  if (selected?.type === 'tile') {
    const tile = w.tiles[+selected.id];
    if (tile)
      return (
        <aside className="civ-inspector">
          <button className="civ-close" onClick={() => select(null)}>
            {zh ? '返回观察' : 'Back to overview'}
          </button>
          <h2>
            {zh ? '地块' : 'Land tile'} ({tile.x}, {tile.y})
          </h2>
          <p>
            {
              {
                grass: { zh: '草地', en: 'Grassland' },
                forest: { zh: '林地', en: 'Forest' },
                water: { zh: '水域', en: 'Water' },
                hill: { zh: '丘陵', en: 'Hills' },
              }[tile.terrain][locale]
            }{' '}
            · {tile.explored ? (zh ? '已探索' : 'Explored') : zh ? '尚未探索' : 'Unexplored'}
          </p>
          {tile.explored && (
            <dl>
              {['food', 'wood', 'stone', 'fertility'].map((k) => (
                <div key={k}>
                  <dt>
                    {k === 'food'
                      ? zh
                        ? '野生食物'
                        : 'Wild food'
                      : k === 'wood'
                        ? zh
                          ? '林木'
                          : 'Timber'
                        : k === 'stone'
                          ? zh
                            ? '石料'
                            : 'Stone'
                          : zh
                            ? '肥力'
                            : 'Fertility'}
                  </dt>
                  <dd>{tile[k as 'food' | 'wood' | 'stone' | 'fertility'].toFixed(2)}</dd>
                </div>
              ))}
            </dl>
          )}
          {tile.explored && tile.terrain !== 'water' && (
            <LandPanel w={w} worldId={worldId} tile={+selected.id} />
          )}
          {tile.explored && tile.lastHarvest && (
            <div className="civ-execution-receipt">
              <h3>{zh ? '最近采收记录' : 'Latest extraction'}</h3>
              <p>
                {date(tile.lastHarvest.day, locale)} ·{' '}
                {String(tile.lastHarvest.hour).padStart(2, '0')}:00 ·{' '}
                {RESOURCE[tile.lastHarvest.resource][locale]} −{tile.lastHarvest.amount.toFixed(3)}
              </p>
              <button
                className="civ-link"
                onClick={() => select({ type: 'person', id: tile.lastHarvest!.personId })}
              >
                {names.get(tile.lastHarvest.personId) ?? tile.lastHarvest.personId}
              </button>
              <p>
                {zh
                  ? '从此地块采出后先计入携带，送达才进入公共库存；自然再生按日结算，石料不再生。'
                  : 'Extraction enters carried cargo first and collective stock only on delivery. Regrowth settles daily; stone does not regrow.'}
              </p>
            </div>
          )}
          {tile.x === 12 && tile.y === 8 && (
            <p>
              {zh
                ? `初始公共储藏点：食物 ${w.stock.food.toFixed(2)}、木材 ${w.stock.wood.toFixed(2)}、石料 ${w.stock.stone.toFixed(2)}。这是集体库存的抽象地点，不是已建成粮仓。`
                : `Initial collective storage: food ${w.stock.food.toFixed(2)}, timber ${w.stock.wood.toFixed(2)}, stone ${w.stock.stone.toFixed(2)}. An abstract shared stock location, not a completed granary.`}
            </p>
          )}
          {tile.explored && tile.lastRestored && (
            <p>
              {zh ? '最近休耕与育林' : 'Last land restoration'}：
              {date(tile.lastRestored.day, locale)} · {tile.lastRestored.fertilityBefore.toFixed(2)}{' '}
              → {tile.lastRestored.fertilityAfter.toFixed(2)} · {tile.lastRestored.planId}
            </p>
          )}
          {tile.explored &&
            w.buildings.some((b) => b.x === tile.x && b.y === tile.y && b.condition > 0) && (
              <p>
                {zh
                  ? '建筑角标表示此格仍存的自然资源。当前一格是抽象地块，尚未模拟建造时逐株清除植被，不能把建筑出现当作采伐产出。'
                  : 'Building corner markers show remaining natural resources. Tiles are abstract plots; construction does not simulate individual vegetation clearing or produce free timber.'}
              </p>
            )}
          {w.buildings
            .filter((b) => b.x === tile.x && b.y === tile.y && b.condition > 0)
            .map((b) => (
              <button key={b.id} onClick={() => select({ type: 'building', id: b.id })}>
                {RECIPES[b.kind].name[locale]}
              </button>
            ))}
          {w.plans
            .filter(
              (p) =>
                p.x === tile.x && p.y === tile.y && ['planned', 'executing'].includes(p.status),
            )
            .map((p) => (
              <button key={p.id} onClick={() => select({ type: 'plan', id: p.id })}>
                {RECIPES[p.action].name[locale]} · {STATUS[p.status][locale]}
              </button>
            ))}
        </aside>
      );
  }
  return (
    <aside className="civ-inspector">
      <h2>{zh ? '文明正在走向哪里' : 'Where civilization is heading'}</h2>
      <div className="civ-direction">
        <h3>{w.strategy.name[locale]}</h3>
        <p>
          {AUTH[w.authority][locale]} · {PERSIST[w.persistence][locale]}
        </p>
      </div>
      <p>
        {zh
          ? '人物会根据需求、性格和身体状况参与或拒绝集体劳动。方向保持，不代表每次都能成功。'
          : 'People may join or refuse collective work based on needs, personality and health. Commitment does not guarantee success.'}
      </p>
      <h3>{zh ? '知识的积累' : 'Knowledge accumulation'}</h3>
      {w.technologies.map((t) => {
        const def = TECHS.find((d) => d.id === t.id)!;
        return (
          <div className="civ-tech" key={t.id}>
            <span>{def.name[locale]}</span>
            <b>
              {t.lost !== undefined
                ? zh
                  ? '已失传'
                  : 'Lost'
                : t.discovered !== undefined
                  ? zh
                    ? '已掌握'
                    : 'Known'
                  : `${t.progress.toFixed(1)}/${def.threshold}`}
            </b>
            <progress value={t.progress} max={def.threshold} />
          </div>
        );
      })}
      <h3>{zh ? '制度与组织' : 'Institutions'}</h3>
      <p>
        {w.institutions.map((a) => RECIPES[a as keyof typeof RECIPES]?.name[locale]).join(' · ') ||
          (zh ? '尚未形成' : 'None established')}
      </p>
      <h3>{zh ? '观察提示' : 'Explore the world'}</h3>
      <p>
        {zh
          ? '点击地图人物、地块、建筑或施工框，查看它们真实发生的变化。完整历史可在下方追溯。'
          : 'Select a person, tile, building or construction site to inspect real changes. Explore the recorded history below.'}
      </p>
      <p className="civ-muted">
        {zh
          ? '第一阶段：在世人口上限 64；环境商队与守卫采用简化规则；尚无完整文明战争。'
          : 'Phase one: 64 living people max; simplified environmental traders and watch. Full warfare is not implemented.'}
      </p>
    </aside>
  );
}
