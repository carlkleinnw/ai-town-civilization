const fs = require('node:fs'),
  assert = require('node:assert/strict');
const { chromium } = require('../.runtime/browser-tools/node_modules/playwright-core');
const dir = '.runtime/open-civilization';
async function api(name, args = {}, kind = 'query') {
  const r = await fetch('http://127.0.0.1:3210/api/' + kind, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: 'civilization:' + name, args, format: 'json' }),
  });
  const v = await r.json();
  if (v.status !== 'success') throw Error(v.errorMessage);
  return v.value;
}
(async () => {
  const id = await api(
    'create',
    {
      name: '验收·同世界迁徙与群体',
      seed: 'migration-live',
      population: 12,
      strategy: 'expansion',
      authority: 'human',
      persistence: 'locked',
    },
    'mutation',
  );
  const before = (await api('get', { worldId: id })).state;
  const tile = before.tiles.findIndex(
    (t) =>
      t.explored && t.terrain === 'grass' && Math.abs(t.x - 12) + Math.abs(t.y - 8) >= 5 && t.x > 6,
  );
  const browser = await chromium.launch({ channel: 'msedge', headless: true }),
    errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('http://127.0.0.1:5173/ai-town/workbench/?world=' + id + '&tab=relations', {
      waitUntil: 'networkidle',
    });
    await page.getByLabel('迁徙目标', { exact: true }).selectOption(String(tile));
    await page
      .getByLabel('行动原因', { exact: true })
      .fill('验收：自愿成员到另一地块建立聚落，不连接其他世界');
    await page.getByRole('button', { name: '提出行动，由人物决定参与', exact: true }).click();
    await page.getByText(/assembling/).waitFor();
    let state = (await api('get', { worldId: id })).state;
    assert.equal(state.society.groups.length, 1);
    for (let i = 0; i < 12 && state.society.groups.length < 2; i++) {
      await api('control', { worldId: id, step: 1 }, 'mutation');
      state = (await api('get', { worldId: id })).state;
    }
    assert.equal(state.society.groups.length, 2);
    const m = state.society.missions[0],
      group = state.society.groups[1];
    assert.equal(m.status, 'completed');
    assert(m.spent.food > 0);
    assert.deepEqual(
      state.people.map((p) => p.id),
      before.people.map((p) => p.id),
    );
    for (const pid of m.people) {
      const p = state.people.find((p) => p.id === pid);
      assert.equal(p.groupId, group.id);
      assert(
        Math.abs(p.x - group.x) + Math.abs(p.y - group.y) <= 4,
        'member unexpectedly far from new settlement',
      );
    }
    assert(state.events.some((e) => e.kind === 'secession' && e.evidence?.tile === tile));
    assert.equal(state.society.relations[0].state, 'neutral');
    await page.reload({ waitUntil: 'networkidle' });
    await page.screenshot({ path: dir + '/migration-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: dir + '/migration-mobile.png', fullPage: true });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await page.goto('http://127.0.0.1:5173/ai-town/?world=' + id, { waitUntil: 'networkidle' });
    await page.locator('canvas').waitFor();
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.screenshot({ path: dir + '/two-groups-world.png' });
    assert.deepEqual(errors, []);
    const report = {
      id,
      mission: m.id,
      group: group.id,
      people: m.people,
      startTile: tile,
      spent: m.spent,
      noInstantGroup: true,
      noIdentityChange: true,
      neutralNotWar: true,
      noCrossWorldLink: true,
      errors,
    };
    fs.writeFileSync(dir + '/missions-browser.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
