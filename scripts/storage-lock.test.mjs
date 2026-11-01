import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { acquireStorageLock } from './storageLock.mjs';
import { spawnSync } from 'node:child_process';

test('backup and startup cannot overlap; a released owner can be replaced', () => {
  const runtime = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.runtime');
  mkdirSync(runtime, { recursive: true });
  const directory = mkdtempSync(path.join(runtime, 'storage-lock-test-'));
  const file = path.join(directory, 'operation.lock');
  try {
    const release = acquireStorageLock(file, 'backup');
    assert.throws(() => acquireStorageLock(file, 'startup'), /busy/);
    release();
    const next = acquireStorageLock(file, 'startup');
    release(); // A late release cannot erase the next owner's lock.
    assert.throws(() => acquireStorageLock(file, 'backup'), /busy/);
    next();
    writeFileSync(file, '');
    assert.throws(() => acquireStorageLock(file, 'backup'), /starting/);
  } finally {
    if (path.dirname(directory) !== runtime) throw new Error('Unexpected test directory');
    rmSync(directory, { recursive: true });
  }
});

test('only one recovery guard may reclaim a dead owner', () => {
  const runtime = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.runtime');
  const directory = mkdtempSync(path.join(runtime, 'storage-lock-test-'));
  const file = path.join(directory, 'operation.lock');
  try {
    const child = spawnSync(process.execPath, ['-e', ''], { windowsHide: true });
    assert.equal(child.status, 0);
    writeFileSync(file, JSON.stringify({ pid: child.pid, token: 'dead', kind: 'startup' }));
    writeFileSync(file + '.recovery', '');
    assert.throws(() => acquireStorageLock(file, 'backup'), /recovery is busy/);
    rmSync(file + '.recovery');
    const release = acquireStorageLock(file, 'backup');
    assert.throws(() => acquireStorageLock(file, 'startup'), /busy/);
    release();
  } finally {
    if (path.dirname(directory) !== runtime) throw new Error('Unexpected test directory');
    rmSync(directory, { recursive: true });
  }
});
