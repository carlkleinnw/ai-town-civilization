import path from 'node:path';

const GiB = 1024 ** 3;
export const defaultPolicy = {
  databaseWarnBytes: 4 * GiB,
  freeWarnBytes: 10 * GiB,
  keepLast: 5,
  keepDays: 14,
};
export function validatePolicy(value) {
  for (const [key, min, max] of [
    ['databaseWarnBytes', 1024 ** 2, 1024 * GiB],
    ['freeWarnBytes', 0, 1024 * GiB],
    ['keepLast', 1, 10000],
    ['keepDays', 1, 36500],
  ])
    if (!Number.isSafeInteger(value[key]) || value[key] < min || value[key] > max)
      throw new Error('保留策略或提醒阈值无效');
  return Object.fromEntries(Object.keys(defaultPolicy).map((k) => [k, value[k]]));
}
export function retentionPlan(entries, policy, now = Date.now()) {
  const sorted = [...entries].sort((a, b) => b.time - a.time);
  return sorted.map((item, index) => ({
    ...item,
    candidate:
      Number.isFinite(item.time) &&
      !item.protected &&
      index >= policy.keepLast &&
      now - item.time > policy.keepDays * 86400000,
  }));
}
export function protectedSnapshot(snapshot, registered = []) {
  return (
    registered.some((p) => p.id === snapshot.id) ||
    (snapshot.tags ?? []).some((t) => /critical|before|migration/.test(t))
  );
}
/** Only complete backups of this exact project participate; unrelated groups stay protected. */
export function snapshotRetentionPlan(snapshots, root, policy, registered = [], now = Date.now()) {
  const samePath = (p) => path.resolve(p).toLowerCase() === path.resolve(root).toLowerCase();
  const groups = new Map();
  const untouched = [];
  for (const s of snapshots) {
    const entry = { ...s, time: Date.parse(s.time), protected: protectedSnapshot(s, registered) };
    if (
      !/^[a-f0-9]{64}$/.test(s.id) ||
      !Number.isFinite(entry.time) ||
      s.paths?.length !== 1 ||
      !samePath(s.paths[0]) ||
      !s.tags?.includes('ai-town-complete')
    ) {
      untouched.push({ ...entry, protected: true, candidate: false });
      continue;
    }
    const key = s.hostname ?? '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  return [...untouched, ...[...groups.values()].flatMap((g) => retentionPlan(g, policy, now))];
}
