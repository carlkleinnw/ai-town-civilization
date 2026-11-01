import MissionsPanel from './MissionsPanel';
import SocietyPanel from './SocietyPanel';
import LandPanel from './LandPanel';
import RuntimeStorage from './RuntimeStorage';
import { useEffect, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { ACTIONS, RECIPES, STRATEGIES } from '../../convex/civilization/catalog';
import {
  Audit,
  CivEvent,
  Decision,
  Person,
  Plan,
  Resource,
  World,
  adults,
  alive,
} from '../../convex/civilization/model';
import {
  foodDays,
  ledgerError,
  shelterCapacity,
  storageCapacity,
} from '../../convex/civilization/engine';
import { useLocale } from '../i18n/LocaleProvider';
import { Selection } from './WorldMap';
import Inspector from './Inspector';
import { CreateWorld, Settings } from './Controls';
import { EVENT_KIND, KIND, STATUS, date } from './text';
import './civilization.css';
import WorldPage from './WorldPage';
import TimeControls from './TimeControls';
import { useWorldObservation } from './useWorldObservation';
import { readLocal, worldUrl, townUrl } from './navigation';

function Icon({ kind }: { kind: 'play' | 'pause' | 'save' | 'branch' | 'world' }) {
  const paths = {
    play: 'M7 4 19 12 7 20Z',
    pause: 'M6 4h4v16H6zM14 4h4v16h-4z',
    save: 'M4 3h13l4 4v14H3V3zm3 0v6h10V3M7 21v-8h10v8',
    branch: 'M6 3v12a5 5 0 0 0 5 5h7M6 11h6a5 5 0 0 0 5-5V3',
    world: 'M3 6h6l3-3 4 3h5v15h-6l-3-3-4 3H3zM9 6v13m6-13v13',
  };
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        d={paths[kind]}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="miter"
      />
    </svg>
  );
}
export default function CivilizationApp() {
  const { locale, setLocale } = useLocale(),
    zh = locale === 'zh';
  const worlds = useQuery(api.civilization.list);
  const workbench = window.location.pathname.includes('/workbench');
  const [chosen, setChosen] = useState(() => {
    try {
      return (
        new URLSearchParams(window.location.search).get('world') ??
        readLocal('civilization-world') ??
        ''
      );
    } catch {
      return '';
    }
  });
  const activeId = worlds?.find((w) => w.id === chosen)?.id as Id<'civilizationWorlds'> | undefined;
  const [creating, setCreating] = useState(false),
    [selected, setSelected] = useState<Selection>(null);
  const [tab, setTab] = useState(
      new URLSearchParams(window.location.search).get('tab') ?? 'history',
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const current = useQuery(
    api.civilization.get,
    activeId && !(workbench && tab === 'runtime') ? { worldId: activeId } : 'skip',
  );
  const archived = useQuery(
    api.civilization.ancestors,
    activeId && workbench && (tab === 'people' || selected?.type === 'person')
      ? { worldId: activeId }
      : 'skip',
  );
  const control = useMutation(api.civilization.control),
    decide = useMutation(api.civilization.decide);
  const [decisionReason, setDecisionReason] = useState(''),
    [direction, setDirection] = useState('keep');
  const w = current?.state;
  useEffect(() => {
    document.title = zh ? 'AI 人类文明演化模拟器' : 'AI Civilization Simulator';
  }, [locale]);
  useEffect(() => {
    setSelected(null);
    setDirection('keep');
    setDecisionReason('');
  }, [activeId]);
  useEffect(() => {
    if (activeId) {
      const url = new URL(window.location.href);
      url.searchParams.set('world', activeId);
      window.history.replaceState(null, '', url);
      try {
        localStorage.setItem('civilization-world', activeId);
      } catch {
        /* Storage is optional. */
      }
    }
  }, [activeId]);
  const report = async (work: () => Promise<unknown>, done?: () => void) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
      done?.();
      setNotice(zh ? '操作已保存' : 'Saved');
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message.replace(/\[CONVEX[^\]]*\]/g, '').slice(-500)
          : zh
            ? '操作失败，请重试'
            : 'Operation failed; please retry',
      );
    } finally {
      setBusy(false);
    }
  };
  const selectWorld = (id: Id<'civilizationWorlds'>) => {
    setChosen(id);
    setCreating(false);
    setSelected(null);
    setTab('history');
    const url = new URL(window.location.href);
    url.searchParams.set('world', id);
    url.searchParams.set('tab', 'history');
    window.history.pushState(null, '', url);
  };
  const pending = w?.decisions.find((d) => d.status !== 'resolved');
  if (workbench && tab === 'runtime')
    return (
      <main className="civ-app">
        <header className="civ-header">
          <span className="civ-muted">{zh ? '本机管理' : 'Local management'}</span>
          <div className="civ-top-actions">
            <a className="civ-nav-link" href={worldUrl(activeId, true)}>
              {zh ? '返回工作台' : 'Workbench'}
            </a>
            <a className="civ-nav-link" href={worldUrl(activeId)}>
              {zh ? '返回文明世界' : 'World'}
            </a>
            <button onClick={() => setLocale(zh ? 'en' : 'zh')}>{zh ? 'English' : '中文'}</button>
          </div>
        </header>
        <RuntimeStorage />
      </main>
    );
  if (!workbench && w && activeId && !creating)
    return (
      <WorldPage
        {...{ w, busy, report, error, notice }}
        worldId={activeId}
        archived={archived ?? []}
        presentation={current?.presentation}
        pauseReason={current?.pauseReason}
      />
    );
  return (
    <main className="civ-app">
      <header className="civ-header">
        <a className="civ-brand" href={worldUrl(activeId)}>
          <Icon kind="world" />
          <div>
            <h1>{zh ? 'AI 人类文明演化模拟器' : 'AI CIVILIZATION'}</h1>
            <span>{zh ? '每个时代，皆由人创造。' : 'Every era begins with people.'}</span>
          </div>
        </a>
        <div className="civ-top-actions">
          {activeId && (
            <a className="civ-nav-link civ-primary" href={worldUrl(activeId)}>
              {zh ? '进入像素世界' : 'Enter world'}
            </a>
          )}
          <a className="civ-legacy" href={townUrl(activeId)}>
            {zh ? '原聊天小镇' : 'Original town'}
          </a>
          <div className="civ-language" aria-label={zh ? '界面语言' : 'Interface language'}>
            <button aria-pressed={zh} onClick={() => setLocale('zh')}>
              中文
            </button>
            <button aria-pressed={!zh} onClick={() => setLocale('en')}>
              English
            </button>
          </div>
        </div>
      </header>
      <div className="civ-worldbar">
        <div className="civ-world-select">
          <label htmlFor="world-picker">{zh ? '世界存档' : 'Worlds'}</label>
          <select
            id="world-picker"
            aria-label={zh ? '选择世界' : 'Select world'}
            value={activeId ?? ''}
            onChange={(e) => selectWorld(e.target.value as Id<'civilizationWorlds'>)}
          >
            {!activeId && (
              <option value="">
                {zh ? '请选择世界（演示需主动选择）' : 'Choose a world (demos are opt-in)'}
              </option>
            )}
            {worlds?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {zh ? '第' : 'Day'} {item.day} {zh ? '天' : ''}
                {item.running ? (zh ? ' · 运行中' : ' · Running') : zh ? ' · 已暂停' : ' · Paused'}
              </option>
            ))}
          </select>
          <button onClick={() => setCreating(true)}>{zh ? '新建世界' : 'New world'}</button>
        </div>
        <span className="civ-muted">
          {zh
            ? '本地运行 · 自动保存 · 离线不补算'
            : 'Local simulation · Autosaved · No offline catch-up'}
        </span>
      </div>
      {(error || notice) && (
        <div
          className={error ? 'civ-feedback error' : 'civ-feedback'}
          role={error ? 'alert' : 'status'}
        >
          {error || notice}
          <button
            onClick={() => {
              setError('');
              setNotice('');
            }}
            aria-label={zh ? '关闭提示' : 'Dismiss'}
          >
            ×
          </button>
        </div>
      )}
      {worlds === undefined ? (
        <div className="civ-loading" role="status">
          {zh
            ? '正在连接本地世界……若一直停留，请运行 Start-AI-Town.cmd。'
            : 'Connecting to local worlds… If this persists, run Start-AI-Town.cmd.'}
        </div>
      ) : creating || worlds.length === 0 ? (
        <>
          <CreateWorld
            onCreate={(id) => {
              selectWorld(id);
              window.location.assign(worldUrl(id));
            }}
            {...{ report, busy }}
          />
          {worlds.length > 0 && (
            <button onClick={() => setCreating(false)}>
              {zh ? '返回当前文明' : 'Return to current world'}
            </button>
          )}
        </>
      ) : !activeId ? (
        <div className="civ-create">
          <h2>
            {zh
              ? '选择已有世界，或创建新的文明。'
              : 'Select a saved world or create a civilization.'}
          </h2>
          <p>
            {zh
              ? '演示存档需要主动选择，不会自动加载。'
              : 'Demo saves are loaded only when selected.'}
          </p>
          <button onClick={() => setCreating(true)}>
            {zh ? '创建新文明' : 'Create civilization'}
          </button>
        </div>
      ) : !w ? (
        <p role="status">{zh ? '正在读取存档……' : 'Loading world…'}</p>
      ) : (
        <>
          <section className="civ-clockbar">
            <div>
              <h2>{w.name}</h2>
              {((w.humanInterventions ?? 0) > 0 ||
                Object.values(w.ledger.injected).some((n) => n > 0)) && (
                <span className="civ-status">
                  {zh ? '含人工干预' : 'Human interventions recorded'}
                </span>
              )}
              <time>
                {date(w.day, locale)} · {String(w.clock?.hour ?? 0).padStart(2, '0')}:00
              </time>
              <span className="civ-muted">
                {' '}
                · {zh ? '累计' : 'Total'} {w.day} {zh ? '天' : 'days'}
              </span>
            </div>
            <TimeControls
              {...{ w, busy, report }}
              worldId={activeId}
              pauseReason={current?.pauseReason}
            />
            <button
              disabled={busy || w.running || !!w.endReason}
              onClick={() => void report(() => control({ worldId: activeId, step: 1 }))}
            >
              {zh ? '推进 1 天' : 'Step 1 day'}
            </button>
          </section>
          <section className="civ-statbar" aria-label={zh ? '文明状态' : 'Civilization statistics'}>
            {[
              [
                zh ? '人口' : 'Population',
                String(alive(w).length),
                `+${w.births} / −${w.deaths}`,
                zh ? '出生 / 死亡' : 'Births / deaths',
              ],
              [
                zh ? '食物' : 'Food',
                w.stock.food.toFixed(0),
                `${foodDays(w).toFixed(1)} ${zh ? '天' : 'days'}`,
                `${zh ? '储量' : 'Capacity'} ${storageCapacity(w)}`,
              ],
              [
                zh ? '健康' : 'Health',
                `${Math.round((alive(w).reduce((s, p) => s + p.health, 0) / Math.max(1, alive(w).length)) * 100)}%`,
                String(adults(w).filter((p) => p.health > 0.4 && !p.illness).length),
                zh ? '可用成年劳力' : 'Healthy adults',
              ],
              [
                zh ? '木材 / 石料' : 'Timber / stone',
                `${w.stock.wood.toFixed(0)} / ${w.stock.stone.toFixed(0)}`,
                w.stock.tools.toFixed(1),
                zh ? '工具存量' : 'Tools available',
              ],
              [
                zh ? '住所' : 'Shelter',
                `${Math.min(shelterCapacity(w), alive(w).length)} / ${alive(w).length}`,
                `${w.buildings.length}`,
                zh ? '已建成设施' : 'Completed structures',
              ],
            ].map(([label, value, sub, note]) => (
              <div className="civ-stat" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
                <small>
                  {sub} <span>{note}</span>
                </small>
              </div>
            ))}
          </section>
          {(foodDays(w) < 6 || w.endReason || (w.stopDay !== null && w.day >= w.stopDay)) && (
            <div className="civ-crisis" role="status">
              {w.endReason?.[locale] ??
                (w.stopDay !== null && w.day >= w.stopDay
                  ? zh
                    ? '已达到观察期限。可在方向设置中延长，或从存档建立分支。'
                    : 'Observation limit reached. Extend it in Direction or create a branch.'
                  : zh
                    ? `食物危机：库存仅够 ${foodDays(w).toFixed(1)} 天。人物正在应对，核心策略仍为“${w.strategy.name.zh}”。`
                    : `Food crisis: ${foodDays(w).toFixed(1)} days remaining. Core direction remains ${w.strategy.name.en}.`)}
            </div>
          )}
          {pending && (
            <section className="civ-decision">
              <div>
                <h3>
                  {pending.status === 'waiting'
                    ? zh
                      ? '等待你的决策'
                      : 'Awaiting your decision'
                    : zh
                      ? 'AI 正在评估关键节点'
                      : 'AI is reviewing a key decision'}
                </h3>
                <p>{pending.trigger[locale]}</p>
                <small>
                  {KIND[pending.kind][locale]} · {zh ? 'AI 建议：' : 'Recommended: '}
                  {RECIPES[pending.recommendation].name[locale]} ·{' '}
                  {zh ? '日常生存继续处理，不弹窗' : 'Daily survival continues without popups'}
                </small>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const action = new FormData(e.currentTarget).get('action') as string;
                  void report(
                    () =>
                      decide({
                        worldId: activeId,
                        decisionId: pending.id,
                        action,
                        reason: decisionReason,
                        ...(direction !== 'keep'
                          ? {
                              strategy: JSON.stringify(
                                STRATEGIES[direction as keyof typeof STRATEGIES],
                              ),
                            }
                          : {}),
                      }),
                    () => {
                      setDecisionReason('');
                      setDirection('keep');
                    },
                  );
                }}
              >
                <label>
                  {zh ? '具体行动（可接管）' : 'Action (human takeover)'}
                  <select name="action" defaultValue={pending.recommendation} key={pending.id}>
                    {pending.options.map((a) => (
                      <option key={a} value={a}>
                        {RECIPES[a].name[locale]}
                      </option>
                    ))}
                  </select>
                </label>
                {w.persistence !== 'locked' && (
                  <label>
                    {zh ? '发展方向' : 'Core direction'}
                    <select value={direction} onChange={(e) => setDirection(e.target.value)}>
                      <option value="keep">{zh ? '保持当前取向' : 'Keep current direction'}</option>
                      {Object.values(STRATEGIES).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name[locale]}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  {zh ? '接管理由' : 'Reason for takeover'}
                  <input
                    required
                    value={decisionReason}
                    maxLength={500}
                    onChange={(e) => setDecisionReason(e.target.value)}
                  />
                </label>
                <button disabled={busy}>{zh ? '人工决定并记录' : 'Decide & record'}</button>
              </form>
            </section>
          )}
          {selected && (
            <section className="civ-observatory civ-workbench-detail">
              <Inspector
                worldId={activeId}
                {...{ w, selected }}
                select={setSelected}
                archived={archived ?? []}
              />
            </section>
          )}
          <nav className="civ-tabs" aria-label={zh ? '文明观察面板' : 'Civilization panels'}>
            {[
              ['history', zh ? '文明编年史' : 'Chronicle'],
              ['runtime', zh ? '运行与存储' : 'Runtime & storage'],
              ['people', zh ? '人物与家谱' : 'People & families'],
              ['relations', zh ? '迁徙与外交' : 'Relations'],
              ['society', zh ? '群体与制度' : 'Society'],
              ['land', zh ? '土地改造' : 'Land'],
              ['plans', zh ? '行动与成果' : 'Plans & results'],
              ['decisions', zh ? '决策记录' : 'Decision log'],
              ['settings', zh ? '方向设置' : 'Direction'],
              ['saves', zh ? '存档与干预' : 'Saves & intervention'],
              ['compare', zh ? '实验比较' : 'Compare'],
            ].map(([id, label]) => (
              <button
                key={id}
                aria-current={tab === id ? 'page' : undefined}
                onClick={() => {
                  setTab(id);
                  const url = new URL(window.location.href);
                  url.searchParams.set('tab', id);
                  window.history.pushState(null, '', url);
                }}
              >
                {label}
              </button>
            ))}
          </nav>
          <section className="civ-lower" key={`${activeId}-${tab}`}>
            {tab === 'relations' && <MissionsPanel w={w} worldId={activeId} />}
            {tab === 'society' && <SocietyPanel w={w} worldId={activeId} />}
            {tab === 'land' && <LandPanel w={w} worldId={activeId} />}
            {tab === 'history' && <History worldId={activeId} />}
            {tab === 'runtime' && <RuntimeStorage />}
            {tab === 'people' && (
              <People
                w={w}
                archived={archived ?? []}
                select={(s) => {
                  setSelected(s);
                  document
                    .querySelector('.civ-observatory')
                    ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
                }}
              />
            )}
            {tab === 'plans' && (
              <Plans
                worldId={activeId}
                select={(s) => {
                  setSelected(s);
                  document
                    .querySelector('.civ-observatory')
                    ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
                }}
                w={w}
              />
            )}
            {tab === 'decisions' && <Decisions worldId={activeId} />}
            {tab === 'settings' && (
              <>
                <Settings key={w.revision} {...{ w, report, busy }} worldId={activeId} />
                <form
                  className="civ-clock-settings"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const seconds = Number(new FormData(e.currentTarget).get('baseline'));
                    void report(() => control({ worldId: activeId, secondsPerDay: seconds }));
                  }}
                >
                  <label>
                    {zh ? '1×下每天对应的现实秒数' : 'Real seconds per day at 1×'}
                    <input
                      key={w.clock?.secondsPerDay}
                      name="baseline"
                      type="number"
                      required
                      min={24}
                      max={3600}
                      defaultValue={w.clock?.secondsPerDay ?? 120}
                    />
                  </label>
                  <p>
                    {zh
                      ? '默认 120 秒/天，每 5 秒执行一个模拟小时；日终结算成长与生存。离线不补算。'
                      : 'Default: 120s/day, one simulated hour every 5s. Survival and aging settle at day end. No offline catch-up.'}
                  </p>
                  <button disabled={busy}>{zh ? '保存时间基准' : 'Save time baseline'}</button>
                </form>
              </>
            )}
            {tab === 'saves' && (
              <Saves {...{ w, report, busy }} worldId={activeId} selectWorld={selectWorld} />
            )}
            {tab === 'compare' && <Compare worlds={worlds} />}
          </section>
          <footer className="civ-footer">
            <span>
              {zh
                ? '规则决定结果，AI 提出选择，人类留下干预痕迹。'
                : 'Rules determine outcomes. AI proposes choices. Human interventions leave a record.'}
            </span>
            <span>
              {zh ? '种子' : 'Seed'}: {w.seed} · {zh ? '在世上限 64' : 'Living cap 64'}
            </span>
          </footer>
        </>
      )}
    </main>
  );
}

