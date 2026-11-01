import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(
  readFileSync(path.join(root, '.convex/local/default/config.json'), 'utf8'),
);
if (!config.adminKey) throw new Error('Local backend configuration missing; start AI Town first.');
async function request(name, args = {}, kind = 'query') {
  const response = await fetch(`http://127.0.0.1:3210/api/${kind}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Convex ${config.adminKey}` },
    body: JSON.stringify({ path: name, args, format: 'json' }),
  });
  const result = await response.json();
  if (result.status !== 'success')
    throw new Error(result.errorMessage ?? 'Local verification request failed');
  return result.value;
}

const years = Number(process.argv.find((x) => x.startsWith('--years='))?.split('=')[1] ?? 55);
if (!Number.isInteger(years) || years < 1 || years > 100) throw new Error('Years must be 1–100');
console.log('生成小时行动规则演示：明确使用规则决策，不调用或冒充大模型推理。');
const results = [];
const resume = process.argv.find((x) => x.startsWith('--resume='))?.slice('--resume='.length);
for (const [strategy, name] of [
  ['survival', `演示·小时行动·生存（规则${years}年）`],
  ['knowledge', `演示·小时行动·知识（规则${years}年）`],
]) {
  const worldId =
    strategy === 'survival' && resume
      ? resume
      : await request(
          'civilization:create',
          {
            name,
            seed: 'river-2026',
            population: 12,
            strategy,
            authority: 'ai',
            persistence: 'locked',
          },
          'mutation',
        );
  const existing = (await request('civilization:get', { worldId })).state;
  if (
    existing.strategy.id !== strategy ||
    existing.seed !== 'river-2026' ||
    existing.persistence !== 'locked' ||
    (existing.humanInterventions ?? 0) > 0
  )
    throw new Error('Resume requires the matching unmodified rules experiment');
  await request('civilization:control', { worldId, running: false }, 'mutation');
  let day = existing.day,
    batchDays = 30,
    count = 0;
  while (day < years * 360 && !existing.endReason) {
    let result;
    try {
      result = await request(
        'civilization:ruleExperiment',
        { worldId, days: Math.min(batchDays, years * 360 - day) },
        'mutation',
      );
    } catch (error) {
      if (!String(error).includes('execution timed out') || batchDays === 1) throw error;
      // Re-read authoritative time before retrying; never assume a failed response advanced it.
      day = (await request('civilization:get', { worldId })).state.day;
      batchDays = Math.max(1, Math.floor(batchDays / 2));
      console.log(`后端达到事务时限，减小为 ${batchDays} 天/批；已保存至第 ${day} 天。`);
      continue;
    }
    day = result.day;
    if (count++ % 120 === 0 || day === years * 360 || result.extinct)
      console.log(JSON.stringify({ strategy, ...result }));
    if (result.extinct) break;
  }
  const { state } = await request('civilization:get', { worldId });
  const ancestors = await request('civilization:ancestors', { worldId });
  const residuals = Object.fromEntries(
    ['food', 'wood', 'stone', 'tools'].map((key) => [
      key,
      state.stock[key] +
        state.people.reduce(
          (n, p) => n + (p.carrying?.resource === key ? p.carrying.amount : 0),
          0,
        ) -
        (state.ledger.initial[key] +
          state.ledger.gathered[key] +
          state.ledger.produced[key] +
          state.ledger.injected[key] +
          state.ledger.tradedIn[key] -
          state.ledger.consumed[key] -
          state.ledger.spent[key] -
          state.ledger.spoiled[key] -
          state.ledger.tradedOut[key]),
    ]),
  );
  if (Object.values(residuals).some((n) => Math.abs(n) > 0.000001))
    throw new Error('Ledger failed to balance');
  if (state.strategy.id !== strategy) throw new Error('Locked strategy changed');
  const saveId = await request(
    'civilization:save',
    { worldId, name: '长期规则运行验收快照' },
    'mutation',
  );
  results.push({
    worldId,
    saveId,
    strategy,
    day: state.day,
    population: state.people.length,
    births: state.births,
    deaths: state.deaths,
    generations: Math.max(...state.people.concat(ancestors).map((p) => p.generation)) + 1,
    buildings: state.buildings.length,
    technologies: state.technologies,
    ledgerResiduals: residuals,
    state,
    ancestors,
  });
}
const out = path.join(root, '.runtime/civilization');
mkdirSync(out, { recursive: true });
writeFileSync(
  path.join(out, `hourly-${years}-year-results.json`),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      source: 'deterministic hourly actions and daily survival + rule decisions; no LLM inference',
      results,
    },
    null,
    2,
  ),
);
console.log(
  `演示已保存到世界列表；详细结果保存在 .runtime/civilization/hourly-${years}-year-results.json。`,
);
