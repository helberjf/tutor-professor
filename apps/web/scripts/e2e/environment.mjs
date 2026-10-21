import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { API_URL, WEB_URL, assertWorkspace, cleanEnvironment } from './safety.mjs';

const webDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repoDir = resolve(webDir, '../..');

async function requireFreePort(port) {
  await new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.once('error', () => reject(new Error(`E2E: porta ${port} ocupada; não vou reutilizar outro servidor.`)));
    probe.listen(port, '127.0.0.1', () => probe.close(resolvePort));
  });
}

export async function waitFor(url, children, timeout = 120_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (children.some(child => child.exitCode !== null)) throw new Error('E2E: um servidor encerrou durante a inicialização.');
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return response;
    } catch { /* bounded polling; no application sleeps in tests */ }
    await new Promise(resolveWait => setTimeout(resolveWait, 250));
  }
  throw new Error(`E2E: tempo esgotado ao iniciar ${url}`);
}

export async function startEnvironment({ onStop = async () => {} } = {}) {
  await requireFreePort(3100);
  await requireFreePort(8100);
  const root = mkdtempSync(join(tmpdir(), 'tutor-e2e-'));
  const runId = randomUUID();
  writeFileSync(join(root, '.e2e-owner'), runId);
  const children = [];
  let stopping;
  let controlTimer;
  const stop = () => stopping ||= (async () => {
    const requestedShutdown = existsSync(join(root, '.shutdown'));
    clearInterval(controlTimer);
    await onStop();
    await Promise.all(children.map(child => new Promise(resolveStop => {
      if (child.exitCode !== null) return resolveStop();
      child.once('exit', resolveStop);
      if (process.platform === 'win32') {
        // Only PIDs returned by our own spawn calls; Next forks its server worker.
        spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      } else {
        try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
      }
      const timer = setTimeout(() => {
        if (process.platform !== 'win32') { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already stopped */ } }
        resolveStop();
      }, 5000);
      timer.unref();
    })));
    assertWorkspace(root, runId);
    // Remove the junction itself first; never recurse into the real dependencies.
    const modules = join(root, 'web', 'node_modules');
    if (existsSync(modules)) rmSync(modules, { recursive: false, force: true });
    rmSync(root, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 });
    if (requestedShutdown) writeFileSync(join(tmpdir(), `tutor-e2e-${runId}.stopped`), runId);
    for (const signal of ['SIGINT', 'SIGTERM']) process.removeListener(signal, shutdown);
  })();
  const shutdown = async () => { await stop(); process.exit(0); };
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, shutdown);
  // Playwright force-kills webServer on Windows. Its global teardown requests
  // this graceful, marker-checked shutdown first, allowing owned temp cleanup.
  controlTimer = setInterval(() => {
    if (!stopping && existsSync(join(root, '.shutdown'))) void shutdown();
  }, 250);
  controlTimer.unref();
  const env = {
    ...cleanEnvironment(), APP_ENV: 'test', PYTHONUTF8: '1', PYTHONUNBUFFERED: '1',
    E2E_RUN_ID: runId, E2E_WORKSPACE: root,
    DATABASE_URL: `sqlite:///${join(root, 'e2e.sqlite').replaceAll('\\', '/')}`,
    SESSION_SECRET: `e2e-${randomUUID()}-${randomUUID()}`, ADMIN_EMAIL: 'admin@e2e.invalid',
    ALLOW_GUEST_ACCESS: 'false', SIGNUP_MODE: 'manual', RUN_STARTUP_MIGRATIONS: 'true',
    EMAIL_PROVIDER: 'console', TTS_PROVIDER: 'none', AUDIO_CACHE_DIR: join(root, 'audio'),
    FRONTEND_BASE_URL: WEB_URL, CORS_ALLOWED_ORIGINS: WEB_URL, PARENT_COOKIE_SECURE: 'false',
    NEXT_PUBLIC_API_BASE_URL: API_URL, NEXT_TELEMETRY_DISABLED: '1', NODE_ENV: 'development',
  };
  try {
    const stagedWeb = join(root, 'web');
    mkdirSync(stagedWeb);
    for (const name of ['src', 'public', 'package.json', 'next.config.mjs', 'tsconfig.json',
      'next-env.d.ts', 'postcss.config.js', 'tailwind.config.ts']) {
      cpSync(join(webDir, name), join(stagedWeb, name), { recursive: true });
    }
    symlinkSync(join(webDir, 'node_modules'), join(stagedWeb, 'node_modules'), 'junction');
    const localPython = join(repoDir, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
    const python = process.env.E2E_PYTHON || (existsSync(localPython) ? localPython : 'python');
    const api = spawn(python, [join(repoDir, 'scripts/e2e/serve_api.py')], {
      cwd: root, env, stdio: 'inherit', windowsHide: true, detached: process.platform !== 'win32',
    });
    api.on('error', error => console.error('E2E Python:', error.message));
    children.push(api);
    const ready = await (await waitFor(`${API_URL}/__e2e__/ready`, children)).json();
    if (ready.run_id !== runId || ready.service !== 'tutor-e2e') throw new Error('E2E: API sem marcador da execução.');
    const web = spawn(process.execPath, [join(webDir, 'node_modules/next/dist/bin/next'), 'dev', stagedWeb,
      '--hostname', '127.0.0.1', '--port', '3100'], {
      cwd: stagedWeb, env: { ...env, NODE_OPTIONS: `--require=${JSON.stringify(join(webDir, 'scripts/e2e/network-guard.cjs'))}` },
      stdio: 'inherit', windowsHide: true, detached: process.platform !== 'win32',
    });
    web.on('error', error => console.error('E2E Next:', error.message));
    children.push(web);
    await waitFor(WEB_URL, children);
    console.log(`E2E isolado: ${WEB_URL} | API ${API_URL} | execução ${runId}`);
    return { root, runId, stop, children, isStopping: () => !!stopping };
  } catch (error) { await stop(); throw error; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const environment = await startEnvironment();
  for (const child of environment.children) child.once('exit', async code => {
    if (environment.isStopping()) return;
    await environment.stop(); process.exit(code || 1);
  });
}
