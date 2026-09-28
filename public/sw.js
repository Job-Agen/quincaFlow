/**
 * Service worker de MaQuincaillerie.
 *
 * Son rôle est étroit et volontairement conservateur : rendre l'application
 * installable et supporter une coupure réseau de quelques secondes, sans jamais
 * faire croire à un chiffre qui n'est plus vrai.
 *
 * D'où la règle centrale : **rien de ce qui vient de /api n'est mis en cache**.
 * Un stock ou un solde servi depuis le disque, c'est une vente encaissée sur un
 * article déjà parti. En cas de coupure, l'écran affiche une erreur — le gérant
 * sait alors qu'il ne sait pas, ce qui vaut mieux qu'un chiffre périmé présenté
 * comme certain.
 *
 * Les fichiers statiques, eux, sont servis depuis le cache puis rafraîchis en
 * arrière-plan : c'est ce qui fait démarrer l'application sur une connexion
 * lente au lieu de la laisser sur un écran blanc.
 */

const VERSION = 'v1';
const SHELL = `maquincaillerie-shell-${VERSION}`;

/** Ressources suffisantes pour afficher quelque chose hors ligne. */
const PRECACHE = ['/', '/login', '/icons/icon-192.png', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      // Un précache partiellement indisponible ne doit pas empêcher
      // l'installation : chaque entrée est tentée séparément.
      await Promise.allSettled(PRECACHE.map((path) => cache.add(path)));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name !== SHELL).map((name) => caches.delete(name)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Données métier et authentification : toujours le réseau, jamais le cache.
  if (url.pathname.startsWith('/api/')) return;

  // Navigation : le réseau d'abord, pour que l'écran serve la version du jour ;
  // le cache ne prend le relais que si la requête échoue vraiment.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          const cache = await caches.open(SHELL);
          cache.put(request, response.clone());
          return response;
        } catch (error) {
          const cached = (await caches.match(request)) || (await caches.match('/'));
          if (cached) return cached;
          throw error;
        }
      })()
    );
    return;
  }

  // Scripts, styles, images : le cache d'abord, rafraîchi derrière.
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      const network = fetch(request)
        .then((response) => {
          if (response.ok) caches.open(SHELL).then((cache) => cache.put(request, response.clone()));
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })()
  );
});
