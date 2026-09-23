/**
 * Nada pode entrar na frente da primeira chamada de dados de uma tela.
 *
 * O caminho até o primeiro conteúdo era uma fila de voltas de rede em vez de um
 * lote: /api/runtime-backend resolvia o endereço, /api/auth/me liberava o
 * desenho, /api/parent/children + /api/parent/progress escolhiam a criança, e só
 * então a tela podia pedir o que ela mostra. Cada etapa dependia da anterior
 * terminar, e nenhuma dessas dependências era real quando a resposta já estava
 * em mãos.
 *
 * Estas verificações prendem o formato do que foi arrumado — quem quiser mudar
 * qualquer uma delas está mexendo em quanto tempo o app leva para aparecer.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

function compileTs(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
}

function loadModule(relativePath, { requireStub = () => ({}), env } = {}) {
  const loaded = { exports: {} };
  new Function('exports', 'module', 'require', 'process', compileTs(relativePath))(
    loaded.exports,
    loaded,
    requireStub,
    { env: { NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: '', ...env } },
  );
  return loaded.exports;
}

const read = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');

// ─────────────────────────────────────────────────────────────────────────────
// 1. Resolver o endereço do backend não pode custar uma volta de rede quando
//    esse endereço já está decidido por algo que vence o config remoto.
// ─────────────────────────────────────────────────────────────────────────────
const runtimeBackend = loadModule('../src/lib/runtime-backend.ts');

const VPS_URL = 'https://api.tutorprofessor.com';
const MANUAL_URL = 'https://manual-override.example.com';
const TUNNEL_URL = 'https://published-tunnel.trycloudflare.com';

const RUNTIME_BACKEND_KEY = 'english-kids-tutor.runtime-backend';
const SAVED_URL_KEY = 'english-kids-tutor.api-base-url.v2';

function createLocalStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

/** Carrega api-config com um ambiente, um localStorage e um fetch contado. */
function loadApiConfig({ env = {}, storage = {} } = {}) {
  const calls = [];
  globalThis.window = {
    localStorage: createLocalStorage(storage),
    dispatchEvent: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
  globalThis.Event = class {
    constructor(type) {
      this.type = type;
    }
  };
  globalThis.fetch = (url) => {
    calls.push(String(url));
    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          baseUrl: TUNNEL_URL,
          host: 'published-tunnel.trycloudflare.com',
          updatedAt: '2026-09-14T08:26:23.954Z',
          activatedAt: '2026-09-14T08:26:23.954Z',
          machineName: 'HELBER',
        }),
    });
  };

  const apiConfig = loadModule('../src/lib/api-config.ts', {
    requireStub: (id) => (id === '@/lib/runtime-backend' ? runtimeBackend : {}),
    env,
  });
  return { apiConfig, calls };
}

const publishedTunnel = JSON.stringify({
  baseUrl: TUNNEL_URL,
  host: 'published-tunnel.trycloudflare.com',
  updatedAt: '2026-09-14T08:26:23.954Z',
  activatedAt: '2026-09-14T08:26:23.954Z',
  machineName: 'HELBER',
});

// Domínio fixo na build: o config remoto nunca poderia vencê-lo, então esperar
// por ele só adiava a primeira chamada de verdade.
{
  const { apiConfig, calls } = loadApiConfig({
    env: { NEXT_PUBLIC_API_BASE_URL: VPS_URL },
    storage: { [RUNTIME_BACKEND_KEY]: publishedTunnel },
  });
  assert.equal(await apiConfig.resolveApiBaseUrl(), VPS_URL);
  assert.deepEqual(calls, [], 'um endereço vindo da build não pode esperar /api/runtime-backend');
}

// URL salva à mão: idem, ela está no topo da precedência.
{
  const { apiConfig, calls } = loadApiConfig({
    storage: { [SAVED_URL_KEY]: MANUAL_URL, [RUNTIME_BACKEND_KEY]: publishedTunnel },
  });
  assert.equal(await apiConfig.resolveApiBaseUrl(), MANUAL_URL);
  assert.deepEqual(calls, [], 'uma URL salva no aparelho não pode esperar /api/runtime-backend');
}

