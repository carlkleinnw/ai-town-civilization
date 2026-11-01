// Additive local verification. All inventory, people and progress come from the existing executor.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const config = JSON.parse(fs.readFileSync('.convex/local/default/config.json', 'utf8'));
async function api(path, args = {}, kind = 'query', internal = false) {
  const r = await fetch('http://127.0.0.1:3210/api/' + kind, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(internal ? { Authorization: 'Convex ' + config.adminKey } : {}),
    },
    body: JSON.stringify({ path, args, format: 'json' }),
  });
  const v = await r.json();
  if (v.status !== 'success') throw Error(v.errorMessage);
  return v.value;
}
const output = '.runtime/civilization/world-correction-demo.json';
if (fs.existsSync(output)) {
  console.log('Existing demo receipt: ' + output);
  process.exit(0);
}
const worldId = await api(
  'civilization:create',
  {
    name: '演示·专属文明·住所建成使用（真实规则）',
    seed: 'river-2026',
    population: 12,
    strategy: 'survival',
    authority: 'ai',
    persistence: 'locked',
  },
  'mutation',
);
await api('civilization:control', { worldId, running: false }, 'mutation');
let w = (await api('civilization:get', { worldId })).state;
assert.equal(w.buildings.length, 0);
assert.equal(w.stock.tools, 0);
const stages = [];
async function checkpoint(name, stage, plan) {
  const saveId = await api('civilization:save', { worldId, name }, 'mutation');
  const branch = await api(
    'civilization:branch',
    { worldId, saveId, name: '演示·专属文明·' + name },
    'mutation',
  );
  stages.push({
    stage,
    worldId: branch,
    saveId,
    day: w.day,
    plan: plan ?? null,
    url: 'http://127.0.0.1:5173/ai-town/?world=' + branch,
  });
}
await checkpoint('自然起点（零建筑）', 'origin');
let tracked;
for (let i = 0; i < 140; i++) {
  await api('civilization:ruleExperiment', { worldId, days: 1 }, 'mutation', true);
  w = (await api('civilization:get', { worldId })).state;
  tracked ??= w.plans.find((p) => p.action === 'hut' && p.status === 'executing')?.id;
  const p = w.plans.find((p) => p.id === tracked);
  if (!p) continue;
  assert(Object.values(w.ledger.injected).every((n) => n === 0));
  if (p.status === 'executing') {
    const r = p.progress / p.labor;
    const stage = r < 0.15 ? 'foundation' : r < 0.5 ? 'frame' : r < 0.8 ? 'walls' : 'roof';
    if (!stages.some((x) => x.stage === stage))
      await checkpoint(
        { foundation: '住所地基', frame: '住所框架', walls: '住所主体', roof: '住所封顶' }[stage],
        stage,
        p,
      );
    assert(!w.buildings.some((b) => b.planId === tracked));
  }
  const b = w.buildings.find((b) => b.planId === tracked);
  if (b && (b.uses ?? 0) > 0) {
    await checkpoint('住所建成并使用', 'complete', p);
    break;
  }
}
assert(stages.some((x) => x.stage === 'complete'));
const built = w.buildings.find((b) => b.planId === tracked);
const record = await api('civilization:plan', { worldId, planId: tracked });
assert(record.paid && record.status === 'completed');
assert(built.uses > 0);
assert.equal(built.x, record.x);
assert.equal(built.y, record.y);
const result = {
  worldId,
  tracked,
  stages,
  built,
  record,
  ledger: w.ledger,
  day: w.day,
  modelBoundary:
    'Actual hourly rules with rule decisions; no inventory or progress injection, no model inference.',
};
fs.writeFileSync(output, JSON.stringify(result, null, 2));
console.log(
  JSON.stringify(
    {
      worldId,
      day: w.day,
      stages: stages.map((s) => ({ stage: s.stage, day: s.day, worldId: s.worldId })),
      built,
    },
    null,
    2,
  ),
);
