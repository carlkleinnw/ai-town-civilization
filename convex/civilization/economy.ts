import { World, Plan, Resource } from './model';

export function publicStock(w: World): Record<Resource, number> {
  const stock = { ...w.stock };
  for (const p of w.people)
    if (p.assets) for (const r of Object.keys(stock) as Resource[]) stock[r] -= p.assets[r];
  for (const g of w.society?.groups ?? [])
    for (const r of Object.keys(stock) as Resource[]) stock[r] -= g.treasury[r];
  return stock;
}
export function availableStock(w: World, groupId?: string): Record<Resource, number> {
  const g = w.society?.groups.find((g) => g.id === groupId);
  return g && g.id !== w.society?.groups[0]?.id ? { ...g.treasury } : publicStock(w);
}
export function canPay(w: World, cost: Plan['cost'], groupId?: string) {
  const stock = availableStock(w, groupId);
  return Object.entries(cost).every(
    ([key, n]) => Number.isFinite(n) && n >= 0 && stock[key as Resource] + 1e-8 >= n,
  );
}

/** Compensated sums keep long runs with fractional hourly labor numerically balanced. */
export function ledgerAdd(
  w: World,
  category: keyof World['ledger'],
  key: Resource,
  amount: number,
) {
  w.ledgerCompensation ??= {};
  const id = `${category}.${key}`;
  const adjusted = amount - (w.ledgerCompensation[id] ?? 0);
  const before = w.ledger[category][key];
  const next = before + adjusted;
  w.ledgerCompensation[id] = next - before - adjusted;
  w.ledger[category][key] = next;
}
export function pay(
  w: World,
  cost: Plan['cost'],
  category: 'spent' | 'consumed' | 'tradedOut' = 'spent',
  groupId?: string,
) {
  if (!canPay(w, cost, groupId)) return false;
  const g = w.society?.groups.find((g) => g.id === groupId && g.id !== w.society?.groups[0]?.id);
  for (const [key, n] of Object.entries(cost)) {
    if (g) g.treasury[key as Resource] -= n;
    w.stock[key as Resource] -= n;
    ledgerAdd(w, category, key as Resource, n);
  }
  return true;
}
export function add(
  w: World,
  key: Resource,
  amount: number,
  category: 'gathered' | 'produced' | 'tradedIn',
  groupId?: string,
) {
  w.stock[key] += amount;
  const group = w.society?.groups.find(
    (g) => g.id === groupId && g.id !== w.society?.groups[0]?.id,
  );
  if (group) group.treasury[key] += amount;
  ledgerAdd(w, category, key, amount);
}
