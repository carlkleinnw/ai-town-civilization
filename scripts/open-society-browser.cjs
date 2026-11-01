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
  const id = JSON.parse(fs.readFileSync(dir + '/land-browser.json')).branch;
  const browser = await chromium.launch({ channel: 'msedge', headless: true }),
    errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('http://127.0.0.1:5173/ai-town/workbench/?world=' + id + '&tab=society', {
      waitUntil: 'networkidle',
    });
    await page.getByLabel('财产控制', { exact: true }).selectOption('household');
    await page.getByLabel('继承', { exact: true }).selectOption('family');
    await page
      .getByLabel('制度提议原因', { exact: true })
      .fill('验收：家庭保留部分劳动产品，观察成员是否接受');
    await page.getByRole('button', { name: '提交议事并记录人工影响', exact: true }).click();
    await page.getByText(/social.*discussion/).waitFor();
    const proposed = (await api('get', { worldId: id })).state;
    assert.equal(proposed.society.groups[0].rules.property, 'common');
    let state = proposed;
    for (let i = 0; i < 20 && state.society.proposals[0].status === 'discussion'; i++) {
      await api('control', { worldId: id, step: 1 }, 'mutation');
      state = (await api('get', { worldId: id })).state;
    }
    const proposal = state.society.proposals[0];
    assert.equal(proposal.status, 'adopted');
    assert.equal(state.society.groups[0].rules.property, 'household');
    await api('control', { worldId: id, step: 3 }, 'mutation');
    state = (await api('get', { worldId: id })).state;
    const holdings = state.people.filter(
      (p) => p.assets && Object.values(p.assets).some((n) => n > 0),
    );
    assert(holdings.length > 0);
    await page.reload({ waitUntil: 'networkidle' });
    await page.screenshot({ path: dir + '/society-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: dir + '/society-mobile.png', fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(overflow, false);
    assert.deepEqual(errors, []);
    const report = {
      id,
      proposal: proposal.id,
      before: proposal.before,
      after: proposal.after,
      voters: proposal.supporters,
      opponents: proposal.opponents,
      labor: proposal.progress,
      spent: proposal.spent,
      holders: holdings.length,
      proposalNotInstant: true,
      errors,
      overflow,
    };
    fs.writeFileSync(dir + '/society-browser.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
