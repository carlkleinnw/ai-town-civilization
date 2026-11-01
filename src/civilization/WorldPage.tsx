import { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { Person, World, alive } from '../../convex/civilization/model';
import { ERAS, era } from '../../convex/civilization/engine';
import { useLocale } from '../i18n/LocaleProvider';
import WorldMap, { Selection } from './WorldMap';
import Inspector from './Inspector';
import TimeControls from './TimeControls';
import { date } from './text';
import { PresentationClock } from './motion';
import { RECIPES } from '../../convex/civilization/catalog';
import { worldUrl, townUrl } from './navigation';

export default function WorldPage({
  w,
  worldId,
  archived,
  busy,
  report,
  error,
  notice,
  pauseReason,
  presentation,
}: {
  w: World;
  worldId: Id<'civilizationWorlds'>;
  archived: Person[];
  busy: boolean;
  report: (work: () => Promise<unknown>) => Promise<void>;
  error: string;
  notice: string;
  pauseReason?: 'manual' | 'unobserved' | null;
  presentation?: PresentationClock;
}) {
  const { locale, setLocale } = useLocale(),
    zh = locale === 'zh';
  const [selected, select] = useState<Selection>(null);
  const historyPeople = useQuery(
    api.civilization.ancestors,
    selected?.type === 'person' ? { worldId } : 'skip',
  );
  const [following, follow] = useState(false);
  const pending = w.decisions.find((d) => d.status === 'waiting');
  return (
    <main className={`civ-app civ-world-page${selected ? ' has-inspector' : ''}`}>
      <WorldMap
        key={worldId}
        world={w}
        presentation={presentation}
        selected={selected}
        onSelect={select}
        storageKey={worldId}
        following={following}
      />
      <header className="civ-world-hud">
        <div className="civ-world-title">
          <h1>{w.name}</h1>
          <span>
            {date(w.day, locale)} · {String(w.clock?.hour ?? 0).padStart(2, '0')}:00 ·{' '}
            {ERAS[era(w)][locale]}
          </span>
        </div>
        <TimeControls {...{ w, worldId, busy, report, pauseReason }} />
        <a className="civ-primary civ-nav-link" href={worldUrl(worldId, true)}>
          {zh ? '工作台' : 'Workbench'}
          {pending ? ' •' : ''}
        </a>
        <button className="civ-language-toggle" onClick={() => setLocale(zh ? 'en' : 'zh')}>
          {zh ? 'English' : '中文'}
        </button>
      </header>
      {(error || notice) && (
        <div className="civ-world-feedback" role={error ? 'alert' : 'status'}>
          {error || notice}
        </div>
      )}
      <div className="civ-world-caption">
        <span>
          {zh ? '人口' : 'People'} {alive(w).length} · {zh ? '食物' : 'Food'}{' '}
          {w.stock.food.toFixed(0)} ·{' '}
          {zh
            ? `1×：${w.clock?.secondsPerDay ?? 120} 秒/天`
            : `1×: ${w.clock?.secondsPerDay ?? 120}s/day`}
        </span>
        <a href={townUrl(worldId)}>{zh ? '原聊天小镇（角色聊天）' : 'Original town (chat)'}</a>
      </div>
      <label className="civ-locator">
        {zh ? '定位' : 'Locate'}
        <select
          aria-label={zh ? '定位人物或建筑' : 'Locate person or building'}
          value={selected ? `${selected.type}:${selected.id}` : ''}
          onChange={(e) => {
            const [type, id] = e.target.value.split(':');
            select(type ? { type: type as 'person' | 'building' | 'plan', id } : null);
            follow(type === 'person');
          }}
        >
          <option value="">{zh ? '选择人物 / 建筑 / 工地' : 'Person / building / site'}</option>
          <optgroup label={zh ? '人物' : 'People'}>
            {alive(w).map((p) => (
              <option key={p.id} value={`person:${p.id}`}>
                {p.name} · {p.activity[locale]}
              </option>
            ))}
          </optgroup>
          <optgroup label={zh ? '建筑' : 'Buildings'}>
            {w.buildings
              .filter((b) => b.condition > 0)
              .map((b) => (
                <option key={b.id} value={`building:${b.id}`}>
                  {RECIPES[b.kind].name[locale]} ({b.x}, {b.y})
                </option>
              ))}
          </optgroup>
          <optgroup label={zh ? '工地' : 'Sites'}>
            {w.plans
              .filter(
                (p) => ['planned', 'executing'].includes(p.status) && RECIPES[p.action].building,
              )
              .map((p) => (
                <option key={p.id} value={`plan:${p.id}`}>
                  {RECIPES[p.action].name[locale]} · {Math.floor((p.progress / p.labor) * 100)}%
                </option>
              ))}
          </optgroup>
        </select>
      </label>
      {selected && (
        <div className="civ-world-inspector">
          {selected.type === 'person' && (
            <button
              className="civ-follow"
              aria-pressed={following}
              onClick={() => follow(!following)}
            >
              {following
                ? zh
                  ? '停止跟随'
                  : 'Stop following'
                : zh
                  ? '定位并跟随'
                  : 'Locate & follow'}
            </button>
          )}
          <Inspector {...{ worldId, w, selected, select }} archived={historyPeople ?? archived} />
        </div>
      )}
      {pending && (
        <a className="civ-world-pending" href={worldUrl(worldId, true)}>
          {zh ? '有重大事项等待决策，前往工作台' : 'A major decision awaits in the workbench'}
        </a>
      )}
    </main>
  );
}
