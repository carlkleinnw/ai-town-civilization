import { mergeHistory, compareHistory } from './historyPage';
test('same-day key boundaries traverse every record once including merged inherited keys', () => {
  const source = Array.from({ length: 251 }, (_, i) => ({
    day: 8,
    key: `e${1000 + i}`,
    text: 'exact',
  }));
  const child = source.slice(0, 80).map((r) => ({ ...r, text: 'child' }));
  let after: (typeof source)[number] | undefined;
  const all: typeof source = [];
  for (let i = 0; i < 20; i++) {
    const sources = [child, source].map((rows) =>
      rows
        .filter((r) => !after || compareHistory(r, after) > 0)
        .sort(compareHistory)
        .slice(0, 38),
    );
    const result = mergeHistory(sources, 37);
    all.push(...result.rows);
    after = result.rows.at(-1);
    if (!result.hasMore) break;
  }
  expect(all).toHaveLength(251);
  expect(new Set(all.map((r) => r.key)).size).toBe(251);
  expect(all.find((r) => r.key === 'e1000')?.text).toBe('child');
});
test('same-day ordering follows the numeric sequence across digit boundaries', () => {
  expect(
    mergeHistory(
      [
        [
          { day: 1, key: 'e999' },
          { day: 1, key: 'e1000' },
          { day: 1, key: 'e99' },
        ],
      ],
      10,
    ).rows.map((r) => r.key),
  ).toEqual(['e1000', 'e999', 'e99']);
});
