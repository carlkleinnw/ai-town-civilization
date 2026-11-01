import { gzipSync, gunzipSync, strToU8, strFromU8 } from 'fflate';
import { xxHash32 } from '../util/xxhash';
import type { World } from './model';

export type EncodedArchive = {
  encoding: 'gzip-v1';
  body: ArrayBuffer;
  checksum: number;
  plainBytes: number;
};
const MAX_PLAIN_BYTES = 900000;

export function encodeArchive(value: unknown): EncodedArchive {
  const plain = strToU8(JSON.stringify(value));
  if (plain.length > MAX_PLAIN_BYTES) throw new Error('Archive block too large');
  return {
    encoding: 'gzip-v1',
    body: new Uint8Array(gzipSync(plain, { level: 6, mtime: 0 })).buffer,
    checksum: xxHash32(plain),
    plainBytes: plain.length,
  };
}

export function decodeArchive(archive: EncodedArchive): unknown {
  if (
    archive.encoding !== 'gzip-v1' ||
    !Number.isSafeInteger(archive.plainBytes) ||
    archive.plainBytes < 0 ||
    archive.plainBytes > MAX_PLAIN_BYTES
  )
    throw new Error('Unsupported archive format or size');
  const plain = gunzipSync(new Uint8Array(archive.body), {
    out: new Uint8Array(archive.plainBytes),
  });
  if (plain.length !== archive.plainBytes || xxHash32(plain) !== archive.checksum)
    throw new Error('Archive checksum mismatch');
  return JSON.parse(strFromU8(plain));
}

export function restoreSnapshot(value: World | EncodedArchive): World {
  return 'encoding' in value ? (decodeArchive(value) as World) : value;
}

export function canArchive(kind: string, value: unknown) {
  if (value === undefined) return false;
  const status = value && typeof value === 'object' && 'status' in value ? value.status : null;
  if (kind === 'plan') return ['completed', 'failed', 'rejected'].includes(String(status));
  if (kind === 'land') return ['completed', 'cancelled'].includes(String(status));
  if (kind === 'social') return ['adopted', 'rejected', 'expired'].includes(String(status));
  if (kind === 'mission') return ['completed', 'failed'].includes(String(status));
  if (kind === 'decision') return status === 'resolved';
  return true;
}
