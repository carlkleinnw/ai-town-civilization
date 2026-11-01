import { openSync, closeSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

/** Startup and offline backup use one exclusive file; live owners are never displaced. */
export function acquireStorageLock(file, kind) {
  const value = JSON.stringify({ pid: process.pid, token: randomUUID(), kind });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const descriptor = openSync(file, 'wx');
      try {
        writeFileSync(descriptor, value);
      } finally {
        closeSync(descriptor);
      }
      return () => {
        try {
          if (readFileSync(file, 'utf8') === value) unlinkSync(file);
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const previous = readFileSync(file, 'utf8');
      let owner;
      try {
        owner = JSON.parse(previous);
      } catch {
        throw new Error('Storage operation is starting; try again later');
      }
      if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0)
        throw new Error('Invalid storage lock');
      try {
        process.kill(owner.pid, 0);
      } catch (probe) {
        if (probe.code !== 'ESRCH') throw probe;
        // Only one contender may remove a stale lock. The recovery guard itself
        // is never reclaimed automatically after an interrupted recovery.
        const recovery = file + '.recovery';
        let guard;
        try {
          guard = openSync(recovery, 'wx');
        } catch (error) {
          if (error.code === 'EEXIST')
            throw new Error('Storage lock recovery is busy; try again later');
          throw error;
        }
        try {
          if (readFileSync(file, 'utf8') === previous) unlinkSync(file);
        } finally {
          closeSync(guard);
          unlinkSync(recovery);
        }
        continue;
      }
      throw new Error(`Storage is busy (${owner.kind}); try again when it finishes`);
    }
  }
  throw new Error('Could not acquire storage lock');
}
