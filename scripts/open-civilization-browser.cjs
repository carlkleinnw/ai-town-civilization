const fs = require('node:fs');
const assert = require('node:assert/strict');
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
  fs.mkdirSync(dir, { recursive: true });
  const file = dir + '/walking-world.json';
  const id = fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file)).id
    : await api(
        'create',
        {
          name: '验收·连续步行（测试世界）',
          seed: 'walking-open-20261027',
          population: 8,
          strategy: 'survival',
          authority: 'human',
          persistence: 'locked',
        },
        'mutation',
      );
  fs.writeFileSync(file, JSON.stringify({ id }));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const errors = [],
    report = { id, errors, modes: [] };
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    page.on('pageerror', (e) => errors.push(e.message));
    await api('control', { worldId: id, running: false, speed: 1 }, 'mutation');
    await page.goto('http://127.0.0.1:5173/ai-town/?world=' + id + '&motion-debug=1', {
      waitUntil: 'networkidle',
    });
    const sample = () =>
      page.locator('[data-testid="world-map"]').evaluate((e) => JSON.parse(e.dataset.motion));
    await page.locator('canvas').waitFor();
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await page.getByRole('button', { name: '暂停', exact: true }).waitFor();
    for (const speed of [1, 0.25, 120, 1]) {
      if (speed <= 1) {
        await page.getByRole('button', { name: '暂停', exact: true }).click();
        await page.getByRole('button', { name: '继续', exact: true }).waitFor();
        for (let attempt = 0; attempt < 15; attempt++) {
          await api('control', { worldId: id, step: 1 }, 'mutation');
          const state = (await api('get', { worldId: id })).state;
          if (state.people.some((p) => p.motion && p.route?.steps.length >= 2)) break;
        }
        await page.getByRole('button', { name: '继续', exact: true }).click();
        await page.getByRole('button', { name: '暂停', exact: true }).waitFor();
      }
      await page.getByLabel('模拟速度', { exact: true }).selectOption(String(speed));
      await sleep(600);
      const samples = [],
        duration = speed === 0.25 ? 22000 : speed === 120 ? 2200 : 14000;
      const start = Date.now();
      let shot = 0;
      while (Date.now() - start < duration) {
        samples.push(await sample());
        if (speed === 1 && Date.now() - start > 6500 + shot * 2500 && shot < 3) {
          await page.screenshot({ path: `${dir}/walk-${report.modes.length}-${shot++}.png` });
        }
        await sleep(90);
      }
      let smooth = 0,
        maxJump = 0,
        movingFrames = new Set(),
        corners = 0;
      const last = new Map();
      for (const tick of samples)
        for (const p of tick.samples) {
          const prev = last.get(p.id);
          if (prev) {
            const distance = Math.hypot(p.x - prev.x, p.y - prev.y);
            maxJump = Math.max(maxJump, distance);
            if (distance > 0.00001 && distance < 0.2) smooth++;
            if (p.direction !== prev.direction && p.moving && prev.moving) corners++;
            if (p.motion && prev.motion && p.motion.start === prev.motion.start) {
              assert(
                Math.abs(p.x - prev.x) < 0.00001 || Math.abs(p.y - prev.y) < 0.00001,
                'edge cut diagonally',
              );
            }
          }
          if (p.moving) movingFrames.add(p.frame);
          last.set(p.id, p);
        }
      if (speed <= 1) console.log('walking evidence', smooth, [...movingFrames]);
      report.modes.push({ speed, smooth, maxJump, corners, frames: [...movingFrames], samples });
      console.log(JSON.stringify({ speed, smooth, maxJump, corners, frames: [...movingFrames] }));
      if (speed <= 1) {
        assert(smooth > 10, 'not continuously walking');
        assert(movingFrames.size >= 2, 'no walking frames');
      }
    }
    await page.getByRole('button', { name: '暂停', exact: true }).click();
    await page.getByRole('button', { name: '继续', exact: true }).waitFor();
    await sleep(250);
    const frozen = await sample();
    await sleep(1600);
    assert.deepEqual(
      (await sample()).samples.map((p) => [p.x, p.y]),
      frozen.samples.map((p) => [p.x, p.y]),
    );
    report.pauseFrozen = true;
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal((await sample()).running, false);
    report.reloadPaused = true;
    assert.deepEqual(errors, []);
  } finally {
    await api('control', { worldId: id, running: false, speed: 1 }, 'mutation');
    fs.writeFileSync(dir + '/walking-browser.json', JSON.stringify(report));
    await browser.close();
  }
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
