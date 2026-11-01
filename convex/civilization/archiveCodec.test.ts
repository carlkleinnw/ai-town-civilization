import { createWorld } from './engine';
import { canArchive, decodeArchive, encodeArchive, restoreSnapshot } from './archiveCodec';

describe('compressed history and checkpoints', () => {
  test('never archives an unfinished plan or decision', () => {
    for (const status of ['planned', 'executing', 'proposed'])
      expect(canArchive('plan', { status })).toBe(false);
    for (const status of ['waiting', 'queued'])
      expect(canArchive('decision', { status })).toBe(false);
    expect(canArchive('plan', { status: 'completed' })).toBe(true);
    expect(canArchive('decision', { status: 'resolved' })).toBe(true);
    expect(canArchive('event', undefined)).toBe(false);
  });
  test('round-trips a complete checkpoint with exact resource and RNG values', () => {
    const w = createWorld({ name: '压缩存档', seed: 'archive', authority: 'human' });
    const archive = encodeArchive(w);
    expect(restoreSnapshot(archive)).toEqual(w);
    expect(archive.body.byteLength).toBeLessThan(archive.plainBytes / 2);
    expect(restoreSnapshot(w)).toBe(w);
  });
  test('rejects checksum corruption and does not return fabricated history', () => {
    const archive = encodeArchive({ event1: { text: '真正的记录', day: 17 } });
    expect(() => decodeArchive({ ...archive, checksum: archive.checksum + 1 })).toThrow(/checksum/);
  });
  test('retains identities, Chinese text, empty arrays and tiny numeric deltas', () => {
    const value = { p1: { id: 'p1', text: '人物与分支', food: 0.000000123, children: [] } };
    expect(decodeArchive(encodeArchive(value))).toEqual(value);
  });
});
