import { useEffect, useState } from 'react';
import { useLocale } from '../i18n/LocaleProvider';

type Policy = {
  databaseWarnBytes: number;
  freeWarnBytes: number;
  keepLast: number;
  keepDays: number;
};
type WorldStatus = {
  worldId: string;
  name: string;
  running: boolean;
  updated: number;
  onlineMs: number;
  pauseReason: string | null;
  writes: number;
  writtenChars: number;
  deleting: boolean;
};
type Backup = {
  name: string;
  path: string;
  bytes: number;
  time: number;
  protected: boolean;
  candidate: boolean;
  invalid?: boolean;
  type: string;
  restore: string;
};
type Status = {
  lifecycle?: {
    logMaxBytes: number;
    logArchives: number;
    trendMaxBytes: number;
    trendArchives: number;
    tempKeepDays: number;
    backupRetention: {
      at: string;
      removed: string[];
      completed?: boolean;
      skipped?: string;
      error?: string;
      prunePending: boolean;
    } | null;
  };
  at: number;
  databaseBytes: number;
  walBytes: number;
  sharedBytes: number;
  freeBytes: number;
  backupBytes: number;
  worlds: WorldStatus[];
  policy: Policy;
  startup: {
    launchedAt: number;
    backendReadyAt?: number;
    frontendReadyAt?: number;
    backendVersion?: string;
    backendSettings?: { documentRetentionSeconds: number | null };
    status: string;
    error?: string;
    stages: { name: string; startedAt: number; finishedAt?: number }[];
  } | null;
  trend: {
    at: number;
    databaseBytes: number;
    walBytes: number;
    freeBytes: number;
    worlds: WorldStatus[];
  }[];
  backups: {
    checkedAt: number;
    entries: Backup[];
    snapshots: {
      id: string;
      time: number;
      isoTime: string;
      tags: string[];
      protected: boolean;
      candidate: boolean;
    }[];
    error: string | null;
    relatedFiles: { logBytes: number; blobBytes: number };
  };
  lastMaintenance: {
    createdAt: string;
    beforeBytes?: number;
    afterBytes?: number;
    switched?: boolean;
    protectedStateExact?: boolean;
    rollback?: string;
    typedComparison?: { tables: number; documents: number };
  } | null;
  retentionVerification: {
    versionsReclaimed: number;
    protectedStateExact: boolean;
    retentionErrors: number;
  } | null;
  maintenance: { running: boolean; stage: string; error?: string; removed?: number } | null;
  deletions: {
    _id: string;
    name: string;
    status: string;
    removed: number;
    phase: number;
    backup: string;
    error?: string;
  }[];
  audit: {
    checkedAt: string;
    obsoleteTechnicalDocumentVersions: number;
    tables: Record<string, { documents: number; jsonBytes: number }>;
  } | null;
  duplicates: { duplicateBytes: number; groups: { bytes: number; files: string[] }[] } | null;
  restore: {
    quickCheck?: string;
    protectedStateExact?: boolean;
    checkedAt?: string;
    readableSaves?: number;
  } | null;
};
const GiB = 1024 ** 3;
const bytes = (n: number) =>
  n >= GiB ? `${(n / GiB).toFixed(2)} GiB` : `${(n / 1024 ** 2).toFixed(2)} MiB`;
const duration = (n: number) =>
  `${Math.floor(n / 3600000)}:${String(Math.floor(n / 60000) % 60).padStart(2, '0')}:${String(Math.floor(n / 1000) % 60).padStart(2, '0')}`;
