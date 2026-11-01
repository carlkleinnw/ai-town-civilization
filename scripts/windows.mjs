import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { matchesLauncher } from './windowsProcess.mjs';
import { acquireStorageLock } from './storageLock.mjs';
import { appendLog, cleanExpiredTemp } from './storageLifecycle.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(scriptPath), '..');
const runtime = path.join(root, '.runtime');
const pidFile = path.join(runtime, 'windows-process.json');
const children = new Set();
const runtimeOwners = new Set();
let stopping = false;
let releaseStorageLock;
let ownsProcessRecord = false;
const launchedAt = Date.now();
const startupFile = path.join(runtime, 'startup.json');
let startup = { launchedAt, stages: [], status: 'starting', retry: 'Start-AI-Town.cmd' };
function stage(name) {
  const now = Date.now();
  const previous = startup.stages.at(-1);
  if (previous && !previous.finishedAt) previous.finishedAt = now;
  startup.stages.push({ name, startedAt: now });
  mkdirSync(runtime, { recursive: true });
  writeFileSync(startupFile, JSON.stringify(startup, null, 2));
  console.log(`[${((now - launchedAt) / 1000).toFixed(1)} 秒] ${name}`);
}
function failOwnedProcess(message) {
  if (ownsProcessRecord) {
    startup.status = 'failed';
    startup.error = message;
    startup.failedAt = Date.now();
    stage('服务失败，请查看原因后重试');
  }
  void shutdown(1);
}
process.chdir(root);

function stopTree(pid) {
  return spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
    windowsHide: true,
    stdio: 'ignore',
  }).status;
}
function stopOwnedOrphans(owners) {
  const ids = [...owners].filter((pid) => Number.isSafeInteger(pid) && pid > 0);
  if (!ids.length) return;
  const quote = (value) => value.replaceAll("'", "''");
  const database = quote(path.join(root, '.convex/local/default/convex_local_backend.sqlite3'));
  const binaries = quote(path.join(root, '.runtime/local-app-data/convex/binaries') + path.sep);
  const modules = quote(path.join(root, 'node_modules') + path.sep);
  // A dead CLI parent can leave its native child behind. Check both parent ownership and path.
  const result = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `$owners=@(${ids.join(',')}); Get-CimInstance Win32_Process | Where-Object { $owners -contains $_.ParentProcessId -and $_.ExecutablePath -and (($_.Name -eq 'convex-local-backend.exe' -and $_.ExecutablePath.StartsWith('${binaries}',[StringComparison]::OrdinalIgnoreCase) -and $_.CommandLine.IndexOf('${database}',[StringComparison]::OrdinalIgnoreCase) -ge 0) -or ($_.Name -eq 'esbuild.exe' -and $_.ExecutablePath.StartsWith('${modules}',[StringComparison]::OrdinalIgnoreCase))) } | ForEach-Object { Stop-Process -Id $_.ProcessId -ErrorAction Stop }`,
    ],
    { windowsHide: true, stdio: 'ignore' },
  );
  if (result.status !== 0) console.error('本项目残留进程核对未完成，请检查启动记录后重试停止。');
}
function launcherIdentity(pid) {
  const check = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `$launcher = Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}'; $children = @(Get-CimInstance Win32_Process -Filter 'ParentProcessId = ${pid}' | ForEach-Object { $_.CommandLine }); @{ commandLine = $launcher.CommandLine; children = $children } | ConvertTo-Json -Compress`,
    ],
    { windowsHide: true, encoding: 'utf8' },
  );
  try {
    return JSON.parse(check.stdout);
  } catch {
    throw new Error('Cannot verify the recorded launcher. Nothing was stopped.');
  }
}
async function saveBeforeStop() {
  if (!existsSync(path.join(root, '.convex/local/default/config.json'))) return;
  const config = JSON.parse(
    readFileSync(path.join(root, '.convex/local/default/config.json'), 'utf8'),
  );
  const response = await fetch('http://127.0.0.1:3210/api/mutation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Convex ' + config.adminKey },
    body: JSON.stringify({ path: 'civilization:pauseBeforeShutdown', args: {}, format: 'json' }),
    signal: AbortSignal.timeout(5000),
  });
  const result = await response.json();
  if (!response.ok || result.status !== 'success')
    throw new Error('保存暂停请求未确认；保留上次成功提交的数据');
}

