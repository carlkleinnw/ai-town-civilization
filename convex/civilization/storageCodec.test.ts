import { heartbeat } from './clock';
import { clone, createWorld } from './engine';
import { joinWorld, splitWorld, changedParts } from './storageCodec';

describe('lossless civilization storage', () => {
  test('round-trips every simulation field, optional fields, and array ordering', () => {
    const w = createWorld({ name: 'Storage', seed: 'storage', authority: 'human' });
    w.ruins = [];
    w.ledgerCompensation = { food: 1e-12 };
    const packed = splitWorld(w);
    expect(joinWorld(packed.core, packed.parts)).toEqual(w);
    expect(JSON.stringify(packed.core).length).toBeLessThan(JSON.stringify(w).length / 5);
    expect(changedParts(packed.parts, packed.parts)).toEqual([]);
  });

  test('a clock-only heartbeat does not rewrite map, people, or history', () => {
    const w = createWorld({ name: 'Clock', seed: 'storage', authority: 'human' });
    const before = splitWorld(w);
    heartbeat(w);
    const after = splitWorld(w);
    expect(changedParts(before.parts, after.parts)).toEqual([]);
    expect(after.core).not.toEqual(before.core);
  });

  test('writes only the changed map chunk and person, preserving exact numbers', () => {
    const w = createWorld({ name: 'Changes', seed: 'storage', authority: 'human' });
    const before = splitWorld(clone(w));
    w.tiles[41].food -= 0.123456789;
    w.people[0].x += 1;
    const after = splitWorld(w);
    expect(
      changedParts(before.parts, after.parts)
        .map((p) => p.key)
        .sort(),
    ).toEqual(['people:0', 'tiles:1']);
    expect(joinWorld(after.core, after.parts)).toEqual(w);
  });

  test('rejects missing chunks rather than silently inventing a partial world', () => {
    const w = createWorld({ name: 'Missing', seed: 'storage', authority: 'human' });
    const packed = splitWorld(w);
    expect(() => joinWorld(packed.core, packed.parts.slice(1))).toThrow(/Missing/);
  });

  test('shrinking and removing optional arrays preserves the current world exactly', () => {
    const w = createWorld({ name: 'Resize', seed: 'storage', authority: 'human' });
    w.people = w.people.slice(1, 3);
    delete w.ruins;
    const packed = splitWorld(w);
    expect(joinWorld(packed.core, packed.parts)).toEqual(w);
  });

  test('storage round-trips preserve the same real simulation over 120 heartbeats', () => {
    const expected = createWorld({ name: 'Engine', seed: 'storage', authority: 'human' });
    let actual = clone(expected);
    let written = 0,
      full = 0;
    for (let i = 0; i < 120; i++) {
      const before = splitWorld(actual);
      heartbeat(expected);
      heartbeat(actual);
      const packed = splitWorld(actual);
      written +=
        JSON.stringify(packed.core).length +
        changedParts(before.parts, packed.parts).reduce(
          (n, p) => n + JSON.stringify(p.data).length,
          0,
        );
      full += JSON.stringify(actual).length;
      actual = joinWorld(packed.core, packed.parts);
      expect(actual).toEqual(expected);
    }
    expect(written).toBeLessThan(full / 3);
  });
});
