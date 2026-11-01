const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('../.runtime/browser-tools/node_modules/playwright-core');
const dir = '.runtime/open-civilization';
fs.mkdirSync(dir, { recursive: true });
async function api(name, args = {}, kind = 'query') {
  const response = await fetch('http://127.0.0.1:3210/api/' + kind, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: 'civilization:' + name, args, format: 'json' }),
  });
  const result = await response.json();
  if (result.status !== 'success') throw Error(result.errorMessage);
  return result.value;
}
(async () => {
  const list = await api('list');
  const baseline = {};
  for (const w of list)
    baseline[w.id] = {
      state: (await api('get', { worldId: w.id })).state,
      saves: await api('saves', { worldId: w.id }),
      ancestors: await api('ancestors', { worldId: w.id }),
    };
  fs.writeFileSync(path.join(dir, 'baseline.json'), JSON.stringify(baseline));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('http://127.0.0.1:5173/ai-town/?world=' + list[0].id, {
      waitUntil: 'networkidle',
    });
    await page.locator('canvas').waitFor();
    await page.screenshot({ path: path.join(dir, 'before.png') });
    console.log(
      JSON.stringify({
        worlds: list.length,
        running: list.filter((w) => w.running).length,
        errors,
      }),
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
