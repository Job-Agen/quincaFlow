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
const PRECACHE = ['/dashboard', '/login', '/icons/icon-192.png', '/manifest.webmanifest'];

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

  // L'APK : jamais intercepté, jamais mis en cache. Vingt-quatre mébioctets
  // dans le stockage du navigateur ne servent à rien — le fichier part aussitôt
  // vers le dossier Téléchargements — et peuvent faire échouer l'écriture du
  // cache pour tout le reste.
  if (url.pathname.startsWith('/telechargements/')) return;

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
          const cached = (await caches.match(request)) || (await caches.match('/dashboard'));
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


/**
 * Les rappels d'échéance (§68).
 *
 * Le serveur n'envoie que de quoi écrire la notification — un titre, une
 * phrase, un lien. Jamais de montants ni de noms de charges au-delà de ce qui
 * s'affiche : une notification traverse un service de distribution que nous ne
 * tenons pas, et s'affiche sur un écran verrouillé que d'autres voient.
 */
self.addEventListener('push', (event) => {
  let avis = {};
  try {
    avis = event.data ? event.data.json() : {};
  } catch {
    avis = {};
  }

  event.waitUntil(
    self.registration.showNotification(avis.title || 'MaQuincaillerie', {
      body: avis.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      // Une étiquette stable : le rappel du jour remplace celui d'hier au lieu
      // de s'empiler. Un gérant parti trois jours ne doit pas retrouver douze
      // notifications identiques.
      tag: avis.tag || 'charges',
      renotify: true,
      data: { url: avis.url || '/charges' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const cible = (event.notification.data && event.notification.data.url) || '/charges';

  event.waitUntil(
    (async () => {
      const fenetres = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Une fenêtre déjà ouverte est reprise plutôt que doublée : le gérant
      // n'a pas besoin d'un second onglet de son application.
      for (const fenetre of fenetres) {
        if (fenetre.url.includes(cible) && 'focus' in fenetre) return fenetre.focus();
      }
      if (fenetres.length > 0 && 'navigate' in fenetres[0]) {
        await fenetres[0].focus();
        return fenetres[0].navigate(cible);
      }
      return self.clients.openWindow(cible);
    })()
  );
});
