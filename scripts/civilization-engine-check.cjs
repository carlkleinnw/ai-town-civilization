// Run the unchanged pure simulation suites in native Node. Jest's isolated VM is
// extremely slow for long synchronous, arithmetic-heavy multi-generation runs.
const fs = require('node:fs');
const path = require('node:path');
const { buildSync } = require('esbuild');
const { expect } = require('expect');
const tests = [];
global.expect = expect;
global.describe = (_name, body) => body();
global.test = (name, body) => tests.push({ name, body });
fs.mkdirSync('.runtime', { recursive: true });
for (const suite of ['engine', 'clock']) {
  const output = path.resolve(`.runtime/${suite}-verification.cjs`);
  buildSync({
    entryPoints: [`convex/civilization/${suite}.test.ts`],
    outfile: output,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'warning',
  });
  require(output);
}
(async () => {
  const started = performance.now();
  let failed = 0;
  for (const { name, body } of tests) {
    const start = performance.now();
    try {
      await body();
      console.log(`PASS ${name} (${Math.round(performance.now() - start)}ms)`);
    } catch (error) {
      failed++;
      console.error(`FAIL ${name}`, error);
    }
  }
  const report = {
    tests: tests.length,
    passed: tests.length - failed,
    failed,
    milliseconds: Math.round(performance.now() - started),
    runner: 'Native Node, original test bodies and Jest expect assertions; no skipped tests',
  };
  fs.writeFileSync('.runtime/world-correction-engine-report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  process.exitCode = failed ? 1 : 0;
})();
