const fs = require('node:fs'), assert = require('node:assert/strict');
const { chromium } = require('../.runtime/browser-tools/node_modules/playwright-core');
const dir = '.runtime/open-civilization';
async function api(name, args = {}, kind = 'query') {
  const r = await fetch('http://127.0.0.1:3210/api/' + kind, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: 'civilization:' + name, args, format: 'json' }) });
  const v = await r.json(); if (v.status !== 'success') throw Error(v.errorMessage); return v.value;
}
(async () => {
  const id = JSON.parse(fs.readFileSync(dir + '/missions-browser.json')).id;
  const before = (await api('get', { worldId: id })).state, group = before.society.groups[1];
  const target = before.tiles.map((t, i) => ({ ...t, i })).filter(t => t.explored && t.terrain === 'forest' && !t.control).sort((a, b) => Math.abs(a.x - group.x) + Math.abs(a.y - group.y) - Math.abs(b.x - group.x) - Math.abs(b.y - group.y))[0];
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    await page.goto(`http://127.0.0.1:5173/ai-town/workbench/?world=${id}&tab=land`, { waitUntil: 'networkidle' });
    await page.getByLabel('工程所属群体', { exact: true }).selectOption(group.id);
    await page.getByLabel('目标地块', { exact: true }).selectOption(String(target.i));
    await page.getByLabel('改造行动', { exact: true }).selectOption('clear');
    await page.getByLabel('提议原因', { exact: true }).fill('验收：独立聚落自行承接地形劳动与收益');
    await page.getByRole('button', { name: '提出工程并记录人工影响', exact: true }).click();
    await page.getByRole('button', { name: '停止并保留进度', exact: true }).waitFor();
    const initial = (await api('get', { worldId: id })).state;
    assert.equal(initial.landProjects[0].groupId, group.id); assert.equal(initial.landProjects[0].progress, 0);
    await api('control', { worldId: id, step: 3 }, 'mutation');
    const state = (await api('get', { worldId: id })).state, project = state.landProjects[0];
    assert(project.progress > 0); assert(project.workers.every(pid => state.people.find(p => p.id === pid).groupId === group.id));
    assert(state.tiles[target.i].wood < before.tiles[target.i].wood);
    await page.screenshot({ path: dir + '/local-land-progress.png', fullPage: true });
    const report = { id, group: group.id, project: project.id, progress: project.progress, workers: project.workers, woodBefore: before.tiles[target.i].wood, woodAfter: state.tiles[target.i].wood, noRemoteWork: true, groupOwnership: true };
    fs.writeFileSync(dir + '/local-land-browser.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
  } finally { await browser.close(); }
})().catch(e => { console.error(e.stack); process.exitCode = 1; });
