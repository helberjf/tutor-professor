/**
 * PWA: o manifest, os icones e as regras de bypass do service worker.
 *
 * O foco esta no bypass. Um service worker que responda no lugar do backend ou
 * que devolva /api/runtime-backend em cache aponta o app para o servidor errado
 * e o problema fica preso no aparelho de quem instalou, ate ele limpar o site.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const url = (relative) => new URL(relative, import.meta.url);
const read = (relative) => readFileSync(url(relative), 'utf8');

// ── Icones ──────────────────────────────────────────────────────────────────
const iconFiles = [
  ['../public/icons/icon-192.png', 1000],
  ['../public/icons/icon-512.png', 3000],
  ['../public/icons/icon-maskable-512.png', 3000],
  // iOS ignora os icones do manifest e usa este; sem ele o atalho no iPhone e
  // no iPad vira uma miniatura da pagina.
  ['../src/app/apple-icon.png', 1000],
  ['../src/app/icon.png', 200],
];

for (const [file, minBytes] of iconFiles) {
  assert.ok(existsSync(url(file)), `${file} deve existir`);
  assert.ok(
    statSync(url(file)).size > minBytes,
    `${file} parece vazio ou truncado`,
  );
  const header = readFileSync(url(file)).subarray(0, 8);
  assert.deepEqual(
    [...header],
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    `${file} precisa ser um PNG de verdade`,
  );
}

// ── Manifest ────────────────────────────────────────────────────────────────
const manifestSource = read('../src/app/manifest.ts');
const compiledManifest = ts.transpileModule(manifestSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

const manifestModule = { exports: {} };
new Function('module', 'exports', 'require', compiledManifest)(
  manifestModule,
  manifestModule.exports,
  require,
);
const manifest = manifestModule.exports.default();

assert.equal(manifest.display, 'standalone', 'o app instalado abre sem a barra do navegador');
assert.equal(manifest.start_url, '/');
assert.equal(manifest.scope, '/');
assert.ok(manifest.name && manifest.short_name, 'manifest precisa de nome');
assert.match(manifest.theme_color, /^#[0-9A-Fa-f]{6}$/);
assert.match(manifest.background_color, /^#[0-9A-Fa-f]{6}$/);

const sizes = manifest.icons.map((icon) => icon.sizes);
assert.ok(sizes.includes('192x192'), 'o manifest precisa do icone 192');
assert.ok(sizes.includes('512x512'), 'o manifest precisa do icone 512');
assert.ok(
  manifest.icons.some((icon) => icon.purpose === 'maskable'),
  'sem um icone maskable o launcher do Android recorta o desenho',
);
for (const icon of manifest.icons) {
  assert.ok(existsSync(url(`../public${icon.src}`)), `${icon.src} referenciado mas ausente`);
}

// ── Metadados de iOS no layout ──────────────────────────────────────────────
const layout = read('../src/app/layout.tsx');
assert.match(layout, /manifest: '\/manifest\.webmanifest'/, 'o layout precisa apontar o manifest');
assert.match(layout, /appleWebApp/, 'o layout precisa dos metadados de iOS');
assert.match(
  layout,
  /'apple-mobile-web-app-capable': 'yes'/,
  'o nome antigo do meta e o que faz o iOS anterior ao 17 abrir em tela cheia',
);

// ── Service worker: as regras que protegem o backend ───────────────────────
const swSource = read('../public/sw.js');
const bypassMatch = swSource.match(/function shouldBypass\(request, url\) \{[\s\S]*?\n\}/);
assert.ok(bypassMatch, 'sw.js precisa de shouldBypass');

const shouldBypass = new Function(
  'self',
  `${bypassMatch[0]}; return shouldBypass;`,
)({ location: { origin: 'https://app.exemplo.com' } });

const cases = [
  ['navegacao do proprio site', { method: 'GET' }, 'https://app.exemplo.com/study', false],
  ['chunk estatico', { method: 'GET' }, 'https://app.exemplo.com/_next/static/a.js', false],
  ['backend em outra origem', { method: 'GET' }, 'https://api.exemplo.com/api/progress', true],
  ['rota /api do proprio site', { method: 'GET' }, 'https://app.exemplo.com/api/runtime-backend', true],
  ['qualquer POST', { method: 'POST' }, 'https://app.exemplo.com/study', true],
];

for (const [label, request, href, expected] of cases) {
  assert.equal(shouldBypass(request, new URL(href)), expected, `bypass errado para ${label}`);
}

assert.match(swSource, /caches\.delete/, 'o sw precisa limpar caches de versoes antigas');
assert.match(swSource, /skipWaiting/, 'o sw precisa poder assumir sem esperar todas as abas');

// ── Registro ────────────────────────────────────────────────────────────────
const registrar = read('../src/components/service-worker-registrar.tsx');
assert.match(
  registrar,
  /NODE_ENV !== 'production'/,
  'em desenvolvimento o registrar tem que remover o service worker, nao instalar',
);
assert.match(registrar, /unregister\(\)/, 'o registrar precisa limpar registros em dev');

console.log('PWA manifest, icons and service worker rules OK.');
