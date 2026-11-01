import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { ACTIONS, RECIPES, STRATEGIES } from '../../convex/civilization/catalog';
import {
  Authority,
  DecisionKind,
  Persistence,
  Strategy,
  StrategyId,
  World,
} from '../../convex/civilization/model';
import { clone } from '../../convex/civilization/engine';
import { useLocale } from '../i18n/LocaleProvider';
import { AUTH, KIND, PERSIST } from './text';

type Report = (work: () => Promise<unknown>, done?: () => void) => Promise<void>;
export function StrategyFields({
  strategy,
  setStrategy,
}: {
  strategy: Strategy;
  setStrategy: (s: Strategy) => void;
}) {
  const { locale } = useLocale(),
    zh = locale === 'zh';
  return (
    <>
      <label>
        {zh ? '发展取向' : 'Development direction'}
        <select
          aria-label={zh ? '发展取向' : 'Development direction'}
          value={strategy.id}
          onChange={(e) =>
            setStrategy(
              e.target.value === 'custom'
                ? {
                    ...clone(strategy),
                    id: 'custom',
                    name: { zh: '自定义取向', en: 'Custom direction' },
                  }
                : clone(STRATEGIES[e.target.value as Exclude<StrategyId, 'custom'>]),
            )
          }
        >
          {Object.values(STRATEGIES).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name[locale]}
            </option>
          ))}
          <option value="custom">{zh ? '自定义策略' : 'Custom strategy'}</option>
        </select>
      </label>
      {strategy.id === 'custom' && (
        <div className="civ-custom">
          <label>
            {zh ? '策略名称' : 'Strategy name'}
            <input
              required
              maxLength={60}
              value={strategy.name[locale]}
              onChange={(e) =>
                setStrategy({ ...strategy, name: { ...strategy.name, [locale]: e.target.value } })
              }
            />
          </label>
          <p>
            {zh
              ? '权重决定行动优先级，不增加产量。材料与生存条件仍然生效。'
              : 'Weights prioritize actions; they do not multiply output. Costs and survival constraints still apply.'}
          </p>
          <div className="civ-weights">
            {ACTIONS.map((a) => (
              <label key={a}>
                {RECIPES[a].name[locale]}
                <input
                  type="number"
                  min={0}
                  max={10}
                  step={0.5}
                  value={strategy.weights[a]}
                  onChange={(e) =>
                    setStrategy({
                      ...strategy,
                      weights: { ...strategy.weights, [a]: +e.target.value },
                    })
                  }
                />
              </label>
            ))}
          </div>
          <label>
            {zh ? '食物储备目标（天）' : 'Food reserve target (days)'}
            <input
              type="number"
              min={1}
              max={90}
              value={strategy.reserveDays}
              onChange={(e) => setStrategy({ ...strategy, reserveDays: +e.target.value })}
            />
          </label>
          <label>
            {zh ? '自然资源最大采收比例' : 'Maximum natural harvest fraction'}
            <input
              type="number"
              min={0.1}
              max={1}
              step={0.05}
              value={strategy.harvestLimit}
              onChange={(e) => setStrategy({ ...strategy, harvestLimit: +e.target.value })}
            />
          </label>
        </div>
      )}
      <details>
        <summary>{zh ? '这项策略如何改变行动' : 'How this strategy shapes actions'}</summary>
        <ul className="civ-weight-list">
          {ACTIONS.slice()
            .sort((a, b) => strategy.weights[b] - strategy.weights[a])
            .slice(0, 5)
            .map((a) => (
              <li key={a}>
                <span>{RECIPES[a].name[locale]}</span>
                <b>{strategy.weights[a].toFixed(1)}</b>
              </li>
            ))}
        </ul>
        <p>
          {zh
            ? '优先级还会受库存、食物压力、已有成果与个人参与影响。'
            : 'Inventory, food pressure, existing achievements and individual participation also affect priorities.'}
        </p>
      </details>
    </>
  );
}
function Modes({
  authority,
  setAuthority,
  persistence,
  setPersistence,
}: {
  authority: Authority;
  setAuthority: (a: Authority) => void;
  persistence: Persistence;
  setPersistence: (p: Persistence) => void;
}) {
  const { locale } = useLocale();
  return (
    <div className="civ-form-pair">
      <label>
        {locale === 'zh' ? '谁来作决定' : 'Who decides'}
        <select
          aria-label={locale === 'zh' ? '谁来作决定' : 'Who decides'}
          value={authority}
          onChange={(e) => setAuthority(e.target.value as Authority)}
        >
          {Object.entries(AUTH).map(([id, n]) => (
            <option key={id} value={id}>
              {n[locale]}
            </option>
          ))}
        </select>
      </label>
      <label>
        {locale === 'zh' ? '策略如何持续' : 'Strategy persistence'}
        <select
          aria-label={locale === 'zh' ? '策略如何持续' : 'Strategy persistence'}
          value={persistence}
          onChange={(e) => setPersistence(e.target.value as Persistence)}
        >
          {Object.entries(PERSIST).map(([id, n]) => (
            <option key={id} value={id}>
              {n[locale]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
export function CreateWorld({
  onCreate,
  report,
  busy,
}: {
  onCreate: (id: Id<'civilizationWorlds'>) => void;
  report: Report;
  busy: boolean;
}) {
  const { locale } = useLocale(),
    zh = locale === 'zh';
  const create = useMutation(api.civilization.create);
  const [name, setName] = useState('河谷文明'),
    [seed, setSeed] = useState('river-2026'),
    [population, setPopulation] = useState(12);
  const [strategy, setStrategy] = useState<Strategy>(clone(STRATEGIES.survival));
  const [authority, setAuthority] = useState<Authority>('ai'),
    [persistence, setPersistence] = useState<Persistence>('locked'),
    [limit, setLimit] = useState('');
  return (
    <form
      className="civ-create"
      onSubmit={(e) => {
        e.preventDefault();
        void report(async () => {
          const id = await create({
            name,
            seed,
            population,
            strategy: strategy.id,
            ...(strategy.id === 'custom' ? { custom: JSON.stringify(strategy) } : {}),
            authority,
            persistence,
            ...(limit ? { stopDay: +limit } : {}),
          });
          onCreate(id);
        });
      }}
    >
      <div className="civ-create-intro">
        <h2>{zh ? '从一群人，开始一段历史。' : 'A people. A direction. A history.'}</h2>
        <p>
          {zh
            ? '给先民一个世界，再选择他们长期坚持的方向。食物要采集，住所要建造，知识要有人传下去。'
            : 'Give the founders a world and a direction. Food must be gathered, shelters built, and knowledge passed on.'}
        </p>
        <p>
          {zh
            ? '文明可能繁荣，也可能停滞或消亡。没有预写结局。'
            : 'Civilization may flourish, stagnate or disappear. There is no scripted ending.'}
        </p>
        <div className="civ-seed-note">
          <b>{zh ? '同一种子，不同选择' : 'Same seed, different choices'}</b>
          <p>
            {zh
              ? '保存随机状态后建立分支，比较不同策略留下的后果。原聊天小镇与存档会保留。'
              : 'Branch from a saved random state and compare the consequences of different strategies. The original town is preserved.'}
          </p>
        </div>
      </div>
      <div className="civ-create-fields">
        <div className="civ-form-pair">
          <label>
            {zh ? '文明名称' : 'Civilization name'}
            <input required value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            {zh ? '随机种子' : 'Random seed'}
            <input required value={seed} maxLength={80} onChange={(e) => setSeed(e.target.value)} />
          </label>
        </div>
        <label>
          {zh ? '初始人数（4–32）' : 'Founders (4–32)'}
          <input
            type="number"
            value={population}
            min={4}
            max={32}
            onChange={(e) => setPopulation(+e.target.value)}
          />
        </label>
        <StrategyFields strategy={strategy} setStrategy={setStrategy} />
        <Modes {...{ authority, setAuthority, persistence, setPersistence }} />
        <label>
          {zh
            ? '观察期限（总天数，留空持续运行）'
            : 'Observation limit (total days; blank for continuous)'}
          <input
            type="number"
            min={1}
            max={10000000}
            value={limit}
            placeholder={zh ? '不设期限' : 'No limit'}
            onChange={(e) => setLimit(e.target.value)}
          />
        </label>
        <p className="civ-muted">
          {zh
            ? '先民具备基础采集、协作和简易制作能力，携带 160 食物；无建筑、工具、农田、集体知识和制度。新局以 1×开始，默认现实 120 秒为一天，每年 360 天；离线不补算。'
            : 'Founders can forage, cooperate and craft basic items. Starting stock: 160 food, no buildings, tools, farms, collective knowledge or institutions. Starts at 1×: 120 real seconds/day, 360 days/year. No offline catch-up.'}
        </p>
        <button className="civ-primary" disabled={busy}>
          {zh ? '创建文明' : 'Create civilization'}
        </button>
      </div>
    </form>
  );
}
export function Settings({
  w,
  worldId,
  report,
  busy,
}: {
  w: World;
  worldId: Id<'civilizationWorlds'>;
  report: Report;
  busy: boolean;
}) {
  const { locale } = useLocale(),
    zh = locale === 'zh',
    settings = useMutation(api.civilization.settings);
  const [strategy, setStrategy] = useState(clone(w.strategy)),
    [authority, setAuthority] = useState(w.authority),
    [persistence, setPersistence] = useState(w.persistence);
  const [reason, setReason] = useState(''),
    [kinds, setKinds] = useState(w.humanKinds),
    [limit, setLimit] = useState(w.stopDay?.toString() ?? '');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void report(
          () =>
            settings({
              worldId,
              strategy: JSON.stringify(strategy),
              authority,
              persistence,
              humanKinds: kinds,
              stopDay: limit ? +limit : null,
              reason,
            }),
          () => setReason(''),
        );
      }}
      className="civ-settings"
    >
      <h2>{zh ? '方向与决策权' : 'Direction & decision authority'}</h2>
      <p>
        {zh
          ? '改变取向会影响后续计划。已经开工的计划仍然需要完成或失败，历史不会被改写。'
          : 'New settings shape future plans. Active work still needs to complete or fail; history is preserved.'}
      </p>
      <StrategyFields {...{ strategy, setStrategy }} />
      <Modes {...{ authority, setAuthority, persistence, setPersistence }} />
      {authority === 'mixed' && (
        <fieldset>
          <legend>{zh ? '交给人工的节点类型' : 'Decision types requiring a human'}</legend>
          {Object.entries(KIND).map(([id, p]) => (
            <label className="civ-checkbox" key={id}>
              <input
                type="checkbox"
                checked={kinds.includes(id as DecisionKind)}
                onChange={(e) =>
                  setKinds(
                    e.target.checked
                      ? [...kinds, id as DecisionKind]
                      : kinds.filter((k) => k !== id),
                  )
                }
              />
              {p[locale]}
            </label>
          ))}
        </fieldset>
      )}
      <label>
        {zh ? '观察截止日（累计天数，留空无限）' : 'Stop at total day (blank for unlimited)'}
        <input
          type="number"
          value={limit}
          min={w.day + 1}
          onChange={(e) => setLimit(e.target.value)}
        />
      </label>
      <label>
        {zh ? '变更原因（必填）' : 'Reason for change (required)'}
        <input
          required
          value={reason}
          maxLength={500}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <button className="civ-primary" disabled={busy}>
        {zh ? '记录并应用设置' : 'Record & apply settings'}
      </button>
      <p className="civ-muted">
        {zh
          ? '长期贯彻保持核心取向；节点调整在方向/危机节点重评；自主演化允许 AI 提出新取向。每次变化都留有时间、操作者和原因。'
          : 'Commitment locks the core direction. Node mode reconsiders at direction/crisis nodes. Evolution lets AI propose new directions. All changes record time, actor and reason.'}
      </p>
    </form>
  );
}
