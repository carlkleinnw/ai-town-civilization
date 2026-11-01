import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { Mission, World, alive } from '../../convex/civilization/model';
import { useLocale } from '../i18n/LocaleProvider';

export default function MissionsPanel({
  w,
  worldId,
}: {
  w: World;
  worldId: Id<'civilizationWorlds'>;
}) {
  const { locale } = useLocale(),
    zh = locale === 'zh';
  const groups = w.society?.groups.filter((g) => g.extinct === undefined) ?? [];
  const [groupId, chooseGroup] = useState(groups[0]?.id ?? 'group0'),
    [kind, chooseKind] = useState<Mission['kind']>('migration');
  const [target, chooseTile] = useState(
    w.tiles.findIndex(
      (t) => t.explored && t.terrain === 'grass' && Math.abs(t.x - 12) + Math.abs(t.y - 8) >= 5,
    ),
  );
  const [targetGroup, chooseOther] = useState(groups[1]?.id ?? ''),
    [reason, explain] = useState(''),
    [error, fail] = useState(''),
    [busy, wait] = useState(false);
  const submit = useMutation(api.civilization.mission);
  const names = {
    migration: [zh ? '迁徙建立新聚落' : 'Settle elsewhere'],
    envoy: [zh ? '派人谈判' : 'Send envoys'],
    trade: [zh ? '实际运货交换' : 'Transport and barter'],
    raid: [zh ? '派出武装队伍' : 'Send armed party'],
  };
  const save = async () => {
    wait(true);
    fail('');
    const other = groups.find((g) => g.id === targetGroup);
    try {
      await submit({
        worldId,
        groupId,
        kind,
        target: kind === 'migration' ? target : other ? other.y * 24 + other.x : -1,
        targetGroup: kind === 'migration' ? undefined : targetGroup,
        reason,
      });
      explain('');
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e));
    } finally {
      wait(false);
    }
  };
  return (
    <section className="civ-missions-panel">
      <h2>{zh ? '迁徙、外交与冲突' : 'Migration, diplomacy and conflict'}</h2>
      <p>
        {zh
          ? '这里的群体都来自当前世界。人物先接受行动并集结，再实际领取补给、走到目的地；不连接其他实验存档。'
          : 'All groups belong to this world. People must volunteer, assemble, collect supplies and travel to their destination.'}
      </p>
      <form
        className="civ-form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label>
          {zh ? '发起群体' : 'Origin group'}
          <select
            aria-label={zh ? '发起群体' : 'Origin group'}
            value={groupId}
            onChange={(e) => chooseGroup(e.target.value)}
          >
            {groups.length ? (
              groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} · {g.id}
                </option>
              ))
            ) : (
              <option value="group0">{zh ? '河谷共同体' : 'Valley community'}</option>
            )}
          </select>
        </label>
        <label>
          {zh ? '群体行动' : 'Group action'}
          <select
            aria-label={zh ? '群体行动' : 'Group action'}
            value={kind}
            onChange={(e) => chooseKind(e.target.value as Mission['kind'])}
          >
            {Object.entries(names).map(([key, name]) => (
              <option key={key} value={key}>
                {name[0]}
              </option>
            ))}
          </select>
        </label>
        {kind === 'migration' ? (
          <label>
            {zh ? '迁徙目标' : 'Migration target'}
            <select
              aria-label={zh ? '迁徙目标' : 'Migration target'}
              value={target}
              onChange={(e) => chooseTile(+e.target.value)}
            >
              {w.tiles.map(
                (t, i) =>
                  t.explored &&
                  t.terrain !== 'water' && (
                    <option value={i} key={i}>
                      ({t.x}, {t.y}) · {zh ? '肥力' : 'Fertility'} {t.fertility.toFixed(2)}
                      {t.control ? ` · ${t.control.groupId}` : ''}
                    </option>
                  ),
              )}
            </select>
          </label>
        ) : (
          <label>
            {zh ? '交往对象' : 'Counterpart'}
            <select
              aria-label={zh ? '交往对象' : 'Counterpart'}
              value={targetGroup}
              onChange={(e) => chooseOther(e.target.value)}
            >
              <option value="">{zh ? '选择同世界群体' : 'Select a group in this world'}</option>
              {groups
                .filter((g) => g.id !== groupId)
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} · {g.id}
                  </option>
                ))}
            </select>
          </label>
        )}
        <label>
          {zh ? '行动原因' : 'Action reason'}
          <input
            aria-label={zh ? '行动原因' : 'Action reason'}
            required
            maxLength={500}
            value={reason}
            onChange={(e) => explain(e.target.value)}
          />
        </label>
        <button disabled={busy || !reason.trim()}>
          {zh ? '提出行动，由人物决定参与' : 'Propose; people decide to participate'}
        </button>
      </form>
      <p className="civ-muted">
        {zh
          ? '补给和装备在聚落集结时实际预留，消耗随行动发生，未用部分返程后退还。没有持续争端、陆上通路或足够物资时无法出征；停战和联盟会阻止攻击。'
          : 'Supplies and equipment are reserved at assembly, used during action, and unused portions returned home. Disputes, routes and provisions are required; truces and alliances prevent attacks.'}
      </p>
      {error && <p role="alert">{error}</p>}
      <h3>{zh ? '真实群体关系' : 'Actual relationships'}</h3>
      {w.society?.relations.map((r) => (
        <p key={`${r.a}:${r.b}`}>
          {r.a} ↔ {r.b} · {r.state} · {zh ? '信任 / 争端' : 'Trust / dispute'} {r.trust.toFixed(2)}{' '}
          / {r.grievance.toFixed(2)} · {zh ? '谈判 / 交换' : 'Negotiations / trades'} {r.negotiated}{' '}
          / {r.traded}
        </p>
      ))}
      <ol className="civ-mini-timeline">
        {w.society?.missions
          .slice()
          .reverse()
          .map((m) => (
            <li key={m.id}>
              <strong>
                {names[m.kind][0]} · {m.status} · {m.id}
              </strong>
              <p>{m.reason}</p>
              <p>
                {m.groupId} → {m.targetGroup ?? `(${w.tiles[m.target].x}, ${w.tiles[m.target].y})`}{' '}
                · {zh ? '参与者' : 'Participants'}{' '}
                {m.people.map((id) => w.people.find((p) => p.id === id)?.name ?? id).join(', ')}
              </p>
              <p>
                {zh ? '在途补给 / 装备' : 'Provisions / equipment'} {m.supplies.toFixed(2)} /{' '}
                {m.equipment.toFixed(2)} · {zh ? '货物' : 'Cargo'}{' '}
                {Object.entries(m.cargo)
                  .filter(([, n]) => n > 0.01)
                  .map(([r, n]) => `${r} ${n.toFixed(2)}`)
                  .join(' / ') || '0'}
              </p>
              <p>
                {zh ? '预留减返还的净支出' : 'Reserved less returned costs'}：
                {Object.entries(m.spent)
                  .filter(([, n]) => Math.abs(n) > 0.001)
                  .map(([r, n]) => `${r} ${n.toFixed(2)}`)
                  .join(' / ') || '0'}
              </p>
              <p>
                {zh ? '伤退 / 死亡' : 'Withdrawn / dead'}：{m.losses.join(', ') || '0'} /{' '}
                {m.casualties.join(', ') || '0'}
                {m.childGroup ? ` · ${zh ? '形成群体' : 'Formed group'} ${m.childGroup}` : ''}
              </p>
            </li>
          ))}
      </ol>
      <p>
        {zh ? '在世人口' : 'Living population'}：{alive(w).length} ·{' '}
        {zh ? '历史死亡' : 'Recorded deaths'} {w.deaths}
      </p>
    </section>
  );
}