if (process.argv.includes('--stop')) {
  if (!existsSync(pidFile)) {
    console.log('AI Town has no recorded Windows process.');
    process.exit(0);
  }
  const { pid, backendPid, frontendPid } = JSON.parse(readFileSync(pidFile, 'utf8'));
  if (pid === null) {
    console.log('AI Town is already stopped.');
    process.exit(0);
  }
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('Invalid recorded process ID.');
  const identity = launcherIdentity(pid);
  if (!matchesLauncher(identity.commandLine, identity.children ?? [], scriptPath)) {
    throw new Error('Recorded process is no longer this AI Town launcher. Nothing was stopped.');
  }
  try {
    await saveBeforeStop();
  } catch (error) {
    console.error(error.message);
  }
  if (stopTree(pid) !== 0) throw new Error('Could not stop the recorded AI Town process.');
  stopOwnedOrphans([backendPid, frontendPid]);
  writeFileSync(pidFile, JSON.stringify({ pid: null, stopped: new Date().toISOString() }));
  if (existsSync(startupFile)) {
    const previous = JSON.parse(readFileSync(startupFile, 'utf8'));
    writeFileSync(
      startupFile,
      JSON.stringify({ ...previous, status: 'stopped', stoppedAt: Date.now() }, null, 2),
    );
  }
  console.log('AI Town stopped. Your existing Ollama service is left running.');
  process.exit(0);
}

const env = {
  ...process.env,
  ...dotenv.parse(existsSync('.env.windows.local') ? readFileSync('.env.windows.local') : ''),
  CONVEX_AGENT_MODE: 'anonymous',
  CONVEX_LOCAL_BACKEND_STARTUP_TIMEOUT_SECS:
    process.env.CONVEX_LOCAL_BACKEND_STARTUP_TIMEOUT_SECS ??
    String(
      Math.min(
        900,
        120 +
          Math.ceil(
            ((existsSync(path.join(root, '.convex/local/default/convex_local_backend.sqlite3'))
              ? statSync(path.join(root, '.convex/local/default/convex_local_backend.sqlite3')).size
              : 0) /
              1024 ** 3) *
              240,
          ),
      ),
    ),
  LOCALAPPDATA: path.join(runtime, 'local-app-data'),
  CONVEX_TMPDIR: path.join(runtime, 'temp'),
  TMP: path.join(runtime, 'temp'),
  TEMP: path.join(runtime, 'temp'),
};
delete env.NODE_TLS_REJECT_UNAUTHORIZED;
mkdirSync(env.CONVEX_TMPDIR, { recursive: true });

function startNode(args, options = {}) {
  const child = spawn(process.execPath, args, {
    cwd: root,
    env,
    windowsHide: true,
    stdio: 'inherit',
    ...options,
  });
  children.add(child);
  child.on('error', (error) => {
    console.error(error.message);
    failOwnedProcess(error.message);
  });
  child.on('exit', () => children.delete(child));
  return child;
}

function runConvex(args) {
  return new Promise((resolve, reject) => {
    const child = startNode([path.join(root, 'node_modules/convex/bin/main.js'), ...args]);
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`Convex ${args[0]} failed (${code}).`)),
    );
  });
}

async function waitFor(check, description, child, timeout = 120_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (child && child.exitCode !== null) throw new Error(`${description}: process exited.`);
    try {
      if (await check()) return;
    } catch {
      /* Startup may still be in progress. */
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if ((Date.now() - launchedAt) % 10000 < 1100)
      console.log(
        `正在等待 ${description}，总耗时 ${Math.round((Date.now() - launchedAt) / 1000)} 秒。请勿重复启动。`,
      );
  }
  throw new Error(
    `${description} 在 ${Math.round(timeout / 1000)} 秒内未就绪；请查看 .runtime/startup.json 和启动日志，排除原因后重新运行 Start-AI-Town.cmd。`,
  );
}

async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  if (code === 0 && ownsProcessRecord)
    try {
      await saveBeforeStop();
    } catch (error) {
      console.error(error.message);
    }
  for (const child of children) if (child.pid) stopTree(child.pid);
  stopOwnedOrphans(runtimeOwners);
  releaseStorageLock?.();
  if (existsSync(pidFile) && JSON.parse(readFileSync(pidFile, 'utf8')).pid === process.pid) {
    writeFileSync(pidFile, JSON.stringify({ pid: null, stopped: new Date().toISOString() }));
  }
  process.exit(code);
}
process.on('SIGINT', () => shutdown());
process.on('SIGTERM', () => shutdown());

