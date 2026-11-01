import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { SocialRules, World, age, alive } from '../../convex/civilization/model';
import { INITIAL_RULES, socialDiagnosis } from '../../convex/civilization/society';
import { publicStock } from '../../convex/civilization/economy';
import { useLocale } from '../i18n/LocaleProvider';

const choices = {
  property: [
    ['common', '公共持有', 'Common'],
    ['household', '劳动者家庭持有', 'Household'],
    ['steward', '管理者控制份额', 'Steward share'],
  ],
  distribution: [
    ['need', '按需要', 'Need'],
    ['equal', '平等份额', 'Equal'],
    ['effort', '按近期贡献', 'Recent contribution'],
  ],
  decision: [
    ['assembly', '成员共议', 'Assembly'],
    ['mandate', '可撤回授权', 'Revocable mandate'],
    ['hereditary', '家庭继任协调', 'Family succession'],
  ],
  inheritance: [
    ['common', '归还公共部分', 'Return to commons'],
    ['family', '传给子女与伴侣', 'Children and partner'],
  ],
  migration: [
    ['free', '自由迁徙', 'Free migration'],
    ['consent', '需讨论同意', 'Consent required'],
  ],
};
const names = {
  property: ['财产控制', 'Property'],
  distribution: ['产品分配', 'Distribution'],
  decision: ['决策权', 'Decision rights'],
  inheritance: ['继承', 'Inheritance'],
  migration: ['迁徙', 'Migration'],
};
export default function SocietyPanel({
  w,
  worldId,
}: {
  w: World;
  worldId: Id<'civilizationWorlds'>;
}) {
  const { locale } = useLocale(),
    zh = locale === 'zh';
  const [groupId, selectGroup] = useState(w.society?.groups[0]?.id ?? 'group0');
  const group = w.society?.groups.find((g) => g.id === groupId);
  const [rules, setRules] = useState<SocialRules>({ ...(group?.rules ?? INITIAL_RULES) });
  const population = alive(w).filter(
    (p) => (!p.groupId || p.groupId === groupId) && age(p, w.day) >= 16,
  );
  const [proposer, choose] = useState(population[0]?.id ?? ''),
    [reason, explain] = useState(''),
    [error, fail] = useState(''),
    [busy, wait] = useState(false);
  const submit = useMutation(api.civilization.socialProposal),
    diagnosis = socialDiagnosis(w);
  const save = async () => {
    wait(true);
    fail('');
    try {
      await submit({ worldId, groupId, proposer, reason, patch: JSON.stringify(rules) });
      explain('');
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e));
    } finally {
      wait(false);
    }
  };
  const commons = publicStock(w);
  return (
    <section className="civ-society-panel">
      <h2>{zh ? '群体、权利与分配' : 'Groups, rights and distribution'}</h2>
      <h3>{diagnosis.name[locale]}</h3>
      {diagnosis.evidence.map((e, i) => (
        <p key={i}>{e[locale]}</p>
      ))}
      <p>
        {zh ? '可用于共同工程的库存' : 'Inventory available for common work'}：
        {Object.entries(commons)
          .map(([r, n]) => `${r} ${n.toFixed(1)}`)
          .join(' / ')}
      </p>
      <div className="civ-cards">
        {w.society?.groups.map((g) => (
          <article className="civ-card" key={g.id}>
            <h3>
              {g.name} ·{' '}
              {g.extinct === undefined ? (zh ? '存续' : 'Active') : zh ? '已解体' : 'Dissolved'}
            </h3>
            <p>
              {g.id} · ({g.x}, {g.y}) · {zh ? '成员' : 'Members'}{' '}
              {alive(w).filter((p) => p.groupId === g.id).length} · {zh ? '协调者' : 'Coordinator'}{' '}
              {g.leader ?? '—'}
            </p>
            <p>
              {Object.entries(choices)
                .map(
                  ([key, options]) =>
                    `${names[key as keyof typeof names][zh ? 0 : 1]}：${options.find((c) => c[0] === g.rules[key as keyof SocialRules])?.[zh ? 1 : 2]}`,
                )
                .join(' · ')}
            </p>
            <p>
              {zh ? '征收比例 / 共同义务 / 信任' : 'Tax / common duties / legitimacy'}：
              {g.rules.tax.toFixed(2)} / {g.rules.obligation.toFixed(2)} / {g.legitimacy.toFixed(2)}
            </p>
            <p>
              {zh ? '独立储备' : 'Ring-fenced reserves'}：
              {Object.entries(g.treasury)
                .map(([k, n]) => `${k} ${n.toFixed(1)}`)
                .join(' / ')}
            </p>
          </article>
        ))}
      </div>
      <h3>{zh ? '制度提议' : 'Propose rules'}</h3>
      <p>
        {zh
          ? '提交后不立即生效。成员需要到场表态、投入议事劳动并支付成本；可以反对、拖延或使提议失效。'
          : 'Submission does not enact rules. Members must attend, vote, invest labor and pay costs. Proposals can fail.'}
      </p>
      <form
        className="civ-form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {w.society && (
          <label>
            {zh ? '群体' : 'Group'}
            <select
              aria-label={zh ? '制度群体' : 'Rule group'}
              value={groupId}
              onChange={(e) => {
                const g = w.society!.groups.find((g) => g.id === e.target.value)!;
                selectGroup(g.id);
                setRules({ ...g.rules });
                choose(alive(w).find((p) => p.groupId === g.id && age(p, w.day) >= 16)?.id ?? '');
              }}
            >
              {w.society.groups
                .filter((g) => g.extinct === undefined)
                .map((g) => (
                  <option value={g.id} key={g.id}>
                    {g.name}
                  </option>
                ))}
            </select>
          </label>
        )}
        <label>
          {zh ? '提议者' : 'Proposer'}
          <select
            aria-label={zh ? '制度提议者' : 'Rule proposer'}
            value={proposer}
            onChange={(e) => choose(e.target.value)}
          >
            {population.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {Object.entries(choices).map(([key, options]) => (
          <label key={key}>
            {names[key as keyof typeof names][zh ? 0 : 1]}
            <select
              aria-label={names[key as keyof typeof names][zh ? 0 : 1]}
              value={String(rules[key as keyof SocialRules])}
              onChange={(e) => setRules({ ...rules, [key]: e.target.value })}
            >
              {options.map((c) => (
                <option value={c[0]} key={c[0]}>
                  {c[zh ? 1 : 2]}
                </option>
              ))}
            </select>
          </label>
        ))}
        {(['tax', 'obligation'] as const).map((key) => (
          <label key={key}>
            {key === 'tax' ? (zh ? '征收比例' : 'Tax share') : zh ? '共同义务' : 'Common duties'}
            <input
              aria-label={key}
              type="number"
              min={0}
              max={key === 'tax' ? 0.8 : 1}
              step={0.05}
              value={rules[key]}
              onChange={(e) => setRules({ ...rules, [key]: +e.target.value })}
            />
          </label>
        ))}
        <label>
          {zh ? '制度提议原因' : 'Rule proposal reason'}
          <input
            aria-label={zh ? '制度提议原因' : 'Rule proposal reason'}
            value={reason}
            onChange={(e) => explain(e.target.value)}
            required
            maxLength={500}
          />
        </label>
        <button disabled={busy || !proposer || !reason.trim()}>
          {zh ? '提交议事并记录人工影响' : 'Propose for deliberation'}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      <ol className="civ-mini-timeline">
        {w.society?.proposals
          .slice()
          .reverse()
          .map((p) => (
            <li key={p.id}>
              <strong>
                {p.id} · {p.groupId} · {p.status}
              </strong>
              <p>{p.reason}</p>
              <progress value={p.progress} max={p.labor} />
              <p>
                {zh ? '现场劳动' : 'On-site deliberation'} {p.progress.toFixed(2)}/
                {p.labor.toFixed(2)} · {zh ? '支持' : 'For'} {p.supporters.join(', ') || '—'} ·{' '}
                {zh ? '反对' : 'Against'} {p.opponents.join(', ') || '—'}
              </p>
              <p>
                {zh ? '已付材料' : 'Paid materials'}：{JSON.stringify(p.spent)}
              </p>
            </li>
          ))}
      </ol>
      <h3>{zh ? '实际持有者' : 'Actual property holders'}</h3>
      {alive(w)
        .filter((p) => p.assets && Object.values(p.assets).some((n) => n > 0.01))
        .map((p) => (
          <p key={p.id}>
            {p.name} · {p.groupId} ·{' '}
            {Object.entries(p.assets!)
              .map(([r, n]) => `${r} ${n.toFixed(2)}`)
              .join(' / ')}
          </p>
        ))}
    </section>
  );
}
