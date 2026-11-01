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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const id = JSON.parse(fs.readFileSync(dir + '/walking-world.json')).id;
  await api('control', { worldId: id, running: false, speed: 1, secondsPerDay: 24 }, 'mutation');
  for (let i = 0; i < 10; i++) {
    await api('control', { worldId: id, step: 1 }, 'mutation');
    const w = (await api('get', { worldId: id })).state;
    if (w.people.some((p) => p.motion && p.route?.steps.length > 1)) break;
  }
  const browser = await chromium.launch({ channel: 'msedge', headless: true }),
    errors = [],
    report = { id };
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } }),
      page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    const url = 'http://127.0.0.1:5173/ai-town/?world=' + id + '&motion-debug=1';
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.locator('[data-motion]').waitFor();
    const sample = () =>
      page.locator('[data-motion]').evaluate((e) => JSON.parse(e.dataset.motion));
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await page.getByRole('button', { name: '暂停', exact: true }).waitFor();
    let tracked;
    for (let i = 0; i < 350; i++) {
      const s = await sample();
      tracked = s.samples.find(
        (p) =>
          p.motion &&
          p.moving &&
          Math.hypot(p.x - p.motion.fromX, p.y - p.motion.fromY) > 0.55 &&
          Math.hypot(p.x - p.motion.fromX, p.y - p.motion.fromY) < 0.8,
      );
      if (tracked) break;
      await sleep(20);
    }
    assert(tracked, 'no suitable fractional walking point');
    await page.getByRole('button', { name: '暂停', exact: true }).click();
    await page.getByRole('button', { name: '继续', exact: true }).waitFor();
    await sleep(100);
    const paused = (await sample()).samples.find((p) => p.id === tracked.id);
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('[data-motion]').waitFor();
    await sleep(100);
    const reloaded = (await sample()).samples.find((p) => p.id === tracked.id);
    report.pauseReloadDistance = Math.hypot(paused.x - reloaded.x, paused.y - reloaded.y);
    assert(report.pauseReloadDistance < 0.04);
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await page.getByRole('button', { name: '暂停', exact: true }).waitFor();
    await context.setOffline(true);
    await sleep(6500);
    const offline = await sample();
    for (const p of offline.samples)
      if (p.motion)
        assert(
          p.x >= Math.min(p.motion.fromX, p.motion.toX) - 1e-6 &&
            p.x <= Math.max(p.motion.fromX, p.motion.toX) + 1e-6 &&
            p.y >= Math.min(p.motion.fromY, p.motion.toY) - 1e-6 &&
            p.y <= Math.max(p.motion.fromY, p.motion.toY) + 1e-6,
        );
    await context.setOffline(false);
    await sleep(2000);
    const recovered = await sample();
    report.offlineBounded = true;
    report.reconnectRecovered = recovered.running;
    await page.screenshot({ path: dir + '/walking-boundary-recovered.png' });
    await page.close();
    await sleep(31500);
    const auto = await api('get', { worldId: id });
    assert.equal(auto.state.running, false);
    assert.equal(auto.pauseReason, 'unobserved');
    report.unobservedAutoPause = true;
    const back = await context.newPage();
    await back.goto(url, { waitUntil: 'networkidle' });
    await sleep(500);
    assert.deepEqual((await api('get', { worldId: id })).state, auto.state);
    report.reopenDoesNotResume = true;
    assert.deepEqual(errors, []);
    report.errors = errors;
  } finally {
    await api('control', { worldId: id, running: false, secondsPerDay: 120 }, 'mutation');
    fs.writeFileSync(dir + '/walking-boundaries.json', JSON.stringify(report, null, 2));
    await browser.close();
  }
  console.log(JSON.stringify(report));
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