async function main() {
  if (process.platform !== 'win32') throw new Error('Use this launcher on Windows.');
  if (existsSync(pidFile)) {
    const recorded = JSON.parse(readFileSync(pidFile, 'utf8'));
    if (Number.isSafeInteger(recorded.pid) && recorded.pid > 0) {
      const identity = launcherIdentity(recorded.pid);
      if (matchesLauncher(identity.commandLine, identity.children ?? [], scriptPath)) {
        console.log(`项目已在启动或运行中，请使用现有窗口。${recorded.url ?? ''}`);
        return;
      }
    }
  }
  releaseStorageLock = acquireStorageLock(path.join(runtime, 'storage-operation.lock'), 'startup');
  const expiredTemp = cleanExpiredTemp(root);
  writeFileSync(
    path.join(runtime, 'temp-cleanup.json'),
    JSON.stringify({
      at: new Date().toISOString(),
      keepDays: 7,
      removed: expiredTemp,
    }),
  );
  stage('检查本地模型与启动条件');
  const defaults = dotenv.parse(readFileSync('.env.defaults'));
  for (const key of [
    'DOCUMENT_RETENTION_DELAY',
    'INDEX_RETENTION_DELAY',
    'DOCUMENT_RETENTION_BATCH_INTERVAL_SECONDS',
  ])
    if (env[key] !== undefined && (!Number.isFinite(Number(env[key])) || Number(env[key]) <= 0))
      throw new Error(`${key} 配置必须为正数，请修正 .env.windows.local 后重试。`);
  if (
    env.DOCUMENT_RETENTION_DELAY &&
    env.INDEX_RETENTION_DELAY &&
    Number(env.DOCUMENT_RETENTION_DELAY) < Number(env.INDEX_RETENTION_DELAY)
  )
    throw new Error('文档技术版本保留窗口不能短于索引窗口。请修正 .env.windows.local。');
  startup.backendSettings = {
    documentRetentionSeconds: env.DOCUMENT_RETENTION_DELAY
      ? Number(env.DOCUMENT_RETENTION_DELAY)
      : null,
    indexRetentionSeconds: env.INDEX_RETENTION_DELAY ? Number(env.INDEX_RETENTION_DELAY) : null,
    batchIntervalSeconds: env.DOCUMENT_RETENTION_BATCH_INTERVAL_SECONDS
      ? Number(env.DOCUMENT_RETENTION_BATCH_INTERVAL_SECONDS)
      : null,
  };
  console.log('AI Town: native Windows backend + frontend + local Ollama');
  const modelResponse = await fetch(`${defaults.OLLAMA_HOST}/api/tags`, {
    signal: AbortSignal.timeout(5000),
  });
  const models = (await modelResponse.json()).models ?? [];
  for (const name of [defaults.OLLAMA_MODEL, defaults.OLLAMA_EMBEDDING_MODEL]) {
    if (!models.some((model) => model.name === name)) {
      throw new Error(
        `Ollama model ${name} is missing. Install it to a non-C drive before starting.`,
      );
    }
  }
  if (!existsSync('.env.local')) await runConvex(['init']);
  const local = dotenv.parse(readFileSync('.env.local'));
  if (
    !local.CONVEX_DEPLOYMENT?.startsWith('anonymous:') ||
    local.VITE_CONVEX_URL !== 'http://127.0.0.1:3210'
  ) {
    throw new Error('This launcher requires the anonymous local deployment at 127.0.0.1:3210.');
  }
  // Refuse to attach to another project's backend or overwrite its model settings.
  try {
    await fetch(`${local.VITE_CONVEX_URL}/version`, { signal: AbortSignal.timeout(1500) });
    throw new Error('Port 3210 is already in use. Stop the previous local backend first.');
  } catch (error) {
    if (error.message.includes('already in use')) throw error;
  }
  // Record ownership before launching children so Stop also works during a slow load.
  writeFileSync(pidFile, JSON.stringify({ pid: process.pid, launchedAt, status: 'starting' }));
  ownsProcessRecord = true;
  stage('加载数据库与部署后端');
  const backend = startNode(
    [path.join(root, 'node_modules/convex/bin/main.js'), 'dev', '--tail-logs', 'disable'],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  runtimeOwners.add(backend.pid);
  writeFileSync(
    pidFile,
    JSON.stringify({ pid: process.pid, launchedAt, status: 'starting', backendPid: backend.pid }),
  );
  let deployed = false;
  for (const stream of [backend.stdout, backend.stderr])
    stream.on('data', (chunk) => {
      const message = chunk.toString();
      appendLog(path.join(runtime, 'backend-startup.log'), message);
      process.stdout.write(message);
      if (message.includes('Convex functions ready')) deployed = true;
    });
  backend.once('exit', (code) => {
    if (!stopping)
      failOwnedProcess(`后端进程退出 (${code})，请查看 .runtime/backend-startup.log 后重试。`);
  });
  await waitFor(
    async () => {
      if (!deployed) return false;
      const response = await fetch(`${local.VITE_CONVEX_URL}/api/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'world:defaultWorldStatus', args: {}, format: 'json' }),
        signal: AbortSignal.timeout(3000),
      });
      return response.ok && (await response.json()).status === 'success';
    },
    'backend deployment',
    backend,
    Math.max(120_000, (Number(env.CONVEX_LOCAL_BACKEND_STARTUP_TIMEOUT_SECS) + 15) * 1000),
  );
  startup.backendReadyAt = Date.now();
  startup.backendVersion = (
    await (
      await fetch(`${local.VITE_CONVEX_URL}/version`, { signal: AbortSignal.timeout(3000) })
    ).text()
  ).trim();
  await runConvex(['run', 'civilization:pauseAfterRestart']);
  stage('核对模型设置');
  // These settings contain model names and a loopback address, no API credentials.
  const inspected = spawnSync(
    process.execPath,
    [path.join(root, 'node_modules/convex/bin/main.js'), 'env', 'list'],
    { cwd: root, env, windowsHide: true, encoding: 'utf8' },
  );
  if (inspected.status !== 0) throw new Error('无法读取本地模型配置，请检查后端日志后重试');
  const applied = dotenv.parse(inspected.stdout);
  for (const [name, value] of Object.entries(defaults))
    if (applied[name] !== value) await runConvex(['env', 'set', name, value]);
  await runConvex(['run', 'init']);
  stage('启动并检查页面');
  const frontend = startNode([
    path.join(root, 'node_modules/vite/bin/vite.js'),
    '--host',
    '127.0.0.1',
    '--port',
    '5173',
    '--strictPort',
  ]);
  runtimeOwners.add(frontend.pid);
  frontend.once('exit', (code) => {
    if (!stopping) failOwnedProcess(`页面服务退出 (${code})，请检查端口和启动日志后重试。`);
  });
  const url = 'http://127.0.0.1:5173/ai-town/';
  await waitFor(
    async () => (await fetch(url, { signal: AbortSignal.timeout(3000) })).ok,
    'frontend',
    frontend,
    30_000,
  );
  writeFileSync(
    pidFile,
    JSON.stringify(
      {
        pid: process.pid,
        url,
        started: new Date().toISOString(),
        backendPid: backend.pid,
        frontendPid: frontend.pid,
      },
      null,
      2,
    ),
  );
  startup.frontendReadyAt = Date.now();
  startup.status = 'ready';
  stage('服务已就绪');
  releaseStorageLock();
  releaseStorageLock = undefined;
  console.log(`\nAI Town is ready: ${url}\nPress Ctrl+C to stop the town.\n`);
  if (process.argv.includes('--open')) {
    const browser = spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], {
      detached: true,
      windowsHide: true,
      stdio: 'ignore',
    });
    browser.on('error', (error) =>
      console.error(`Open the address above in your browser: ${error.message}`),
    );
    browser.unref();
  }
}

main().catch((error) => {
  if (releaseStorageLock) {
    startup.status = 'failed';
    startup.error = error.message;
    startup.failedAt = Date.now();
    stage('启动失败，请排除原因后重试');
  }
  console.error(
    `\n${error.message}\nStart the Windows Ollama application if its local service is unavailable.`,
  );
  shutdown(1);
});
