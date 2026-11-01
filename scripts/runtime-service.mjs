import { readFile, writeFile, mkdir, readdir, stat, statfs, unlink, open } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import { convexToJson } from 'convex/values';
import { createHash, randomUUID } from 'node:crypto';
import { appendBounded, appendLog, logLimit, trendLimit } from './storageLifecycle.mjs';
import {
  defaultPolicy,
  validatePolicy,
  retentionPlan,
  snapshotRetentionPlan,
} from './storagePolicy.mjs';
export { defaultPolicy, validatePolicy, retentionPlan } from './storagePolicy.mjs';

const execute = promisify(execFile);
async function json(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return fallback;
    throw e;
  }
}
async function size(file) {
  try {
    return (await stat(file)).size;
  } catch (e) {
    if (e.code === 'ENOENT') return 0;
    throw e;
  }
}
export async function trendTail(file) {
  let rows = [],
    budget = 8 * 1024 ** 2;
  for (let index = 0; index <= trendLimit.keep && budget > 0 && rows.length < 1440; index++) {
    let handle;
    try {
      handle = await open(index ? `${file}.${index}` : file, 'r');
      const info = await handle.stat(),
        start = Math.max(0, info.size - budget);
      const buffer = Buffer.alloc(info.size - start);
      await handle.read(buffer, 0, buffer.length, start);
      budget -= buffer.length;
      const lines = buffer.toString('utf8').trimEnd().split('\n');
      if (start) lines.shift();
      rows = [
        ...lines.filter(Boolean).flatMap((line) => {
          try {
            return [JSON.parse(line)];
          } catch {
            return [];
          }
        }),
        ...rows,
      ];
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    } finally {
      await handle?.close();
    }
  }
  return rows.slice(-1440);
}
async function treeSize(file) {
  const info = await stat(file);
  if (!info.isDirectory()) return info.size;
  let bytes = 0;
  for (const entry of await readdir(file, { withFileTypes: true }))
    if (!entry.isSymbolicLink()) bytes += await treeSize(path.join(file, entry.name));
  return bytes;
}