function useHistoryPage(worldId: Id<'civilizationWorlds'>, kind: string) {
  const [position, setPosition] = useState<{ worldId: string; kind: string; cursor?: string }>({
    worldId,
    kind,
  });
  const cursor =
    position.worldId === worldId && position.kind === kind ? position.cursor : undefined;
  const result = useQuery(api.civilization.historyPage, {
    worldId,
    kind,
    ...(cursor ? { cursor } : {}),
  });
  return {
    result,
    next: () => setPosition({ worldId, kind, cursor: result?.cursor ?? undefined }),
    latest: () => setPosition({ worldId, kind }),
  };
}
function HistoryPager({ page }: { page: ReturnType<typeof useHistoryPage> }) {
  const { locale } = useLocale(),
    zh = locale === 'zh';
  return (
    <div className="civ-inline-actions">
      <button onClick={page.latest}>{zh ? '回到最新' : 'Latest'}</button>
      <button disabled={!page.result?.cursor} onClick={page.next}>
        {zh ? '查看更早记录' : 'Earlier records'}
      </button>
    </div>
  );
}
function History({ worldId }: { worldId: Id<'civilizationWorlds'> }) {
  const { locale } = useLocale(),
    zh = locale === 'zh';
  const eventPage = useHistoryPage(worldId, 'event');
  const auditPage = useHistoryPage(worldId, 'audit');
  const events = eventPage.result?.page as CivEvent[] | undefined;
  const audits = auditPage.result?.page as Audit[] | undefined;
  return (
    <div className="civ-history-layout">
      <div>
        <h2>{zh ? '发生过的，才是历史。' : 'History is what actually happened.'}</h2>
        <p className="civ-muted">
          {zh
            ? '按真实结算记录。建设、试验与生育必须满足执行条件。'
            : 'Events come from simulation settlements. Construction, research and births require real conditions.'}
        </p>
        <ol className="civ-timeline">
          {events?.map((e) => (
            <li key={e.id}>
              <time>{date(e.day, locale)}</time>
              <div>
                <span className="civ-event-kind">
                  {e.actor === 'human'
                    ? zh
                      ? '人工行为'
                      : 'Human action'
                    : e.actor === 'ollama'
                      ? 'Ollama'
                      : (EVENT_KIND[e.kind]?.[locale] ?? e.kind)}
                </span>
                <p>{e.text[locale]}</p>
                {e.people.length > 0 && (
                  <small>
                    {zh ? '实际参与者' : 'Participants'}：{e.people.join(', ')}
                  </small>
                )}
                {e.evidence && (
                  <details>
                    <summary>
                      {zh ? '核对原因、前后状态与成本' : 'Inspect causes, changes and costs'}
                    </summary>
                    <pre>{JSON.stringify(e.evidence, null, 2)}</pre>
                  </details>
                )}
              </div>
            </li>
          ))}
        </ol>
        {events?.length === 0 && <p>{zh ? '暂无事件' : 'No events yet'}</p>}
        <HistoryPager page={eventPage} />
      </div>
      <div>
        <h3>{zh ? '人工与方向变更' : 'Interventions & direction changes'}</h3>
        {audits?.map((a) => (
          <details key={a.id}>
            <summary>
              {date(a.day, locale)} · {a.actor === 'human' ? (zh ? '人工' : 'Human') : 'AI'}
            </summary>
            <p>{a.reason}</p>
            <small>{a.at}</small>
            <pre>{a.before}</pre>
            <pre>{a.after}</pre>
          </details>
        ))}
        <HistoryPager page={auditPage} />
        {!audits?.length && (
          <p className="civ-muted">
            {zh ? '尚无人工干预或方向变更。' : 'No interventions or direction changes yet.'}
          </p>
        )}
      </div>
    </div>
  );
}
function People({
  w,
  archived,
  select,
}: {
  w: World;
  archived: Person[];
  select: (s: Selection) => void;
}) {
  const { locale } = useLocale(),
    zh = locale === 'zh',
    [showDead, setShowDead] = useState(false);
  const people = showDead ? archived : alive(w);
  return (
    <>
      <div className="civ-section-heading">
        <h2>{zh ? '每个人，都有一生。' : 'Every person has a life.'}</h2>
        <label className="civ-checkbox">
          <input
            type="checkbox"
            checked={showDead}
            onChange={(e) => setShowDead(e.target.checked)}
          />
          {zh
            ? '查看已故人物（最近 200 位，亲属仍可直接查阅）'
            : 'Deceased (latest 200; relatives remain directly accessible)'}
        </label>
      </div>
      <div className="civ-table-wrap">
        <table>
          <thead>
            <tr>
              {[
                zh ? '姓名' : 'Name',
                zh ? '年龄 / 世代' : 'Age / generation',
                zh ? '当前活动' : 'Activity',
                zh ? '健康' : 'Health',
                zh ? '家庭' : 'Family',
              ].map((s) => (
                <th key={s}>{s}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id}>
                <td>
                  <button className="civ-link" onClick={() => select({ type: 'person', id: p.id })}>
                    {p.name}
                  </button>
                </td>
                <td>
                  {Math.floor(((p.died ?? w.day) - p.born) / 360)} / {p.generation + 1}
                </td>
                <td>{p.activity[locale]}</td>
                <td>{Math.round(p.health * 100)}%</td>
                <td>
                  {p.children.length} {zh ? '名子女' : 'children'} ·{' '}
                  {p.parents.length
                    ? zh
                      ? '有父母记录'
                      : 'Parents recorded'
                    : zh
                      ? '创始一代'
                      : 'Founder'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!people.length && <p>{zh ? '暂无人物' : 'No people'}</p>}
      </div>
    </>
  );
}
function Plans({
  worldId,
  select,
  w,
}: {
  worldId: Id<'civilizationWorlds'>;
  select: (s: Selection) => void;
  w: World;
}) {
  const { locale } = useLocale(),
    zh = locale === 'zh';
  const page = useHistoryPage(worldId, 'plan');
  const plans = page.result?.page as Plan[] | undefined;
  const name = (key: string) =>
    key === 'food'
      ? zh
        ? '食物'
        : 'food'
      : key === 'wood'
        ? zh
          ? '木材'
          : 'wood'
        : key === 'stone'
          ? zh
            ? '石料'
            : 'stone'
          : zh
            ? '工具'
            : 'tools';
  return (
    <>
      <HistoryPager page={page} />
      <h2>{zh ? '从提议到实际成果' : 'From proposal to actual achievement'}</h2>
      <div className="civ-plans">
        {plans?.map((p) => (
          <article key={p.id} className="civ-plan-row">
            <div>
              <h3>
                {RECIPES[p.action].name[locale]}{' '}
                <span className={`civ-status ${p.status}`}>{STATUS[p.status][locale]}</span>
              </h3>
              <small>
                {date(p.created, locale)} · {p.strategyName[locale]} ·{' '}
                {p.source === 'human' ? (zh ? '人工提案' : 'Human proposal') : p.source}
                {p.humanInfluenced &&
                  (zh ? ' · 人工干预后的路径' : ' · trajectory includes human intervention')}
              </small>
              <p>{p.reason[locale]}</p>
            </div>
            <div>
              <span>
                {zh ? '成本' : 'Cost'}:{' '}
                {Object.entries(p.cost)
                  .map(([k, n]) => `${name(k)} ${n}`)
                  .join(' / ') || (zh ? '劳动与时间' : 'Labor & time')}
              </span>
              <progress value={p.progress} max={p.labor} />
              <small>
                {p.progress.toFixed(1)} / {p.labor} {zh ? '人日' : 'labor-days'} ·{' '}
                {p.workers.length} {zh ? '人参与' : 'contributors'}
              </small>
              <p>{p.outcome?.[locale] ?? p.expected[locale]}</p>
              <button onClick={() => select({ type: 'plan', id: p.id })}>
                {zh ? '查看执行详情' : 'Inspect execution'}
              </button>
            </div>
          </article>
        ))}
      </div>
      <h3>{zh ? '资源账本' : 'Resource ledger'}</h3>
      <p className="civ-muted">
        {zh
          ? '期初 + 采集 + 生产 + 人工注入 + 换入 − 消耗 − 建设投入 − 损耗 − 换出 = 公共库存 + 人物携带'
          : 'Initial + gathered + produced + injected + traded in − consumed − spent − spoiled − traded out = storage + carried supplies'}
      </p>
      <div className="civ-table-wrap">
        <table>
          <thead>
            <tr>
              <th>{zh ? '资源' : 'Resource'}</th>
              {Object.keys(w.ledger).map((k) => (
                <th key={k}>
                  {
                    (
                      {
                        initial: zh ? '期初' : 'Initial',
                        gathered: zh ? '采集' : 'Gathered',
                        produced: zh ? '生产' : 'Produced',
                        consumed: zh ? '消耗' : 'Consumed',
                        spent: zh ? '投入' : 'Spent',
                        spoiled: zh ? '损耗' : 'Spoiled',
                        injected: zh ? '人工注入' : 'Injected',
                        tradedIn: zh ? '换入' : 'Trade in',
                        tradedOut: zh ? '换出' : 'Trade out',
                      } as Record<string, string>
                    )[k]
                  }
                </th>
              ))}
              <th>{zh ? '当前' : 'Stock'}</th>
              <th>{zh ? '携带中' : 'Carried'}</th>
              <th>{zh ? '误差' : 'Error'}</th>
            </tr>
          </thead>
          <tbody>
            {(['food', 'wood', 'stone', 'tools'] as Resource[]).map((k) => (
              <tr key={k}>
                <td>{name(k)}</td>
                {Object.values(w.ledger).map((stock, i) => (
                  <td key={i}>{stock[k].toFixed(2)}</td>
                ))}
                <td>{w.stock[k].toFixed(2)}</td>
                <td>
                  {alive(w)
                    .reduce((n, p) => n + (p.carrying?.resource === k ? p.carrying.amount : 0), 0)
                    .toFixed(2)}
                </td>
                <td>{ledgerError(w)[k].toFixed(7)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
function Decisions({ worldId }: { worldId: Id<'civilizationWorlds'> }) {
  const { locale } = useLocale(),
    zh = locale === 'zh';
  const page = useHistoryPage(worldId, 'decision');
  const rows = page.result?.page as Decision[] | undefined;
  return (
    <>
      <HistoryPager page={page} />
      <h2>{zh ? '选择、理由与执行方式' : 'Choices, reasons & execution'}</h2>
      <p className="civ-muted">
        {zh
          ? '模型每个关键节点最多尝试两次。无效或超时后按既定策略回退，记录实际来源。模型不得直接写入成果。'
          : 'At most two model attempts per node. Invalid or timed-out responses fall back under the existing direction. Actual source is recorded; models cannot write achievements.'}
      </p>
      {rows?.map((d) => (
        <article className="civ-decision-row" key={d.id}>
          <div>
            <time>{date(d.day, locale)}</time>
            <h3>
              {KIND[d.kind][locale]} ·{' '}
              {d.selected ? RECIPES[d.selected].name[locale] : zh ? '待处理' : 'Pending'}
            </h3>
            <span className="civ-status">
              {d.source === 'ollama'
                ? zh
                  ? '本地模型'
                  : 'Local model'
                : d.source === 'human'
                  ? zh
                    ? '人工接管'
                    : 'Human takeover'
                  : d.source === 'rules'
                    ? zh
                      ? '规则决策/回退'
                      : 'Rules / fallback'
                    : zh
                      ? '排队中'
                      : 'Queued'}
            </span>
          </div>
          <div>
            <p>{d.trigger[locale]}</p>
            <p>{d.reason?.[locale]}</p>
            <small>
              {d.model ?? '—'}
              {d.cached ? (zh ? ' · 命中决策缓存' : ' · cached decision') : ''} · {d.attempts}{' '}
              {zh ? '次尝试' : 'attempts'}
            </small>
            {d.error && (
              <p className="civ-muted">
                {zh ? '调用异常：' : 'Model issue: '}
                {d.error}
              </p>
            )}
          </div>
        </article>
      ))}
    </>
  );
}
function Saves({
  w,
  worldId,
  report,
  busy,
  selectWorld,
}: {
  w: World;
  worldId: Id<'civilizationWorlds'>;
  report: (work: () => Promise<unknown>, done?: () => void) => Promise<void>;
  busy: boolean;
  selectWorld: (id: Id<'civilizationWorlds'>) => void;
}) {
  const { locale } = useLocale(),
    zh = locale === 'zh';
  const saves = useQuery(api.civilization.saves, { worldId }),
    save = useMutation(api.civilization.save),
    branch = useMutation(api.civilization.branch),
    intervention = useMutation(api.civilization.intervention);
  const [name, setName] = useState(''),
    [reason, setReason] = useState(''),
    [amount, setAmount] = useState(100),
    [kind, setKind] = useState<'food' | 'wood' | 'rain' | 'drought' | 'policy'>('food'),
    [action, setAction] = useState('hut');
  return (
    <div className="civ-history-layout">
      <div>
        <h2>{zh ? '保留这个时刻' : 'Preserve this moment'}</h2>
        <p>
          {zh
            ? '每次结算自动保存到 E 盘本地数据库。命名存档可用于恢复为新分支，原世界继续保留。'
            : 'Every settlement is saved in the local E-drive database. Named checkpoints restore as new branches while retaining the original.'}
        </p>
        <form
          className="civ-save-form"
          onSubmit={(e) => {
            e.preventDefault();
            void report(
              () => save({ worldId, name }),
              () => setName(''),
            );
          }}
        >
          <label>
            {zh ? '存档 / 分支名称' : 'Save / branch name'}
            <input
              required
              value={name}
              maxLength={60}
              placeholder={zh ? '如：第一次越冬前' : 'e.g. Before the first winter'}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <button disabled={busy}>
            <Icon kind="save" />
            {zh ? '保存快照' : 'Save checkpoint'}
          </button>
          <button
            type="button"
            disabled={busy || !name.trim()}
            onClick={() => void report(async () => selectWorld(await branch({ worldId, name })))}
          >
            <Icon kind="branch" />
            {zh ? '从当前建立分支' : 'Branch from now'}
          </button>
        </form>
        <button
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob(
                [
                  JSON.stringify(
                    {
                      format: 'ai-civilization-hot-snapshot-v1',
                      note: 'Current simulation state and recent history; complete archive remains in Convex database',
                      worldId,
                      state: w,
                    },
                    null,
                    2,
                  ),
                ],
                { type: 'application/json' },
              ),
            );
            const a = document.createElement('a');
            a.href = url;
            a.download = `civilization-day-${w.day}.json`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          {zh ? '导出当前快照（最近记录）' : 'Export current snapshot (recent records)'}
        </button>
        <p className="civ-muted">
          {zh
            ? '完整历史与已故人物保留在数据库。导出快照用于检查，不包含全部归档；跨电脑请备份 .convex 目录。恢复会创建分支，不覆盖当前世界。'
            : 'Full history and deceased people remain in the database. Snapshot export is for inspection, not a full archive. Back up .convex for another computer. Restore creates a branch.'}
        </p>
        <ul className="civ-saves">
          {saves?.map((s) => (
            <li key={s.id}>
              <div>
                <strong>{s.name}</strong>
                <small>
                  {date(s.day, locale)} ·{' '}
                  {new Date(s.savedAt).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US')}
                </small>
              </div>
              <button
                disabled={busy}
                onClick={() =>
                  void report(async () =>
                    selectWorld(
                      await branch({
                        worldId,
                        saveId: s.id,
                        name: `${s.name.slice(0, 40)} ${zh ? '恢复分支' : 'restored'}`,
                      }),
                    ),
                  )
                }
              >
                {zh ? '恢复为新分支' : 'Restore as branch'}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <form
        className="civ-intervention"
        onSubmit={(e) => {
          e.preventDefault();
          void report(
            () =>
              intervention({
                worldId,
                kind,
                amount,
                reason,
                ...(kind === 'policy' ? { action } : {}),
              }),
            () => setReason(''),
          );
        }}
      >
        <h2>{zh ? '人工实验干预' : 'Human intervention'}</h2>
        <p>
          {zh
            ? '所有干预单独记账，不算作 AI 自主成果。强制政策仍需实际人员、原料和工期。'
            : 'Interventions are logged separately from AI achievements. Forced policies still require workers, materials and time.'}
        </p>
        <label>
          {zh ? '干预类型' : 'Intervention type'}
          <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="food">{zh ? '注入食物' : 'Inject food'}</option>
            <option value="wood">{zh ? '注入木材' : 'Inject timber'}</option>
            <option value="rain">
              {zh ? '增加降雨（持续）' : 'Increase rainfall (persistent)'}
            </option>
            <option value="drought">
              {zh ? '施加干旱（持续）' : 'Apply drought (persistent)'}
            </option>
            <option value="policy">{zh ? '强制执行一项计划' : 'Force a plan'}</option>
          </select>
        </label>
        {kind === 'policy' ? (
          <label>
            {zh ? '行动' : 'Action'}
            <select value={action} onChange={(e) => setAction(e.target.value)}>
              {ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {RECIPES[a].name[locale]}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label>
            {zh ? '数量（天气每 100 对应 1 倍）' : 'Amount (weather: 100 = 1×)'}
            <input
              type="number"
              min={0}
              max={10000}
              value={amount}
              onChange={(e) => setAmount(+e.target.value)}
            />
          </label>
        )}
        <label>
          {zh ? '干预原因（必填）' : 'Reason (required)'}
          <textarea
            required
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <button disabled={busy}>
          {zh ? '执行并留下人工记录' : 'Apply & record as human action'}
        </button>
        <p className="civ-muted">
          {zh ? '目前气候系数' : 'Current climate factor'}: {w.climate.toFixed(2)}
        </p>
      </form>
    </div>
  );
}
function Compare({
  worlds,
}: {
  worlds: NonNullable<ReturnType<typeof useQuery<typeof api.civilization.list>>>;
}) {
  const { locale } = useLocale(),
    zh = locale === 'zh';
  const [metric, setMetric] = useState<
    | 'population'
    | 'food'
    | 'health'
    | 'knowledge'
    | 'buildings'
    | 'soil'
    | 'groups'
    | 'disputes'
    | 'landLabor'
    | 'privateFoodShare'
  >('population');
  const [ids, setIds] = useState(worlds.slice(0, 3).map((w) => w.id));
  const selected = worlds.filter((w) => ids.includes(w.id));
  const colors = ['#f2cd83', '#8dc9b3', '#b5b7f2', '#eab08b'];
  const samples = useQuery(api.civilization.comparisonSamples, {
    worldIds: selected.map((w) => w.id),
  });
  const data = selected.map((w) => ({
    ...w,
    points: samples?.find((s) => s.id === w.id)?.samples ?? [],
  }));
  const maxDay = Math.max(30, ...data.flatMap((w) => w.points.map((p) => p.day))),
    minDay = Math.min(0, ...data.flatMap((w) => w.points.map((p) => p.day)));
  const maxY = Math.max(1, ...data.flatMap((w) => w.points.map((p) => p[metric] ?? 0)));
  return (
    <>
      {selected.map((world) => (
        <ComparisonObservation key={world.id} worldId={world.id} running={world.running} />
      ))}
      <h2>{zh ? '比较路径，不做总分排名。' : 'Compare trajectories, without a total score.'}</h2>
      <p>
        {zh
          ? '相同种子代表相同初始地形与人群。策略改变后行动会消耗不同的随机序列，后续不保证逐个随机事件相同。新增指标不为旧记录补造数据。图表保留从起点至今的最多 160 个实际样本，较早记录降采样；完整月度记录仍存档。'
          : 'Identical seeds reproduce founders and terrain. Different actions consume different random sequences. Charts retain up to 160 real samples across the full time range, compacting older points. Complete monthly records remain archived.'}
      </p>
      <div className="civ-compare-options">
        {worlds.map((w) => (
          <label className="civ-checkbox" key={w.id}>
            <input
              type="checkbox"
              checked={ids.includes(w.id)}
              disabled={!ids.includes(w.id) && ids.length >= 4}
              onChange={(e) =>
                setIds(e.target.checked ? [...ids, w.id] : ids.filter((id) => id !== w.id))
              }
            />
            {w.name}
          </label>
        ))}
        <label>
          {zh ? '观察指标' : 'Metric'}
          <select value={metric} onChange={(e) => setMetric(e.target.value as typeof metric)}>
            {[
              ['groups', zh ? '存续群体' : 'Active groups'],
              ['disputes', zh ? '持续争端' : 'Sustained disputes'],
              ['landLabor', zh ? '累计地形工程劳动' : 'Total land labor'],
              ['privateFoodShare', zh ? '私人食物占比' : 'Private food share'],
              ['population', zh ? '人口' : 'Population'],
              ['food', zh ? '食物' : 'Food'],
              ['health', zh ? '健康' : 'Health'],
              ['knowledge', zh ? '知识' : 'Knowledge'],
              ['buildings', zh ? '建筑' : 'Buildings'],
              ['soil', zh ? '土地肥力' : 'Soil fertility'],
            ].map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="civ-chart">
        <svg
          viewBox="0 0 900 260"
          role="img"
          aria-label={zh ? '实际文明状态对比折线图' : 'Actual civilization state comparison'}
        >
          <path d="M50 15V220H880" stroke="#88716e" fill="none" />
          {[0, 0.5, 1].map((n) => (
            <g key={n}>
              <text x="42" y={224 - n * 200} textAnchor="end" fill="#d9c7b2" fontSize="13">
                {(maxY * n).toFixed(metric === 'health' || metric === 'soil' ? 2 : 0)}
              </text>
              <path d={`M50 ${220 - n * 200}H880`} stroke="#544346" strokeDasharray="4 4" />
            </g>
          ))}
          {data.map((w, i) => (
            <polyline
              key={w.id}
              fill="none"
              stroke={colors[i]}
              strokeWidth="2.5"
              points={w.points
                .filter((p) => p[metric] !== undefined)
                .map(
                  (p) =>
                    `${50 + ((p.day - minDay) / (maxDay - minDay)) * 830},${220 - ((p[metric] ?? 0) / maxY) * 200}`,
                )
                .join(' ')}
            />
          ))}
          <text x="50" y="250" fill="#d9c7b2" fontSize="13">
            {zh ? '第 0 天' : 'Day 0'}
          </text>
          <text x="880" y="250" textAnchor="end" fill="#d9c7b2" fontSize="13">
            {zh ? '第' : 'Day'} {maxDay} {zh ? '天' : ''}
          </text>
        </svg>
      </div>
      <div className="civ-chart-legend">
        {data.map((w, i) => (
          <span key={w.id} style={{ color: colors[i] }}>
            {w.name} · {w.strategy[locale]}
          </span>
        ))}
      </div>
      <div className="civ-table-wrap">
        <table>
          <thead>
            <tr>
              {[
                zh ? '世界 / 策略' : 'World / strategy',
                zh ? '种子' : 'Seed',
                zh ? '天数' : 'Days',
                zh ? '人口 / 生 / 死' : 'People / births / deaths',
                zh ? '食物 / 健康' : 'Food / health',
                zh ? '建筑 / 知识' : 'Buildings / knowledge',
              ].map((s) => (
                <th key={s}>{s}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {selected.map((w) => (
              <tr key={w.id}>
                <td>
                  {w.name}
                  <br />
                  <small>{w.strategy[locale]}</small>
                </td>
                <td>{w.seed}</td>
                <td>{w.day}</td>
                <td>
                  {w.population} / {w.births} / {w.deaths}
                </td>
                <td>
                  {w.food.toFixed(0)} / {Math.round(w.health * 100)}%
                </td>
                <td>
                  {w.buildings} / {w.knowledge}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="civ-muted">
        {zh
          ? '转折、干预与行动原因请切换世界，在编年史和决策记录中逐项对照。'
          : 'Switch worlds to compare turning points, interventions and decision reasons in the chronicle and decision log.'}
      </p>
    </>
  );
}

function ComparisonObservation({
  worldId,
  running,
}: {
  worldId: Id<'civilizationWorlds'>;
  running: boolean;
}) {
  useWorldObservation(worldId, running);
  return null;
}