// Modo túnel: aí o endereço realmente vem de lá, e a cópia guardada pode estar
// velha — a espera continua, senão o primeiro POST (o login) morre sem repetição.
{
  const { apiConfig, calls } = loadApiConfig({
    storage: { [RUNTIME_BACKEND_KEY]: publishedTunnel },
  });
  assert.equal(await apiConfig.resolveApiBaseUrl(), TUNNEL_URL);
  assert.deepEqual(
    calls,
    ['/api/runtime-backend'],
    'sem endereço fixo, o túnel publicado precisa ser conferido antes da primeira chamada',
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. A escolha da criança ativa só bloqueia enquanto não há uma escolhida.
// ─────────────────────────────────────────────────────────────────────────────
const apiClient = read('../src/lib/api.ts');

assert.match(
  apiClient,
  /if \(getStoredActiveChildId\(\) === null\) \{\s*await syncPreferredChild\(apiBaseUrl\);\s*\} else \{\s*void syncPreferredChild\(apiBaseUrl\)/,
  'com uma criança já escolhida, a revalidação tem de correr junto da chamada, não antes dela',
);

// ─────────────────────────────────────────────────────────────────────────────
// 3. O perfil guardado responde na hora e a conferência avisa quem já desenhou.
// ─────────────────────────────────────────────────────────────────────────────
assert.match(apiClient, /const snapshot = readUserMeSnapshot\(\);/, 'getUserMe precisa poder responder do disco');
assert.match(
  apiClient,
  /void revalidateUserMeInBackground\(\);/,
  'responder do disco sem conferir deixaria uma sessão morta de pé',
);
assert.match(
  apiClient,
  /export function subscribeToUserProfileRevalidation/,
  'as telas precisam de um caminho para receber o resultado da conferência',
);
assert.match(
  apiClient,
  /session: fingerprintSession\(/,
  'o retrato do perfil tem de estar preso à sessão que o produziu',
);
assert.match(
  apiClient,
  /export function isSessionRejection\(error: unknown\) \{\s*return error instanceof ApiError && \(error\.status === 401 \|\| error\.status === 403\);/,
  'só uma recusa de sessão fecha a tela — um 500 ou uma queda de rede não são resposta sobre quem a pessoa é',
);

for (const [file, contents] of [
  ['auth-gate', read('../src/components/auth-gate.tsx')],
  ['use-require-auth', read('../src/hooks/use-require-auth.ts')],
]) {
  assert.match(
    contents,
    /subscribeToUserProfileRevalidation\(/,
    `${file} desenha a partir do perfil guardado, então precisa ouvir a conferência`,
  );
  assert.match(
    contents,
    /if \(!isSessionRejection\(error\)\) return;/,
    `${file} não pode mandar para o login por causa de um erro que não é de sessão`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. O aperto de mão com o backend começa antes da primeira chamada.
// ─────────────────────────────────────────────────────────────────────────────
const layout = read('../src/app/layout.tsx');
assert.match(layout, /rel="preconnect"/, 'o layout deve anunciar a origem da API');
assert.match(layout, /rel="dns-prefetch"/, 'e resolver o DNS dela junto');
assert.match(
  layout,
  /process\.env\.NEXT_PUBLIC_API_BASE_URL\?\.trim\(\)/,
  'só há o que anunciar quando a build conhece o endereço',
);

// ─────────────────────────────────────────────────────────────────────────────
// 5. Uma aba de cada vez aparece; só a dela precisa descer.
// ─────────────────────────────────────────────────────────────────────────────
const studyPage = read('../src/app/study/page.tsx');
for (const tab of ['CodingTab']) {
  assert.match(
    studyPage,
    new RegExp(`const ${tab} = dynamic\\(`),
    `${tab} não abre por padrão e não pode pesar no pacote de quem abre "Estudos"`,
  );
}
assert.doesNotMatch(
  studyPage,
  /^import \{ CodingTab \}/m,
  'importar a aba de programação estaticamente desfaz a separação',
);

const codingCurriculum = read('../src/components/coding/CodingCurriculum.tsx');
for (const view of ['TopicView', 'FlashcardDeck', 'ReviewSession', 'LeetCodeTrainer']) {
  assert.match(
    codingCurriculum,
    new RegExp(`const ${view} = dynamic\\(`),
    `${view} troca a tela inteira e só precisa chegar quando for aberta`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. O relógio do pomodoro só redesenha a página quando o mostrador muda.
// ─────────────────────────────────────────────────────────────────────────────
const pomodoro = loadModule('../src/lib/pomodoro.ts');
const now = 1_760_000_000_000;
const running = {
  ...pomodoro.createInitialPomodoroState(),
  running: true,
  startedAt: now,
  endsAt: now + 90_000,
  seconds: 90,
  sessionId: 'sessao-1',
};

assert.equal(
  pomodoro.resolvePomodoroState(running, now),
  running,
  'conferir o relógio no mesmo segundo tem de devolver o mesmo objeto, para o React parar aí',
);
assert.notEqual(
  pomodoro.resolvePomodoroState(running, now + 1_000),
  running,
  'quando o segundo vira, o mostrador precisa mesmo mudar',
);
assert.equal(pomodoro.resolvePomodoroState(running, now + 1_000).seconds, 89);

console.log('First-request latency checks passed.');