export default function RuntimeStorage() {
  const { locale } = useLocale(),
    zh = locale === 'zh';
  const [data, setData] = useState<Status>(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Policy>(),
    [target, setTarget] = useState(''),
    [confirmation, setConfirmation] = useState('');
  const refresh = async () => {
    try {
      const response = await fetch('/__local/runtime');
      const result: unknown = await response.json();
      if (!response.ok)
        throw Error(
          typeof result === 'object' && result && 'error' in result
            ? String(result.error)
            : '读取失败',
        );
      if (
        !result ||
        typeof result !== 'object' ||
        !('worlds' in result) ||
        !Array.isArray(result.worlds)
      )
        throw Error('运行信息格式无效');
      setData(result as Status);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 10000);
    return () => window.clearInterval(timer);
  }, []);
  const action = async (body: unknown) => {
    setBusy(true);
    try {
      const response = await fetch('/__local/runtime', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result: unknown = await response.json();
      if (!response.ok)
        throw Error(
          typeof result === 'object' && result && 'error' in result
            ? String(result.error)
            : '操作失败',
        );
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const time = (n: number) => new Date(n).toLocaleString(zh ? 'zh-CN' : 'en-US');
  const policy = form ?? data?.policy;
  return (
    <section className="civ-storage" aria-label={zh ? '运行与存储' : 'Runtime & storage'}>
      <div className="civ-section-heading">
        <h1>{zh ? '运行与存储' : 'Runtime & storage'}</h1>
        <button onClick={() => void action({ action: 'refresh' })} disabled={busy}>
          {zh ? '刷新状态' : 'Refresh'}
        </button>
      </div>
      {error && (
        <p role="alert" className="civ-danger">
          {error} <button onClick={() => void refresh()}>{zh ? '重试' : 'Retry'}</button>
        </p>
      )}
      {!data ? (
        <p role="status">
          {zh ? '正在读取本机运行与备份信息……' : 'Reading local runtime and backups…'}
        </p>
      ) : (
        <>
          {(data.databaseBytes + data.walBytes >= data.policy.databaseWarnBytes ||
            data.freeBytes <= data.policy.freeWarnBytes) && (
            <p role="alert" className="civ-danger">
              {zh
                ? '存储已达到提醒阈值，请查看备份与维护记录。'
                : 'Storage threshold reached. Review backups and maintenance.'}
            </p>
          )}
          <p role="status">
            {data.worlds.some((w) => w.running)
              ? zh
                ? '模拟正在推进'
                : 'Simulation running'
              : zh
                ? '所有文明已暂停，离线不补算。'
                : 'All civilizations paused. No offline catch-up.'}
          </p>
          <dl className="civ-storage-facts">
            <dt>{zh ? '本次启动至就绪' : 'Startup to ready'}</dt>
            <dd>
              {data.startup?.frontendReadyAt
                ? duration(data.startup.frontendReadyAt - data.startup.launchedAt)
                : zh
                  ? '尚未完成或无记录'
                  : 'Pending or unavailable'}
            </dd>
            <dt>{zh ? '后端就绪后在线' : 'Backend uptime since ready'}</dt>
            <dd>
              {data.startup?.backendReadyAt
                ? duration(data.at - data.startup.backendReadyAt)
                : zh
                  ? '无就绪时间记录'
                  : 'No ready timestamp'}
            </dd>
            <dt>{zh ? '当前页面打开' : 'Current page age'}</dt>
            <dd>{duration(Date.now() - performance.timeOrigin)}</dd>
            <dt>{zh ? '数据库文件' : 'Database file'}</dt>
            <dd>{bytes(data.databaseBytes)}</dd>
            <dt>{zh ? '写入日志及共享文件' : 'Write log & shared files'}</dt>
            <dd>{bytes(data.walBytes + data.sharedBytes)}</dd>
            <dt>{zh ? '数据库配套文件' : 'Database companion files'}</dt>
            <dd>
              {data.backups.relatedFiles
                ? bytes(data.backups.relatedFiles.blobBytes)
                : zh
                  ? '读取中'
                  : 'Loading'}
            </dd>
            <dt>{zh ? '项目运行日志' : 'Project runtime logs'}</dt>
            <dd>
              {data.backups.relatedFiles
                ? bytes(data.backups.relatedFiles.logBytes)
                : zh
                  ? '读取中'
                  : 'Loading'}
            </dd>
            <dt>{zh ? '现有备份占用' : 'Existing backups'}</dt>
            <dd>{bytes(data.backupBytes)}</dd>
            <dt>{zh ? 'E 盘可用' : 'Drive E free'}</dt>
            <dd>{bytes(data.freeBytes)}</dd>
          </dl>
          {data.lastMaintenance?.switched && (
            <details>
              <summary>{zh ? '最近存储维护结果' : 'Last storage maintenance'}</summary>
              <p>
                {new Date(data.lastMaintenance.createdAt).toLocaleString()} ·{' '}
                {data.lastMaintenance.typedComparison?.tables} {zh ? '张业务表' : 'business tables'}{' '}
                · {data.lastMaintenance.typedComparison?.documents}{' '}
                {zh ? '条记录完整核对' : 'records verified'}
              </p>
              <p>
                {bytes(data.lastMaintenance.beforeBytes ?? 0)} →{' '}
                {bytes(data.lastMaintenance.afterBytes ?? 0)}。
                {zh
                  ? '这是本次恢复去除技术负担的结果，不代表长期增长率。'
                  : 'This is the immediate restore result, not a long-term growth rate.'}
              </p>
              <p>
                {zh ? '隔离回收验证：' : 'Isolated collection test: '}
                {data.retentionVerification?.versionsReclaimed ?? 0}{' '}
                {zh
                  ? '个技术版本实际回收，保留世界一致。'
                  : 'technical versions reclaimed; protected world unchanged.'}
              </p>
              {data.startup?.backendSettings?.documentRetentionSeconds && (
                <p>
                  {zh ? '本次服务技术版本窗口：' : 'Technical version window for this service: '}
                  {data.startup.backendSettings.documentRetentionSeconds / 3600}{' '}
                  {zh ? '小时；不删除精确业务历史。' : 'hours; exact business history is retained.'}
                </p>
              )}
              <p>
                {zh ? '回滚位置：' : 'Rollback location: '}
                <code>{data.lastMaintenance.rollback}</code>
              </p>
            </details>
          )}
          <div className="civ-table-scroll">
            <table>
              <caption>{zh ? '世界运行与保存' : 'World activity & saves'}</caption>
              <thead>
                <tr>
                  {(zh
                    ? ['世界', '状态', '已记录模拟运行时长', '最后保存']
                    : ['World', 'State', 'Recorded simulation runtime', 'Last save']
                  ).map((s) => (
                    <th key={s}>{s}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.worlds.map((w) => (
                  <tr key={w.worldId}>
                    <td>{w.name}</td>
                    <td>
                      {w.deleting
                        ? zh
                          ? '删除中'
                          : 'Deleting'
                        : w.running
                          ? zh
                            ? '运行中'
                            : 'Running'
                          : w.pauseReason === 'unobserved'
                            ? zh
                              ? '无人观察，已暂停'
                              : 'Unobserved, paused'
                            : zh
                              ? '已手动暂停'
                              : 'Manually paused'}
                    </td>
                    <td>{duration(w.onlineMs)}</td>
                    <td>{time(w.updated)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="civ-muted">
            {zh
              ? '运行时长从本版启用后累计，仅计已确认执行的在线秒数；此前没有可靠记录，不从模拟年份推算。页面打开、服务在线和模拟推进分别计时。'
              : 'Runtime counts confirmed online seconds since this version. Earlier runtime is unknown. Page age, backend uptime and simulation time are measured separately.'}
          </p>
          {data.audit && (
            <details>
              <summary>
                {zh
                  ? '存档、精确历史与技术旧版本的区别'
                  : 'Current saves, exact history & technical versions'}
              </summary>
              <p>
                {zh ? '最近离线核查：' : 'Last offline audit: '}
                {new Date(data.audit.checkedAt).toLocaleString()}
              </p>
              <ul>
                <li>
                  {zh ? '当前世界与状态分块' : 'Current worlds & state parts'}：
                  {(data.audit.tables.civilizationWorlds?.documents ?? 0) +
                    (data.audit.tables.civilizationStateParts?.documents ?? 0)}{' '}
                  {zh
                    ? '条；保存准确进度与人物、资源、随机状态。'
                    : 'records; exact progress, people, resources and RNG.'}
                </li>
                <li>
                  {zh ? '精确历史记录与人物档案' : 'Exact records & person archives'}：
                  {(data.audit.tables.civilizationRecords?.documents ?? 0) +
                    (data.audit.tables.civilizationPeople?.documents ?? 0)}{' '}
                  {zh
                    ? '条；压缩后仍保留精确原文。'
                    : 'records; compression preserves exact originals.'}
                </li>
                <li>
                  {zh ? '无损历史压缩块' : 'Lossless history blocks'}：
                  {data.audit.tables.civilizationArchives?.documents ?? 0}
                </li>
                <li>
                  {zh ? '命名存档' : 'Named checkpoints'}：
                  {data.audit.tables.civilizationSaves?.documents ?? 0}
                </li>
                <li>
                  {zh ? '核查时的技术旧版本' : 'Obsolete technical document versions at audit'}：
                  {data.audit.obsoleteTechnicalDocumentVersions}{' '}
                  {zh
                    ? '条；它们由服务回收，不等同于可删除的业务历史。'
                    : 'versions; collected by the backend, separate from exact business history.'}
                </li>
              </ul>
            </details>
          )}
          <details>
            <summary>{zh ? '本次启动阶段与耗时' : 'Startup stages'}</summary>
            <ol>
              {data.startup?.stages.map((s, i) => (
                <li key={i}>
                  {s.name} · {duration((s.finishedAt ?? data.at) - s.startedAt)}
                </li>
              ))}
            </ol>
            {data.startup?.error && <p role="alert">{data.startup.error}</p>}
            <p>
              {zh
                ? '启动失败时，查看启动窗口原因，排除后重新双击 Start-AI-Town.cmd。'
                : 'After resolving a startup error, run Start-AI-Town.cmd again.'}
            </p>
          </details>
          <h3>{zh ? '实际容量记录' : 'Observed capacity'}</h3>
          <p className="civ-muted">
            {zh
              ? '服务在线时约每分钟记录一次；重启或停机期间留空，不补造样本。不把短时变化外推为日增长；备份、维护和模拟写入都可能影响磁盘余量。'
              : 'Sampled about once a minute while online, with gaps during shutdown. No fabricated samples or daily growth extrapolation. Backups, maintenance and simulation writes can all affect free space.'}
          </p>
          <div className="civ-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{zh ? '采样时间' : 'Sample time'}</th>
                  <th>{zh ? '数据库与写入日志' : 'Database & write log'}</th>
                  <th>{zh ? 'E 盘可用' : 'Drive E free'}</th>
                </tr>
              </thead>
              <tbody>
                {data.trend.slice(-12).map((s) => (
                  <tr key={s.at}>
                    <td>{time(s.at)}</td>
                    <td>{bytes(s.databaseBytes + s.walBytes)}</td>
                    <td>{bytes(s.freeBytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>{zh ? '容量提醒与备份保留策略' : 'Storage alerts & backup retention'}</h3>
          {policy && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void action({ action: 'policy', policy });
                setForm(undefined);
              }}
            >
              <div className="civ-inline-actions">
                {(['databaseWarnBytes', 'freeWarnBytes', 'keepLast', 'keepDays'] as const).map(
                  (key, i) => (
                    <label key={key}>
                      {
                        (zh
                          ? ['数据库提醒 (GiB)', '余量提醒 (GiB)', '至少保留份数', '至少保留天数']
                          : [
                              'Database alert (GiB)',
                              'Free space alert (GiB)',
                              'Minimum copies',
                              'Minimum days',
                            ])[i]
                      }
                      <input
                        type="number"
                        min={i < 2 ? 0 : 1}
                        step={i < 2 ? '0.01' : 1}
                        required
                        value={policy[key] / (i < 2 ? GiB : 1)}
                        onChange={(e) =>
                          setForm({
                            ...policy,
                            [key]: Math.round(Number(e.target.value) * (i < 2 ? GiB : 1)),
                          })
                        }
                      />
                    </label>
                  ),
                )}
                <button disabled={busy} type="submit">
                  {zh ? '保存策略' : 'Save policy'}
                </button>
              </div>
            </form>
          )}
          <p>
            {zh
              ? '完整备份成功后，按策略回收过期普通仓库快照；须有已验证恢复点。关键快照受保护，独立目录和 ZIP 只列预览。技术日志按大小轮换，启动时清理七天未使用的指定临时目录。'
              : 'After a successful complete backup, expired ordinary repository snapshots are reclaimed when a verified recovery point exists. Critical snapshots are protected; standalone folders and ZIPs remain preview-only. Technical logs rotate by size; designated temp files expire after seven days at startup.'}
          </p>
          {data.lifecycle && (
            <p>
              {zh
                ? `持续日志每个文件 ${bytes(data.lifecycle.logMaxBytes)}，另留 ${data.lifecycle.logArchives} 份轮换；趋势文件 ${bytes(data.lifecycle.trendMaxBytes)}，另留 ${data.lifecycle.trendArchives} 份轮换。`
                : `Continuous logs: ${bytes(data.lifecycle.logMaxBytes)} per file plus ${data.lifecycle.logArchives} archives. Trends: ${bytes(data.lifecycle.trendMaxBytes)} plus ${data.lifecycle.trendArchives} archives.`}
              {data.lifecycle.backupRetention && (
                <span>
                  {' '}
                  {data.lifecycle.backupRetention.error ||
                    data.lifecycle.backupRetention.skipped ||
                    (zh
                      ? `上次备份回收：${data.lifecycle.backupRetention.removed.length} 份。`
                      : `Last backup cleanup: ${data.lifecycle.backupRetention.removed.length} snapshots.`)}
                  {data.lifecycle.backupRetention.prunePending &&
                    (zh
                      ? ' 空间整理未完成，下次备份重试。'
                      : ' Space reclamation is pending retry.')}
                </span>
              )}
            </p>
          )}
          <div className="civ-table-scroll">
            <table>
              <caption>{zh ? '备份列表与清理预览' : 'Backups & cleanup preview'}</caption>
              <thead>
                <tr>
                  <th>{zh ? '恢复点' : 'Recovery point'}</th>
                  <th>{zh ? '占用' : 'Size'}</th>
                  <th>{zh ? '保留说明' : 'Retention'}</th>
                </tr>
              </thead>
              <tbody>
                {data.backups.entries.map((b) => (
                  <tr key={b.name}>
                    <td>
                      <details>
                        <summary>{b.name}</summary>
                        <p>
                          {time(b.time)} · {b.type}
                        </p>
                        <p>{b.restore}</p>
                        <code>{b.path}</code>
                      </details>
                    </td>
                    <td>{bytes(b.bytes)}</td>
                    <td>
                      {b.invalid
                        ? zh
                          ? '不完整，禁止恢复'
                          : 'Incomplete; do not restore'
                        : b.protected
                          ? zh
                            ? '关键备份，受保护'
                            : 'Protected'
                          : b.candidate
                            ? zh
                              ? '拟清理，尚未删除'
                              : 'Candidate, retained'
                            : zh
                              ? '策略保留'
                              : 'Retained by policy'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            {zh ? '拟清理独立恢复点可释放' : 'Potential release from standalone candidates'}：
            {bytes(
              data.backups.entries.filter((b) => b.candidate).reduce((n, b) => n + b.bytes, 0),
            )}
            。
            {zh
              ? '去重仓库不按快照大小相加计算可释放量。'
              : 'Deduplicated snapshot sizes are not additive.'}
          </p>
          {data.duplicates && (
            <details>
              <summary>{zh ? '重复内容核查' : 'Duplicate content audit'}</summary>
              <p>
                {zh
                  ? '独立恢复点中，已按内容校验的重复大文件共'
                  : 'Content-verified duplicate large files across standalone recovery points: '}
                {bytes(data.duplicates.duplicateBytes)}。
                {zh
                  ? '扫描范围为大于等于 1 MiB 的文件，不含去重仓库；重复内容仍可能是必要恢复链的一部分，不自动删除。'
                  : 'Scans files ≥1 MiB, excluding the deduplicated repository. Duplicate content can still belong to a required recovery chain and is retained.'}
              </p>
            </details>
          )}
          <details>
            <summary>
              {zh ? '仓库内恢复点' : 'Repository snapshots'} ({data.backups.snapshots.length})
            </summary>
            {data.backups.error && <p>{data.backups.error}</p>}
            <ul>
              {data.backups.snapshots.map((s) => (
                <li key={s.id}>
                  {s.id.slice(0, 12)} · {new Date(s.time).toLocaleString()} · {s.tags.join(', ')} ·{' '}
                  {s.protected
                    ? zh
                      ? '受保护'
                      : 'Protected'
                    : s.candidate
                      ? zh
                        ? '拟清理，尚未删除'
                        : 'Candidate, retained'
                      : zh
                        ? '策略保留'
                        : 'Retained'}
                </li>
              ))}
            </ul>
          </details>
          <p>
            {data.restore?.protectedStateExact
              ? zh
                ? `隔离恢复已验证：数据库 ${data.restore.quickCheck}，保留世界完整状态一致，可读取存档 ${data.restore.readableSaves ?? 0} 份。`
                : 'Isolated restore verified: integrity and protected world state match.'
              : zh
                ? '本轮隔离恢复尚未完成验证；命令成功不代表可恢复。'
                : 'Isolated restore verification is pending.'}
          </p>
          <h3>{zh ? '删除世界' : 'Delete a world'}</h3>
          <p>
            {zh
              ? '删除包括当前状态、此世界的精确历史、人物档案、压缩历史块和命名存档。先生成完整恢复快照，再分批删除；失败可续作。仍被分支依赖的父世界禁止删除。'
              : 'Deletes current state, exact history, people archives, compressed blocks and named saves after a complete recovery snapshot. Dependent parent worlds cannot be deleted. Interrupted jobs can resume.'}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void action({ action: 'delete', worldId: target, confirmation });
            }}
          >
            <div className="civ-inline-actions">
              <label>
                {zh ? '待删除世界' : 'World to delete'}
                <select
                  aria-label={zh ? '待删除世界' : 'World to delete'}
                  value={target}
                  onChange={(e) => {
                    setTarget(e.target.value);
                    setConfirmation('');
                  }}
                >
                  <option value="">{zh ? '选择世界' : 'Choose world'}</option>
                  {data.worlds
                    .filter((w) => !w.deleting)
                    .map((w) => (
                      <option
                        key={w.worldId}
                        value={w.worldId}
                        disabled={w.worldId === 'mh7fm2xg8twftrfgzsvkk9bfvh8h1wn4' || w.running}
                      >
                        {w.name}
                        {w.worldId === 'mh7fm2xg8twftrfgzsvkk9bfvh8h1wn4'
                          ? zh
                            ? '（受保护）'
                            : ' (protected)'
                          : ''}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                {zh ? '输入完整世界名确认' : 'Type the full world name'}
                <input
                  aria-label={zh ? '输入完整世界名确认' : 'Type the full world name'}
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                />
              </label>
              <button
                className="civ-danger"
                type="submit"
                disabled={
                  busy ||
                  data.maintenance?.running ||
                  !target ||
                  confirmation !== data.worlds.find((w) => w.worldId === target)?.name
                }
              >
                {zh ? '备份并删除此世界' : 'Back up and delete'}
              </button>
            </div>
          </form>
          {data.maintenance && (
            <p role="status">
              {data.maintenance.stage} {data.maintenance.removed ?? ''}{' '}
              {data.maintenance.error && <span role="alert">{data.maintenance.error}</span>}
            </p>
          )}
          {data.deletions.map((j) => (
            <div key={j._id}>
              <p>
                {j.name} ·{' '}
                {j.status === 'done'
                  ? zh
                    ? '已完成逻辑删除'
                    : 'Logically deleted'
                  : zh
                    ? '未完成'
                    : 'Pending'}{' '}
                · {j.removed} {zh ? '条已处理' : 'processed'}{' '}
                {j.status !== 'done' && (
                  <button
                    disabled={busy || data.maintenance?.running}
                    onClick={() => void action({ action: 'retry', jobId: j._id })}
                  >
                    {zh ? '继续删除' : 'Resume deletion'}
                  </button>
                )}
              </p>
              {j.error && <p role="alert">{j.error}</p>}
              <details>
                <summary>{zh ? '恢复位置' : 'Recovery location'}</summary>
                <code>{j.backup}</code>
              </details>
            </div>
          ))}
          <p className="civ-muted">
            {zh
              ? '逻辑删除后，世界不可再打开；后台回收清理技术旧版本；实际数据库文件未必立即缩小，空闲页可供后续复用。恢复必须先在隔离目录验证，不能覆盖运行中的数据库。'
              : 'Logical deletion removes access. Background collection later reclaims technical versions. Database files may retain reusable free pages. Verify restores in isolation before stopping and replacing a database.'}
          </p>
        </>
      )}
    </section>
  );
}
