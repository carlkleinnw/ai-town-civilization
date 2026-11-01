// Paired seeds, exact initial terrain/people, no model calls or injected resources.
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
require('esbuild').buildSync({
  entryPoints: ['convex/civilization/engine.ts'],
  outfile: '.runtime/open-civilization/engine.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  logLevel: 'warning',
});
const {
  createWorld,
  advance,
  clone,
  ledgerError,
} = require('../.runtime/open-civilization/engine.cjs');
const seeds = [
  'paired-river-1',
  'paired-river-2',
  'paired-river-3',
  'paired-river-4',
  'paired-river-5',
  'paired-river-6',
];
const strategies = ['agriculture', 'knowledge', 'ecology', 'expansion', 'trade', 'military'];
const results = [],
  started = Date.now();
for (const seed of seeds) {
  const original = createWorld({ name: 'paired', seed, strategy: 'agriculture' });
  for (const strategy of strategies) {
    const w = createWorld({ name: 'paired', seed, strategy });
    assert.deepEqual(w.tiles, original.tiles);
    assert.deepEqual(w.people, original.people);
    const origin = clone(w);
    advance(w, 720);
    for (const error of Object.values(ledgerError(w))) assert(Math.abs(error) < 1e-6);
    const replay = clone(origin);
    advance(replay, 720);
    assert.deepEqual(replay, w);
    const actions = {};
    for (const p of w.plans)
      if (p.progress > 0) actions[p.action] = (actions[p.action] ?? 0) + p.progress;
    const result = {
      seed,
      strategy,
      day: w.day,
      population: w.people.filter((p) => p.died === undefined).length,
      food: w.stock.food,
      soil: w.tiles.reduce((n, t) => n + t.fertility, 0) / w.tiles.length,
      researchLabor: actions.research ?? 0,
      farms: w.buildings.filter((b) => b.kind === 'farm').length,
      landWork: (w.landProjects ?? []).reduce((n, p) => n + p.progress, 0),
      groups: w.society?.groups.length ?? 1,
      adopted: w.society?.proposals.filter((p) => p.status === 'adopted').length ?? 0,
      actions,
    };
    results.push(result);
    console.log(
      JSON.stringify({
        seed,
        strategy,
        population: result.population,
        groups: result.groups,
        researchLabor: result.researchLabor,
        farms: result.farms,
      }),
    );
  }
}
const byStrategy = strategies.map((strategy) => {
  const rows = results.filter((r) => r.strategy === strategy);
  const range = (key) => ({
    min: Math.min(...rows.map((r) => r[key])),
    max: Math.max(...rows.map((r) => r[key])),
    mean: rows.reduce((n, r) => n + r[key], 0) / rows.length,
  });
  return {
    strategy,
    population: range('population'),
    food: range('food'),
    soil: range('soil'),
    researchLabor: range('researchLabor'),
    farms: range('farms'),
    landWork: range('landWork'),
    groups: range('groups'),
  };
});
const report = {
  seeds,
  strategies,
  days: 720,
  results,
  byStrategy,
  exactReplay: true,
  ledgerBalanced: true,
  elapsedMs: Date.now() - started,
  interpretation:
    'Paired initial conditions; later random draws can diverge. Differences describe this finite model and sample, not a proof that any strategy is universally superior.',
};
fs.writeFileSync(
  '.runtime/open-civilization/strategy-comparison.json',
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify({ elapsedMs: report.elapsedMs, byStrategy }));