export function runtimeService(root) {
  const directory = path.join(root, '.runtime/governance'),
    backups = path.resolve(root, '../backups');
  const policyFile = path.join(root, 'storage-policy.json'),
    trendFile = path.join(directory, 'trend.jsonl');
  let cachedInventory,
    inventoryAt = 0,
    latest,
    lastSample = 0,
    collecting,
    maintenance;
  const client = async () => {
    const c = new ConvexHttpClient('http://127.0.0.1:3210');
    c.setAdminAuth((await json(path.join(root, '.convex/local/default/config.json'))).adminKey);
    return c;
  };
  const query = async (name, args = {}) =>
    (await client()).query(makeFunctionReference('civilization:' + name), args);
  const mutate = async (name, args) =>
    (await client()).mutation(makeFunctionReference('civilization:' + name), args);
  const policy = async () =>
    validatePolicy(
      await json(policyFile, await json(path.join(directory, 'policy.json'), defaultPolicy)),
    );
  async function inventory(force = false) {
    if (!force && cachedInventory && Date.now() - inventoryAt < 300000) return cachedInventory;
    const entries = [];
    for (const entry of await readdir(backups, { withFileTypes: true })) {
      if (
        entry.name.startsWith('.') ||
        entry.name.endsWith('.zip.verified.json') ||
        entry.isSymbolicLink()
      )
        continue;
      const file = path.join(backups, entry.name),
        info = await stat(file);
      const proof = await json(file + '.verified.json', null);
      const proofBytes = proof ? await size(file + '.verified.json') : 0;
      entries.push({
        name: entry.name,
        path: file,
        bytes: (await treeSize(file)) + proofBytes,
        time: info.mtimeMs,
        invalid: entry.isDirectory() && existsSync(path.join(file, 'INVALID.txt')),
        protected: /before-|logical|restic/.test(entry.name),
        type:
          entry.name === 'restic' ? '去重仓库' : entry.isDirectory() ? '目录恢复点' : '快照文件',
        restore:
          entry.isDirectory() && existsSync(path.join(file, 'INVALID.txt'))
            ? '此恢复点已有不完整标记，禁止用于恢复；保留等待人工处理'
            : entry.name === 'restic'
              ? '需本机密码文件；先恢复到隔离目录'
              : '先恢复到 E 盘隔离目录并验证，禁止覆盖运行中的库' +
                (proof?.worldStateExact ? '；生成时已核对完整世界状态与快照 CRC' : ''),
      });
    }
    let snapshots = [],
      error = null;
    try {
      const result = await execute(
        path.resolve(root, '../tools/restic/restic_0.19.1_windows_amd64.exe'),
        [
          '-r',
          path.join(backups, 'restic'),
          '--password-file',
          path.join(backups, '.restic-password'),
          'snapshots',
          '--json',
        ],
        {
          windowsHide: true,
          env: {
            ...process.env,
            RESTIC_CACHE_DIR: path.join(directory, 'restic-cache'),
            TMP: directory,
            TEMP: directory,
          },
          maxBuffer: 8 * 1024 ** 2,
        },
      );
      const protectedBackups = await json(path.join(root, 'storage-protected-backups.json'), {
        snapshots: [],
      });
      const verified = await json(path.join(root, 'storage-verified-restores.json'), {
        snapshots: [],
      });
      snapshots = snapshotRetentionPlan(JSON.parse(result.stdout), root, await policy(), [
        ...protectedBackups.snapshots,
        ...verified.snapshots,
      ]).map((s) => ({
        id: s.id,
        time: new Date(s.time).toISOString(),
        tags: s.tags ?? [],
        protected: s.protected,
        candidate: s.candidate,
        summary: s.summary,
      }));
    } catch {
      error = '备份仓库快照列表暂不可用，目录占用仍可查看';
    }
    let logBytes = 0;
    for (const folder of ['.runtime', '.runtime/storage', '.runtime/governance'])
      for (const entry of await readdir(path.join(root, folder), { withFileTypes: true }))
        if (entry.isFile() && /\.log(?:\.\d+)?$/.test(entry.name))
          logBytes += await size(path.join(root, folder, entry.name));
    const blobBytes = await treeSize(path.join(root, '.convex/local/default/convex_local_storage'));
    cachedInventory = {
      entries,
      snapshots,
      error,
      checkedAt: Date.now(),
      relatedFiles: { logBytes, blobBytes },
    };
    inventoryAt = Date.now();
    await writeFile(
      path.join(directory, 'backup-inventory.json'),
      JSON.stringify(cachedInventory, null, 2),
    );
    return cachedInventory;
  }
  async function collect() {
    await mkdir(directory, { recursive: true });
    const file = path.join(root, '.convex/local/default/convex_local_backend.sqlite3'),
      disk = await statfs(root);
    const [databaseBytes, walBytes, sharedBytes, worlds, startup, currentPolicy] =
      await Promise.all([
        size(file),
        size(file + '-wal'),
        size(file + '-shm'),
        query('storageStats'),
        json(path.join(root, '.runtime/startup.json'), null),
        policy(),
      ]);
    latest = {
      at: Date.now(),
      databaseBytes,
      walBytes,
      sharedBytes,
      freeBytes: disk.bavail * disk.bsize,
      worlds,
      startup,
      policy: currentPolicy,
    };
    if (!lastSample) lastSample = (await trendTail(trendFile)).at(-1)?.at ?? 0;
    if (Date.now() - lastSample >= 60000) {
      appendBounded(
        trendFile,
        JSON.stringify({
          at: latest.at,
          databaseBytes,
          walBytes,
          freeBytes: latest.freeBytes,
          worlds: worlds.map((w) => ({
            worldId: w.worldId,
            running: w.running,
            writes: w.writes,
            writtenChars: w.writtenChars,
            onlineMs: w.onlineMs,
          })),
        }) + '\n',
        trendLimit,
      );
      lastSample = Date.now();
    }
    return latest;
  }
  async function status() {
    if (!collecting)
      collecting = collect().finally(() => {
        collecting = null;
      });
    const value = await collecting;
    const lines = await trendTail(trendFile);
    const inv = await inventory();
    return {
      ...value,
      trend: lines,
      backups: {
        ...inv,
        entries: retentionPlan(inv.entries, value.policy),
        snapshots: inv.snapshots.map((s) => ({ ...s, time: Date.parse(s.time), isoTime: s.time })),
      },
      deletions: await query('deletionJobs'),
      maintenance: maintenance ?? null,
      backupBytes: inv.entries.reduce((n, e) => n + e.bytes, 0),
      restore: await json(path.join(directory, 'restore-verification.json'), null),
      audit: await json(path.join(directory, 'database-audit.json'), null),
      duplicates: await json(path.join(directory, 'backup-duplicates.json'), null),
      lastMaintenance: await json(path.join(directory, 'rebuild.json'), null),
      retentionVerification: await json(path.join(directory, 'retention-existing.json'), null),
      lifecycle: {
        logMaxBytes: logLimit.maxBytes,
        logArchives: logLimit.keep,
        trendMaxBytes: trendLimit.maxBytes,
        trendArchives: trendLimit.keep,
        tempKeepDays: 7,
        backupRetention: await json(path.join(root, '.runtime/storage/retention.json'), null),
      },
    };
  }
  async function backup(worldId) {
    const expected = await query('get', { worldId });
    const destination = path.join(
      backups,
      'before-world-deletion-' + new Date().toISOString().replace(/[:.]/g, '-') + '.zip',
    );
    await execute(
      process.execPath,
      [
        path.join(root, 'node_modules/convex/bin/main.js'),
        'export',
        '--include-file-storage',
        '--path',
        destination,
      ],
      {
        cwd: root,
        windowsHide: true,
        env: { ...process.env, TEMP: directory, TMP: directory },
        timeout: 300000,
        maxBuffer: 2 * 1024 ** 2,
      },
    );
    if ((await size(destination)) === 0) throw new Error('恢复快照未生成');
    const expectedFile = path.join(directory, 'deletion-expected-' + randomUUID() + '.json');
    try {
      await writeFile(expectedFile, JSON.stringify(convexToJson(expected.state)), { flag: 'wx' });
      try {
        await execute(
          'python',
          [
            path.join(root, 'scripts/verify-deletion-snapshot.py'),
            destination,
            worldId,
            expectedFile,
          ],
          {
            cwd: root,
            windowsHide: true,
            timeout: 120000,
            env: { ...process.env, TMP: directory, TEMP: directory },
            maxBuffer: 1024 ** 2,
          },
        );
      } catch (error) {
        appendLog(
          path.join(directory, 'deletion-verify-error.log'),
          new Date().toISOString() + ' ' + (error.stderr ?? error.message) + '\n',
        );
        throw new Error(
          error.code === 'ENOENT'
            ? '无法启动快照校验工具，请检查本机 Python；尚未删除数据。'
            : '恢复快照校验未通过，尚未删除数据。请检查维护日志后重试。',
        );
      }
    } finally {
      await unlink(expectedFile).catch(() => {});
    }
    const raw = await readFile(destination);
    const checksum = createHash('sha256').update(raw).digest('hex');
    await writeFile(
      destination + '.verified.json',
      JSON.stringify(
        { worldId, checksum, worldStateExact: true, verifiedAt: new Date().toISOString() },
        null,
        2,
      ),
    );
    return { path: destination, checksum };
  }
  async function deletion(action) {
    let jobId = action.jobId;
    if (!jobId) {
      const list = await query('list'),
        world = list.find((w) => w.id === action.worldId);
      if (
        !world ||
        world.id === 'mh7fm2xg8twftrfgzsvkk9bfvh8h1wn4' ||
        world.running ||
        action.confirmation !== world.name
      )
        throw new Error('世界受保护、仍在运行或名称确认不符');
      const before = (await query('storageStats')).find((w) => w.worldId === world.id);
      maintenance.stage = '正在创建完整恢复快照';
      const destination = await backup(world.id);
      jobId = await mutate('beginDeletion', {
        worldId: world.id,
        backup: destination.path,
        backupChecksum: destination.checksum,
        confirmation: action.confirmation,
        expectedUpdated: before.updated,
        expectedWrites: before.writes,
      });
    }
    maintenance.jobId = jobId;
    const job = (await query('deletionJobs')).find((j) => j._id === jobId);
    if (!job) throw new Error('删除任务不存在');
    if (job.status === 'done') return;
    const recovery = await readFile(job.backup);
    if (
      !recovery.length ||
      (job.backupChecksum &&
        createHash('sha256').update(recovery).digest('hex') !== job.backupChecksum)
    )
      throw new Error('恢复快照缺失或校验失败，已停止删除');
    maintenance.jobId = jobId;
    maintenance.stage = '分批删除中';
    for (;;) {
      const job = await mutate('deletionBatch', { jobId });
      maintenance.removed = job.removed;
      if (job.status === 'done') break;
    }
    maintenance.stage = '逻辑删除完成，文件空间由后台另行回收';
  }
  return {
    name: 'local-runtime-storage',
    configureServer(server) {
      mkdir(directory, { recursive: true })
        .then(() => {
          if (!collecting)
            collecting = collect()
              .catch(() => {})
              .finally(() => {
                collecting = null;
              });
        })
        .catch(() => {});
      const timer = setInterval(() => {
        if (!collecting)
          collecting = collect()
            .catch(() => {})
            .finally(() => {
              collecting = null;
            });
      }, 60000);
      timer.unref();
      server.httpServer?.once('close', () => clearInterval(timer));
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/__local/runtime')) return next();
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        try {
          if (
            !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) ||
            !/^127\.0\.0\.1:5173$/.test(req.headers.host ?? '')
          )
            throw new Error('仅允许本机访问');
          if (req.method === 'GET') {
            res.end(JSON.stringify(await status()));
            return;
          }
          if (
            req.method !== 'POST' ||
            req.headers.origin !== 'http://127.0.0.1:5173' ||
            !req.headers['content-type']?.startsWith('application/json')
          )
            throw new Error('请求来源不符');
          let body = '';
          for await (const chunk of req) {
            body += chunk;
            if (body.length > 8192) throw new Error('请求过大');
          }
          const action = JSON.parse(body);
          if (action.action === 'policy') {
            const value = validatePolicy(action.policy);
            await writeFile(policyFile, JSON.stringify(value, null, 2));
            inventoryAt = 0;
            res.end(JSON.stringify({ saved: true }));
            return;
          }
          if (action.action === 'refresh') {
            await inventory(true);
            res.end(JSON.stringify({ refreshed: true }));
            return;
          }
          if (action.action !== 'delete' && action.action !== 'retry')
            throw new Error('未知维护操作');
          if (maintenance?.running) throw new Error('已有维护任务进行中');
          maintenance = { running: true, stage: '检查中', startedAt: Date.now() };
          deletion(action)
            .then(() => {
              maintenance.running = false;
              inventoryAt = 0;
            })
            .catch(async (error) => {
              maintenance.running = false;
              maintenance.error = error.message;
              if (maintenance.jobId)
                await mutate('deletionFailure', {
                  jobId: maintenance.jobId,
                  error: error.message,
                }).catch(() => {});
            });
          res.end(JSON.stringify({ started: true }));
        } catch (error) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: error.message }));
        }
      });
    },
  };
}
