/* Only the public, data-free local application shell is cached. Never cache APIs. */
const CACHE = 'quincaflow-app-shell-v2';
const SHELL = '/';
const PAGES = new Set([
  '/',
  '/local',
  '/sales',
  '/products',
  '/customers',
  '/suppliers',
  '/purchases',
  '/cash',
  '/cash/closing',
  '/reports',
  '/more',
  '/backup',
]);
async function prepare(response) {
  if (!response.ok || !response.headers.get('content-type')?.includes('text/html'))
    throw Error('Shell unavailable');
  const html = await response.clone().text();
  const paths = [
    ...new Set(
      [...html.matchAll(/(?:src|href)="([^" ]+)"/g)]
        .map((match) => match[1].replaceAll('&amp;', '&'))
        .filter((path) => path.startsWith('/_next/static/'))
    ),
  ];
  if (!paths.some((path) => path.includes('.js'))) throw Error('Incomplete shell');
  const cache = await caches.open(CACHE);
  await cache.addAll([...paths, '/images/product-categories.webp']);
  // Commit HTML only after every dependency is available offline.
  await cache.put(SHELL, response.clone());
  return response;
}
self.addEventListener('install', (event) =>
  event.waitUntil(prepareRequest().then(() => self.skipWaiting()))
);
async function prepareRequest() {
  return prepare(await fetch(SHELL, { cache: 'reload' }));
}
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('message', (event) => {
  if (event.data?.type === 'STATUS')
    event.waitUntil(
      caches
        .open(CACHE)
        .then((cache) => cache.match(SHELL))
        .then((cached) => event.ports[0]?.postMessage({ ready: Boolean(cached) }))
    );
});
self.addEventListener('fetch', (event) => {
  const request = event.request,
    url = new URL(request.url);
  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/')
  )
    return;
  if (
    request.mode === 'navigate' &&
    PAGES.has(url.pathname === '/' ? '/' : url.pathname.replace(/\/$/, ''))
  ) {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          try {
            if (url.pathname === '/') await prepare(response);
            else event.waitUntil(prepareRequest().catch(() => {}));
          } catch {
            /* Keep last complete version. */
          }
          if (!response.ok) throw Error('Server unavailable');
          return response;
        })
        .catch(
          async () =>
            (await (await caches.open(CACHE)).match(SHELL)) ||
            new Response(
              'Ouvrez une première fois votre boutique avec une connexion pour préparer le mode hors ligne.',
              { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
            )
        )
    );
  } else if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname === '/images/product-categories.webp'
  ) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      })
    );
  }
});
