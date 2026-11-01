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
      name: '验收·现场地形工程',
      seed: 'land-page',
      population: 12,
      strategy: 'ecology',
      authority: 'human',
      persistence: 'locked',
    },
    'mutation',
  );
  const before = (await api('get', { worldId: id })).state;
  const tile = before.tiles.findIndex(
    (t) => t.explored && t.terrain === 'forest' && Math.abs(t.x - 12) + Math.abs(t.y - 8) < 4,
  );
  const browser = await chromium.launch({ channel: 'msedge', headless: true }),
    errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('http://127.0.0.1:5173/ai-town/workbench/?world=' + id + '&tab=land', {
      waitUntil: 'networkidle',
    });
    await page.getByLabel('目标地块', { exact: true }).selectOption(String(tile));
    await page.getByLabel('改造行动', { exact: true }).selectOption('clear');
    await page.getByLabel('提议原因', { exact: true }).fill('验收：先到场再清理，保留中间状态');
    await page.getByRole('button', { name: '提出工程并记录人工影响', exact: true }).click();
    await page.getByText('无人到场', { exact: false }).waitFor();
    let state = (await api('get', { worldId: id })).state;
    assert.equal(state.tiles[tile].wood, before.tiles[tile].wood);
    assert.equal(state.landProjects[0].progress, 0);
    await api('control', { worldId: id, step: 3 }, 'mutation');
    state = (await api('get', { worldId: id })).state;
    const project = state.landProjects[0];
    assert(project.progress > 0);
    assert(state.tiles[tile].wood < before.tiles[tile].wood);
    assert(project.workers.length > 0);
    assert(project.progress < project.labor);
    const saveId = await api('save', { worldId: id, name: '现场改造中间状态' }, 'mutation');
    const branch = await api(
      'branch',
      { worldId: id, name: '验收·地形恢复分支', saveId },
      'mutation',
    );
    const fork = (await api('get', { worldId: branch })).state;
    assert.deepEqual(fork.tiles, state.tiles);
    assert.deepEqual(fork.landProjects, state.landProjects);
    assert.deepEqual(fork.people, state.people);
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByLabel('目标地块', { exact: true }).selectOption(String(tile));
    await page.screenshot({ path: dir + '/land-progress.png', fullPage: true });
    await page.getByRole('button', { name: '停止并保留进度', exact: true }).first().click();
    await page.getByText(/cancelled/).waitFor();
    const stopped = (await api('get', { worldId: id })).state;
    assert.deepEqual(stopped.tiles[tile].wood, state.tiles[tile].wood);
    assert.equal(stopped.landProjects[0].progress, project.progress);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: dir + '/land-mobile.png', fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(overflow, false);
    assert.deepEqual(errors, []);
    const report = {
      id,
      branch,
      tile,
      project: project.id,
      labor: project.progress,
      workers: project.workers,
      woodBefore: before.tiles[tile].wood,
      woodAfter: state.tiles[tile].wood,
      noRemoteEffect: true,
      reloadAndForkExact: true,
      cancelledRetainsWork: true,
      overflow,
      errors,
    };
    fs.writeFileSync(dir + '/land-browser.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
