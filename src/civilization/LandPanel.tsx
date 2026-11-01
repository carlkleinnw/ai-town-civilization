import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { LandAction, World } from '../../convex/civilization/model';
import { LAND_ACTIONS, coverName, landFeasibility, landOf } from '../../convex/civilization/land';
import { useLocale } from '../i18n/LocaleProvider';

export default function LandPanel({
  w,
  worldId,
  tile: fixed,
}: {
  w: World;
  worldId: Id<'civilizationWorlds'>;
  tile?: number;
}) {
  const { locale } = useLocale(),
    zh = locale === 'zh';
  const [selected, select] = useState(
    fixed ?? w.tiles.findIndex((t) => t.explored && t.terrain !== 'water'),
  );
  const tile = fixed ?? selected,
    t = w.tiles[tile],
    land = landOf(t);
  const [action, choose] = useState<LandAction>('clear'),
    [reason, explain] = useState(''),
    [error, fail] = useState(''),
    [busy, wait] = useState(false);
  const [groupId, chooseGroup] = useState(w.society?.groups[0]?.id ?? 'group0');
  const submit = useMutation(api.civilization.landProject);
  const invalid = landFeasibility(w, action, tile, w.society ? groupId : undefined);
  const work = w.landProjects?.filter((p) => fixed === undefined || p.tile === tile) ?? [];
  const run = async (cancel?: string) => {
    wait(true);
    fail('');
    try {
      await submit({
        worldId,
        action,
        tile,
        reason,
        cancel,
        groupId: w.society ? groupId : undefined,
      });
      explain('');
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e));
    } finally {
      wait(false);
    }
  };
  return (
    <section className="civ-land-panel">
      <h3>{zh ? '土地与现场改造' : 'Land and on-site work'}</h3>
      {w.society && (
        <label>
          {zh ? '工程所属群体' : 'Project group'}
          <select
            aria-label={zh ? '工程所属群体' : 'Project group'}
            value={groupId}
            onChange={(e) => chooseGroup(e.target.value)}
          >
            {w.society.groups
              .filter((g) => g.extinct === undefined)
              .map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
          </select>
        </label>
      )}
      {fixed === undefined && (
        <label>
          {zh ? '目标地块' : 'Target plot'}
          <select
            aria-label={zh ? '目标地块' : 'Target plot'}
            value={tile}
            onChange={(e) => select(+e.target.value)}
          >
            {w.tiles.map(
              (t, i) =>
                t.explored &&
                t.terrain !== 'water' && (
                  <option key={i} value={i}>
                    ({t.x}, {t.y}) · {t.terrain}
                  </option>
                ),
            )}
          </select>
        </label>
      )}
      <p>
        {zh ? '基础地貌 / 植被 / 用途' : 'Base / cover / use'}：{land.base} / {coverName(t)} (
        {Math.round(land.vegetation * 100)}%) / {land.use}
      </p>
      <p>
        {zh ? '退化 / 梯田' : 'Degradation / terraces'}：{Math.round(land.degradation * 100)}% /{' '}
        {Math.round(land.terraces * 100)}%
      </p>
      <p className="civ-muted">
        {zh
          ? '提议需要人物接受并到场；林木先进入携带，运回才入库。停止工程会保留已做的工作和已付成本。'
          : 'Proposals require willing people on site. Timber is carried before delivery. Cancellation retains work and costs.'}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <label>
          {zh ? '改造行动' : 'Land action'}
          <select
            aria-label={zh ? '改造行动' : 'Land action'}
            value={action}
            onChange={(e) => choose(e.target.value as LandAction)}
          >
            {Object.entries(LAND_ACTIONS).map(([id, s]) => (
              <option value={id} key={id}>
                {s[locale]}
              </option>
            ))}
          </select>
        </label>
        <p>
          {LAND_ACTIONS[action].labor} {zh ? '人日劳动；材料' : 'labor-days; materials'}：
          {Object.entries(LAND_ACTIONS[action].cost)
            .map(([k, n]) => `${k} ${n}`)
            .join(' / ') || '0'}
          {LAND_ACTIONS[action].tools &&
            (zh ? '；每人日另消耗 0.02 工具' : '; 0.02 tools per labor-day')}
        </p>
        <label>
          {zh ? '提议原因' : 'Proposal reason'}
          <input
            aria-label={zh ? '提议原因' : 'Proposal reason'}
            value={reason}
            onChange={(e) => explain(e.target.value)}
            maxLength={500}
            required
          />
        </label>
        {invalid && <p className="civ-muted">{invalid}</p>}
        <button disabled={busy || !!invalid || !reason.trim()}>
          {zh ? '提出工程并记录人工影响' : 'Propose and record human influence'}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      <ol className="civ-mini-timeline">
        {work
          .slice()
          .reverse()
          .map((p) => (
            <li key={p.id}>
              <strong>
                {LAND_ACTIONS[p.action][locale]} ({w.tiles[p.tile].x}, {w.tiles[p.tile].y}) ·{' '}
                {p.status}
              </strong>
              <progress value={p.progress} max={p.labor} />
              <p>
                {p.progress.toFixed(2)} / {p.labor} {zh ? '人日' : 'labor-days'} ·{' '}
                {p.workers.join(', ') || (zh ? '无人到场' : 'No labor yet')}
              </p>
              <p>{p.reason}</p>
              <p>
                {zh ? '实际材料成本' : 'Actual materials'}：{JSON.stringify(p.spent)} · {p.id}
              </p>
              {!['completed', 'cancelled'].includes(p.status) && (
                <button disabled={busy} onClick={() => void run(p.id)}>
                  {zh ? '停止并保留进度' : 'Cancel, keep partial work'}
                </button>
              )}
            </li>
          ))}
      </ol>
    </section>
  );
}
