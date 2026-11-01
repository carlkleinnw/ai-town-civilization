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
  const original = JSON.parse(fs.readFileSync(dir + '/baseline.json'));
  for (const [id, before] of Object.entries(original)) {
    assert.deepEqual((await api('get', { worldId: id })).state, before.state);
    assert.deepEqual(await api('saves', { worldId: id }), before.saves);
    assert.deepEqual(await api('ancestors', { worldId: id }), before.ancestors);
  }
  const all = await api('list'),
    worlds = [];
  for (const w of all) {
    const state = (await api('get', { worldId: w.id })).state;
    worlds.push({
      id: w.id,
      name: w.name,
      running: state.running,
      day: state.day,
      stateBytes: Buffer.byteLength(JSON.stringify(state)),
      events: state.events.length,
      landProjects: state.landProjects?.length ?? 0,
      groups: state.society?.groups.length ?? 0,
      proposals: state.society?.proposals.length ?? 0,
      missions: state.society?.missions.length ?? 0,
    });
  }
  assert.equal(
    worlds.some((w) => w.running),
    false,
  );
  const societyId = JSON.parse(fs.readFileSync(dir + '/society-browser.json')).id;
  const missionId = JSON.parse(fs.readFileSync(dir + '/missions-browser.json')).id;
  const browser = await chromium.launch({ channel: 'msedge', headless: true }),
    errors = [],
    pages = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on('pageerror', (e) => errors.push(e.message));
    for (const [id, tab] of [
      [societyId, 'society'],
      [societyId, 'land'],
      [missionId, 'relations'],
      [societyId, 'history'],
      [missionId, 'compare'],
    ]) {
      await page.goto(`http://127.0.0.1:5173/ai-town/workbench/?world=${id}&tab=${tab}`, {
        waitUntil: 'networkidle',
      });
      if (tab === 'history') {
        const details = page.locator('.civ-timeline details');
        if (await details.count()) await details.first().locator('summary').click();
      }
      await page.screenshot({ path: `${dir}/final-${tab}.png`, fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      assert.equal(overflow, false, `${tab} overflow`);
      pages.push({ tab, overflow });
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
    await page.goto('http://127.0.0.1:5173/ai-town/?world=' + missionId, {
      waitUntil: 'networkidle',
    });
    await page.getByRole('button', { name: '全图', exact: true }).click();
    await page.screenshot({ path: dir + '/final-two-groups.png' });
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await page.getByRole('button', { name: 'Resume', exact: true }).waitFor();
    await page.screenshot({ path: dir + '/final-world-en.png' });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
  for (const [id, before] of Object.entries(original))
    assert.deepEqual((await api('get', { worldId: id })).state, before.state);
  const report = {
    originalWorldsExact: Object.keys(original).length,
    originalSavesExact: true,
    originalAncestorsExact: true,
    allPaused: true,
    worlds,
    pages,
    errors,
    databaseBytes: fs.statSync('.convex/local/default/convex_local_backend.sqlite3').size,
  };
  fs.writeFileSync(dir + '/final-audit.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
