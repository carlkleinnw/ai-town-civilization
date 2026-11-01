export type HistoryBoundary = { day: number; key: string };
export function historySerial(key: string) {
  const value = Number(key.match(/\d+$/)?.[0] ?? 0);
  if (!Number.isSafeInteger(value)) throw new Error('Invalid history sequence');
  return value;
}
export function compareHistory(a: HistoryBoundary, b: HistoryBoundary) {
  return (
    b.day - a.day ||
    historySerial(b.key) - historySerial(a.key) ||
    (a.key === b.key ? 0 : a.key < b.key ? 1 : -1)
  );
}
export function mergeHistory<T extends HistoryBoundary>(sources: T[][], limit: number) {
  const unique = new Map<string, T>();
  // Nearest descendant wins, including a changed inherited plan or decision.
  for (const rows of sources)
    for (const row of rows) if (!unique.has(row.key)) unique.set(row.key, row);
  const rows = [...unique.values()].sort(compareHistory);
  return { rows: rows.slice(0, limit), hasMore: rows.length > limit };
}
