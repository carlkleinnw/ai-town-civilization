import {
  appendFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import path from 'node:path';

export const logLimit = { maxBytes: 8 * 1024 ** 2, keep: 3 };
export const trendLimit = { maxBytes: 4 * 1024 ** 2, keep: 3 };
function regular(file) {
  if (!existsSync(file)) return false;
  const s = lstatSync(file);
  if (!s.isFile() || s.isSymbolicLink()) throw new Error('技术日志路径不是普通文件');
  return true;
}
/** Called by the one owning process. Archives are technical logs, never game history. */
export function appendBounded(file, data, limit = logLimit) {
  const { maxBytes, keep } = limit;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || !Number.isSafeInteger(keep) || keep < 1)
    throw new Error('Invalid log limit');
  const body = Buffer.isBuffer(data) ? data : Buffer.from(data);
  if (body.length > maxBytes) throw new Error('单条技术记录超过日志容量上限');
  mkdirSync(path.dirname(file), { recursive: true });
  if (regular(file) && statSync(file).size + body.length > maxBytes) {
    // Validate all destinations before removing the oldest archive.
    for (let i = 1; i <= keep; i++) regular(`${file}.${i}`);
    if (existsSync(`${file}.${keep}`)) unlinkSync(`${file}.${keep}`);
    for (let i = keep - 1; i >= 1; i--)
      if (existsSync(`${file}.${i}`)) renameSync(`${file}.${i}`, `${file}.${i + 1}`);
    // An oversized pre-existing log is archived once; subsequent archives are bounded.
    renameSync(file, `${file}.1`);
  }
  appendFileSync(file, body);
}
export function appendLog(file, data) {
  const body = Buffer.isBuffer(data) ? data : Buffer.from(data);
  for (let offset = 0; offset < body.length; offset += logLimit.maxBytes)
    appendBounded(file, body.subarray(offset, offset + logLimit.maxBytes));
}
function noLinks(file) {
  const s = lstatSync(file);
  if (s.isSymbolicLink()) throw new Error('临时目录包含链接，未清理');
  if (s.isDirectory()) for (const entry of readdirSync(file)) noLinks(path.join(file, entry));
}
/** Startup only, before launching children. Unknown directories and evidence are untouched. */
export function cleanExpiredTemp(root, now = Date.now(), days = 7) {
  const removed = [];
  for (const relative of ['.runtime/temp', '.runtime/storage/temp']) {
    const base = path.resolve(root, relative);
    if (!existsSync(base)) continue;
    let ancestor = path.resolve(root);
    for (const segment of relative.split('/')) {
      ancestor = path.join(ancestor, segment);
      if (lstatSync(ancestor).isSymbolicLink()) throw new Error('临时目录祖先包含链接，未清理');
    }
    noLinks(base);
    for (const entry of readdirSync(base)) {
      const file = path.resolve(base, entry);
      if (path.dirname(file) !== base) throw new Error('临时目录越界');
      // A directory's own mtime does not describe recent writes in its descendants.
      const newest = (p) => {
        const s = lstatSync(p);
        return s.isDirectory()
          ? readdirSync(p).reduce(
              (latest, n) => Math.max(latest, newest(path.join(p, n))),
              s.mtimeMs,
            )
          : s.mtimeMs;
      };
      if (now - newest(file) <= days * 86400000) continue;
      rmSync(file, { recursive: true });
      removed.push(file);
    }
  }
  return removed;
}
