/*
 * Service worker do Tutor and Professor.
 *
 * Escopo deliberadamente pequeno: guardar a casca do app para ele abrir
 * instalado e sobreviver a uma queda de rede. Ele NAO toca no backend.
 *
 * Regras que evitam que este arquivo quebre o app publicado:
 * - so intercepta GET do mesmo domínio; o backend fica em outra origem e passa
 *   direto, sem cache e sem interferencia no cabecalho Authorization;
 * - /api/* nunca e cacheado — /api/runtime-backend resolve a URL do backend em
 *   tempo real e uma resposta velha apontaria o app para o lugar errado;
 * - navegacao e sempre rede primeiro, para uma versao nova do app aparecer
 *   assim que houver rede;
 * - /_next/static/* pode ser cache primeiro porque o nome do arquivo carrega o
 *   hash do conteudo: um arquivo novo tem nome novo.
 */

const VERSION = 'v1';
const SHELL_CACHE = `tutor-shell-${VERSION}`;
const ASSET_CACHE = `tutor-assets-${VERSION}`;
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== ASSET_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** Permite que a pagina peca a ativacao imediata de uma versao nova. */
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

function shouldBypass(request, url) {
  return (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/')
  );
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok && response.type === 'basic') {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const offline = await caches.match(OFFLINE_URL);
      if (offline) return offline;
    }
    throw error;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response && response.ok && response.type === 'basic') {
    const cache = await caches.open(ASSET_CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (shouldBypass(event.request, url)) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirst(event.request));
    return;
  }

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(cacheFirst(event.request));
  }
});
