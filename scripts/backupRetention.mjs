import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import path from 'node:path';
import { snapshotRetentionPlan, validatePolicy } from './storagePolicy.mjs';

const read = (file, fallback) =>
  existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback;
/** Caller holds storage-operation.lock. Repository files are managed only through restic. */
export function applyBackupRetention(root, restic) {
  const reportFile = path.join(root, '.runtime/storage/retention.json');
  const previous = read(reportFile, {});
  const report = {
    at: new Date().toISOString(),
    removed: [],
    prunePending: previous.prunePending ?? false,
  };
  const save = () => {
    writeFileSync(reportFile + '.tmp', JSON.stringify(report, null, 2));
    renameSync(reportFile + '.tmp', reportFile);
  };
  try {
    const policy = validatePolicy(read(path.join(root, 'storage-policy.json')));
    const registered = read(path.join(root, 'storage-protected-backups.json'), {
      snapshots: [],
    }).snapshots;
    const verified = read(path.join(root, 'storage-verified-restores.json'), {
      snapshots: [],
    }).snapshots;
    const snapshots = JSON.parse(restic(['snapshots', '--json']));
    const recovery = verified.find(
      (v) =>
        v.quickCheck === 'ok' &&
        v.fileHashesVerified &&
        v.allStatesExact &&
        snapshots.some(
          (s) =>
            s.id === v.id &&
            s.paths?.length === 1 &&
            path.resolve(s.paths[0]).toLowerCase() === path.resolve(root).toLowerCase() &&
            s.tags?.includes('ai-town-complete'),
        ),
    );
    if (!recovery) {
      report.skipped = '没有已验证且仍存在的恢复点，未回收备份';
      save();
      return report;
    }
    report.recoverySnapshot = recovery.id;
    const protectedIDs = [...registered, ...verified];
    const candidates = snapshotRetentionPlan(snapshots, root, policy, protectedIDs)
      .filter((s) => s.candidate)
      .map((s) => s.id);
    if (candidates.length || report.prunePending) {
      restic(['check']);
      const fresh = snapshotRetentionPlan(
        JSON.parse(restic(['snapshots', '--json'])),
        root,
        policy,
        protectedIDs,
      ).filter((s) => s.candidate);
      report.removed = candidates.filter((id) => fresh.some((s) => s.id === id));
      // Retry pending pruning on the next backup if forget succeeds but prune fails.
      report.prunePending = true;
      save();
      if (report.removed.length) restic(['forget', ...report.removed]);
      restic(['prune']);
      restic(['check']);
      report.prunePending = false;
    }
    report.completed = true;
    save();
    return report;
  } catch (error) {
    report.error = error.message;
    save();
    throw error;
  }
}
